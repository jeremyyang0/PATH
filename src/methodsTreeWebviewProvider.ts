import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MethodsDataProvider } from './methodsDataProvider';
import { TreeItem } from './treeItem';

export class MethodsTreeWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'methodsViewer';
    private _view?: vscode.WebviewView;
    private readonly _dataProvider: MethodsDataProvider;
    private _isFirstLaunch = true;

    constructor(private readonly _extensionUri: vscode.Uri) {
        this._dataProvider = new MethodsDataProvider();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
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
                    this._handleClearSearch();
                    break;
                case 'refresh':
                    this._handleRefresh();
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
                case 'openFolder':
                    void this._handleOpenFolder(data.folderPath);
                    break;
                case 'dragToEditor':
                    this._handleDragToEditor(data.codePath);
                    break;
                case 'jumpToMethod':
                    void this._handleJumpToMethod(data.filePath, data.lineNumber);
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
            if (webviewView.visible) {
                void this._handleRefresh();
                this._postMessage({ command: 'restoreState' });
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        try {
            const htmlPath = path.join(this._extensionUri.fsPath, 'resources', 'methodsTreeViewer.html');
            if (!fs.existsSync(htmlPath)) {
                throw new Error(`HTML file not found: ${htmlPath}`);
            }

            let html = fs.readFileSync(htmlPath, 'utf8');
            const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'methodsTreeViewer.js'));
            html = html.replace('src="methodsTreeViewer.js"', `src="${jsUri}"`);
            return html;
        } catch (error) {
            return `<!DOCTYPE html>
            <html>
            <head><title>Error</title></head>
            <body>
                <h1>加载错误</h1>
                <p>无法加载 Methods Tree Viewer: ${error instanceof Error ? error.message : String(error)}</p>
            </body>
            </html>`;
        }
    }

    private async _loadData(): Promise<void> {
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
            console.error('Failed to load methods data:', error);
        }
    }

    private async _getTreeData(): Promise<Record<string, unknown>[]> {
        const items = await this._dataProvider.getChildren();
        return this._convertTreeItems(items);
    }

    private _convertTreeItems(items: TreeItem[]): Record<string, unknown>[] {
        return items.map(item => ({
            label: typeof item.label === 'string' ? item.label : item.label?.label || '',
            fullPath: item.fullPath,
            filePath: item.filePath,
            codePath: item.codePath,
            isLeaf: item.isLeaf,
            nodeType: item.nodeType,
            tooltip: item.tooltip,
            methodFilePath: item.methodFilePath,
            methodName: item.methodName,
            methodLine: item.methodLine,
            methodDoc: item.methodDoc,
            children: item.children ? this._convertTreeItems(item.children) : []
        }));
    }

    private _postMessage(message: Record<string, unknown>): void {
        if (this._view) {
            void this._view.webview.postMessage(message);
        }
    }

    private async _handleSearch(keyword: string): Promise<void> {
        if (keyword) {
            this._dataProvider.applySearchKeyword(keyword);
        } else {
            this._dataProvider.clearSearch();
        }
        await this._loadData();
    }

    private _handleClearSearch(): void {
        this._dataProvider.clearSearch();
        void this._loadData();
    }

    private async _handleRefresh(): Promise<void> {
        await this._loadData();
    }

    private _handleExpandAll(): void {
        this._dataProvider.expandAll();
        this._postMessage({ command: 'expandAll' });
    }

    private _handleCollapseAll(): void {
        this._dataProvider.collapseAll();
    }

    private async _handleOpenFile(filePath: string, lineNumber?: number): Promise<void> {
        await vscode.commands.executeCommand('methodsViewer.openFile', filePath, lineNumber || 1);
    }

    private async _handleOpenFolder(folderPath: string): Promise<void> {
        const initFilePath = path.join(folderPath, '__init__.py');
        if (fs.existsSync(initFilePath)) {
            await vscode.commands.executeCommand('methodsViewer.openFile', initFilePath, 1);
        } else {
            vscode.window.showWarningMessage(`文件不存在: ${initFilePath}`);
        }
    }

    private _handleDragToEditor(codePath: string): void {
        const element = {
            codePath,
            isLeaf: true
        };
        void vscode.commands.executeCommand('methodsViewer.dragToEditor', element);
    }

    private async _handleJumpToMethod(filePath: string, lineNumber: number): Promise<void> {
        const normalizedPath = filePath.replace(/[\/\\]+/g, '\\');
        await vscode.commands.executeCommand('methodsViewer.jumpToMethod', { methodFilePath: normalizedPath, methodLine: lineNumber });
    }

    private _handleSaveState(state: unknown): void {
        if (this._view) {
            void this._view.webview.postMessage({
                command: 'setState',
                state
            });
        }
    }

    private _handleGetState(): void {
        if (this._view) {
            void this._view.webview.postMessage({
                command: 'requestState'
            });
        }
    }

    public refresh(): void {
        void this._handleRefresh();
    }
}
