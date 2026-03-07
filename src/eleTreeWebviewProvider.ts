import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { EleTreeDataProvider } from './eleTreeDataProvider';
import { addMethodToFile, getAtomicFilePath } from './fileOperations';
import { TreeItem } from './treeItem';
import { generateMethodCode } from './utils';

export class EleTreeWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'eleTreeViewer';

    private _view?: vscode.WebviewView;
    private readonly _dataProvider: EleTreeDataProvider;
    private _isFirstLaunch = true;

    constructor(private readonly _extensionUri: vscode.Uri) {
        this._dataProvider = new EleTreeDataProvider();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.command) {
                case 'search':
                    void this._handleSearch(data.keyword);
                    break;
                case 'clearSearch':
                    void this._handleClearSearch();
                    break;
                case 'refresh':
                    void this._handleRefresh();
                    break;
                case 'expandAll':
                    this._handleExpandAll();
                    break;
                case 'collapseAll':
                    this._handleCollapseAll();
                    break;
                case 'openFile':
                    void this._handleOpenFile(data.filePath, data.lineNumber);
                    break;
                case 'dragToEditor':
                    this._handleDragToEditor(data.codePath);
                    break;
                case 'addOperation':
                    this._handleAddOperation(data.element, data.operationType);
                    break;
                case 'batchAddOperation':
                    void this._handleBatchAddOperation(data.elements, data.operationType);
                    break;
                case 'saveState':
                    this._handleSaveState(data.state);
                    break;
                case 'getState':
                    this._handleGetState();
                    break;
            }
        });

        void this._loadData();

        webviewView.onDidChangeVisibility(() => {
            if (!webviewView.visible) {
                return;
            }

            void this._handleRefresh();
            this._postMessage({ command: 'restoreState' });
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        try {
            const htmlPath = path.join(this._extensionUri.fsPath, 'resources', 'eleTreeViewer.html');
            let html = fs.readFileSync(htmlPath, 'utf8');
            const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'eleTreeViewer.js'));
            html = html.replace('src="eleTreeViewer.js"', `src="${jsUri}"`);
            return html;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return `<!DOCTYPE html>
            <html>
            <head><title>Error</title></head>
            <body>
                <h1>加载错误</h1>
                <p>无法加载 Ele Tree Viewer: ${message}</p>
            </body>
            </html>`;
        }
    }

    private async _loadData() {
        try {
            await this._dataProvider.loadData();
            const data = await this._getTreeData();
            this._postMessage({
                command: 'updateData',
                data,
                resetState: this._isFirstLaunch
            });
            this._isFirstLaunch = false;
        } catch (error) {
            console.error('Failed to load ele tree data:', error);
        }
    }

    private async _getTreeData(): Promise<any[]> {
        const items = await this._dataProvider.getChildren();
        return this._convertTreeItems(items);
    }

    private _convertTreeItems(items: TreeItem[]): any[] {
        return items.map(item => ({
            label: typeof item.label === 'string' ? item.label : item.label?.label || '',
            fullPath: item.fullPath,
            codePath: item.codePath,
            isLeaf: item.isLeaf,
            nodeType: item.nodeType,
            tooltip: item.tooltip,
            filePath: item.filePath,
            eleFilePath: item.eleFilePath,
            eleVariableName: item.eleVariableName,
            eleLineNumber: item.eleLineNumber,
            children: item.children ? this._convertTreeItems(item.children) : []
        }));
    }

    private _postMessage(message: any) {
        this._view?.webview.postMessage(message);
    }

    private async _handleSearch(keyword: string) {
        if (keyword) {
            this._dataProvider.applySearchKeyword(keyword);
        } else {
            this._dataProvider.clearSearch();
        }
        await this._pushCurrentData();
    }

    private async _handleClearSearch() {
        this._dataProvider.clearSearch();
        await this._pushCurrentData();
    }

    private async _handleRefresh() {
        await this._loadData();
    }

    private async _pushCurrentData() {
        const data = await this._getTreeData();
        this._postMessage({
            command: 'updateData',
            data,
            resetState: false
        });
    }

    private _handleExpandAll() {
        this._dataProvider.expandAll();
        this._postMessage({ command: 'expandAll' });
    }

    private _handleCollapseAll() {
        this._dataProvider.collapseAll();
    }

    private async _handleOpenFile(filePath: string, lineNumber: number) {
        const normalizedPath = filePath.replace(/[\/\\]+/g, '\\');
        await vscode.commands.executeCommand('eleTreeViewer.openFile', normalizedPath, lineNumber);
    }

    private _handleDragToEditor(codePath: string) {
        const element = {
            codePath,
            isLeaf: true
        };
        void vscode.commands.executeCommand('eleTreeViewer.dragToEditor', element);
    }

    private _handleAddOperation(element: any, operationType: string) {
        const treeItem = new TreeItem(
            element.label || element.fullPath,
            vscode.TreeItemCollapsibleState.None
        );

        treeItem.eleFilePath = element.eleFilePath;
        treeItem.eleVariableName = element.eleVariableName;
        treeItem.fullPath = element.fullPath;
        treeItem.label = element.label;
        treeItem.isLeaf = true;

        if (operationType === 'click') {
            void vscode.commands.executeCommand('eleTreeViewer.addClickOperation', treeItem);
            return;
        }

        if (operationType === 'double_click') {
            void vscode.commands.executeCommand('eleTreeViewer.addDoubleClickOperation', treeItem);
        }
    }

    private async _handleBatchAddOperation(elements: any[], operationType: string) {
        if (!elements || elements.length === 0) {
            vscode.window.showWarningMessage('没有找到可生成方法的元素');
            return;
        }

        const operationTypes: ('click' | 'double_click')[] = [];
        if (operationType === 'all') {
            operationTypes.push('click', 'double_click');
        } else if (operationType === 'click' || operationType === 'double_click') {
            operationTypes.push(operationType);
        } else {
            console.error('Unknown operation type:', operationType);
            return;
        }

        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;

        const elementsByFile: Record<string, any[]> = {};
        for (const element of elements) {
            const eleFilePath = element.eleFilePath;
            if (!eleFilePath) {
                continue;
            }

            const atomicFilePath = getAtomicFilePath(eleFilePath);
            if (!atomicFilePath) {
                continue;
            }

            if (!elementsByFile[atomicFilePath]) {
                elementsByFile[atomicFilePath] = [];
            }
            elementsByFile[atomicFilePath].push(element);
        }

        for (const [atomicFilePath, fileElements] of Object.entries(elementsByFile)) {
            for (const element of fileElements) {
                for (const opType of operationTypes) {
                    try {
                        const eleDesc = element.label || element.eleVariableName || 'unknown';
                        const { methodName, methodCode } = generateMethodCode(element.eleVariableName, opType, eleDesc);
                        const result = await addMethodToFile(atomicFilePath, methodCode, element.eleFilePath, methodName);

                        if (result.existed) {
                            skipCount++;
                        } else {
                            successCount++;
                        }
                    } catch (error) {
                        console.error('Error generating method:', error);
                        errorCount++;
                    }
                }
            }
        }

        const filePaths = Object.keys(elementsByFile);
        if (filePaths.length > 0) {
            const lastFilePath = filePaths[filePaths.length - 1];
            if (lastFilePath) {
                try {
                    const document = await vscode.workspace.openTextDocument(lastFilePath);
                    await vscode.window.showTextDocument(document);
                } catch (error) {
                    console.error('Error opening file:', error);
                }
            }
        }

        const opName = operationType === 'all'
            ? '点击和双击'
            : (operationType === 'click' ? '点击' : '双击');

        let message = `批量生成完成: ${successCount} 个${opName}方法已生成`;
        if (skipCount > 0) {
            message += `, ${skipCount} 个已存在`;
        }
        if (errorCount > 0) {
            message += `, ${errorCount} 个失败`;
        }
        vscode.window.showInformationMessage(message);
    }

    private _handleSaveState(state: any) {
        this._postMessage({
            command: 'setState',
            state
        });
    }

    private _handleGetState() {
        this._postMessage({
            command: 'requestState'
        });
    }

    public refresh() {
        void this._handleRefresh();
    }
}
