import * as vscode from 'vscode';
import { addMethodToFile, getAtomicFilePath } from '../../../shared/python/fileOperations';
import { generateMethodCode } from '../../../shared/python/codegenUtils';
import { TreeItem } from '../../../shared/tree/treeItem';
import { loadWebviewHtml } from '../../../shared/webview/loadWebviewHtml';
import { WebviewElementPayload } from '../models/contracts';
import { EleTreeDataProvider } from './eleTreeDataProvider';

export class EleTreeWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'eleTreeViewer';

    private view?: vscode.WebviewView;
    private readonly dataProvider = new EleTreeDataProvider();
    private isFirstLaunch = true;
    private hasReceivedReady = false;

    public constructor(private readonly extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.view = webviewView;
        this.hasReceivedReady = false;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };
        webviewView.webview.html = loadWebviewHtml(this.extensionUri, webviewView.webview, 'resources/eleTreeViewer.html', [
            {
                placeholder: '<script src="eleTreeViewer.js"></script>',
                relativePath: 'resources/eleTreeViewer.js',
                kind: 'inline-script'
            }
        ]);

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.command) {
                case 'ready':
                    this.hasReceivedReady = true;
                    this.postMessage({ command: 'debugStatus', text: '扩展已收到 Ele Tree ready 消息' });
                    void this.loadData();
                    break;
                case 'search':
                    void this.handleSearch(data.keyword);
                    break;
                case 'clearSearch':
                    void this.handleClearSearch();
                    break;
                case 'refresh':
                    void this.handleRefresh();
                    break;
                case 'expandAll':
                    this.handleExpandAll();
                    break;
                case 'collapseAll':
                    this.handleCollapseAll();
                    break;
                case 'openFile':
                    void this.handleOpenFile(data.filePath, data.lineNumber);
                    break;
                case 'dragToEditor':
                    this.handleDragToEditor(data.codePath);
                    break;
                case 'addOperation':
                    this.handleAddOperation(data.element, data.operationType);
                    break;
                case 'batchAddOperation':
                    void this.handleBatchAddOperation(data.elements, data.operationType);
                    break;
                case 'saveState':
                    this.postMessage({ command: 'setState', state: data.state });
                    break;
                case 'getState':
                    this.postMessage({ command: 'requestState' });
                    break;
            }
        });

        setTimeout(() => {
            this.postMessage({ command: 'debugStatus', text: '扩展正在主动推送 Ele Tree 数据' });
            void this.loadData();
        }, 300);

        setTimeout(() => {
            if (this.hasReceivedReady) {
                return;
            }

            void vscode.window.showWarningMessage(
                'Ele Tree Webview 前端脚本未启动，请结束当前 F5 会话后重新启动调试宿主。'
            );
        }, 1500);

        webviewView.onDidChangeVisibility(() => {
            if (!webviewView.visible) {
                return;
            }

            void this.handleRefresh();
            this.postMessage({ command: 'restoreState' });
        });
    }

    public refresh(): void {
        void this.handleRefresh();
    }

    private postMessage(message: Record<string, unknown>): void {
        if (this.view) {
            void this.view.webview.postMessage(message);
        }
    }

    private async loadData(): Promise<void> {
        try {
            this.postMessage({ command: 'debugStatus', text: 'Ele Tree 开始加载数据' });
            await this.dataProvider.loadData();
            const data = await this.getTreeData();
            this.postMessage({
                command: 'updateData',
                data,
                resetState: this.isFirstLaunch
            });
            this.postMessage({ command: 'debugStatus', text: `Ele Tree 数据已推送，顶层节点 ${data.length}` });
            this.isFirstLaunch = false;
        } catch (error) {
            console.error('Failed to load ele tree data:', error);
            this.postMessage({
                command: 'debugStatus',
                text: `Ele Tree 加载失败: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    private async getTreeData(): Promise<Record<string, unknown>[]> {
        const items = await this.dataProvider.getChildren();
        return this.convertTreeItems(items);
    }

    private convertTreeItems(items: TreeItem[]): Record<string, unknown>[] {
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
            children: item.children ? this.convertTreeItems(item.children) : []
        }));
    }

    private async handleSearch(keyword: string): Promise<void> {
        if (keyword) {
            this.dataProvider.applySearchKeyword(keyword);
        } else {
            this.dataProvider.clearSearch();
        }

        await this.pushCurrentData();
    }

    private async handleClearSearch(): Promise<void> {
        this.dataProvider.clearSearch();
        await this.pushCurrentData();
    }

    private async handleRefresh(): Promise<void> {
        await this.loadData();
    }

    private async pushCurrentData(): Promise<void> {
        const data = await this.getTreeData();
        this.postMessage({
            command: 'updateData',
            data,
            resetState: false
        });
    }

    private handleExpandAll(): void {
        this.dataProvider.expandAll();
        this.postMessage({ command: 'expandAll' });
    }

    private handleCollapseAll(): void {
        this.dataProvider.collapseAll();
    }

    private async handleOpenFile(filePath: string, lineNumber: number): Promise<void> {
        const normalizedPath = filePath.replace(/[\\/]+/g, '\\');
        await vscode.commands.executeCommand('eleTreeViewer.openFile', normalizedPath, lineNumber);
    }

    private handleDragToEditor(codePath: string): void {
        void vscode.commands.executeCommand('eleTreeViewer.dragToEditor', { codePath, isLeaf: true });
    }

    private handleAddOperation(element: WebviewElementPayload, operationType: string): void {
        const treeItem = new TreeItem(String(element.label || element.fullPath || ''), vscode.TreeItemCollapsibleState.None);
        treeItem.eleFilePath = element.eleFilePath;
        treeItem.eleVariableName = element.eleVariableName;
        treeItem.fullPath = element.fullPath || '';
        treeItem.label = String(element.label || '');
        treeItem.isLeaf = true;

        if (operationType === 'click') {
            void vscode.commands.executeCommand('eleTreeViewer.addClickOperation', treeItem);
        } else if (operationType === 'double_click') {
            void vscode.commands.executeCommand('eleTreeViewer.addDoubleClickOperation', treeItem);
        }
    }

    private async handleBatchAddOperation(elements: WebviewElementPayload[], operationType: string): Promise<void> {
        if (!elements || elements.length === 0) {
            vscode.window.showWarningMessage('没有找到可生成方法的元素');
            return;
        }

        const operationTypes: Array<'click' | 'double_click'> = [];
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
        const elementsByFile: Record<string, WebviewElementPayload[]> = {};

        for (const element of elements) {
            const eleFilePath = element.eleFilePath || '';
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
                        const variableName = String(element.eleVariableName || '');
                        const eleDesc = String(element.label || element.eleVariableName || 'unknown');
                        const { methodName, methodCode } = generateMethodCode(variableName, opType, eleDesc);
                        const result = await addMethodToFile(
                            atomicFilePath,
                            methodCode,
                            String(element.eleFilePath || ''),
                            methodName
                        );

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
                const document = await vscode.workspace.openTextDocument(lastFilePath);
                await vscode.window.showTextDocument(document);
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
}
