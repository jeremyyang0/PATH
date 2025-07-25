import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MethodsDataProvider } from './methodsDataProvider';
import { TreeItem } from './treeItem';

export class MethodsTreeWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'methodsViewer';
    private _view?: vscode.WebviewView;
    private _dataProvider: MethodsDataProvider;

    constructor(private readonly _extensionUri: vscode.Uri) {
        this._dataProvider = new MethodsDataProvider();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 监听来自webview的消息
        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.command) {
                case 'search':
                    this._handleSearch(data.keyword);
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
                    this._handleOpenFile(data.filePath, data.lineNumber);
                    break;
                case 'dragToEditor':
                    this._handleDragToEditor(data.codePath);
                    break;
                case 'jumpToMethod':
                    this._handleJumpToMethod(data.filePath, data.lineNumber);
                    break;
                case 'saveState':
                    this._handleSaveState(data.state);
                    break;
                case 'getState':
                    this._handleGetState();
                    break;
            }
        });

        // 初始加载数据
        this._loadData();

        // 在webview变为可见时恢复状态并刷新数据
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                console.log('MethodsTreeWebview became visible, refreshing data...');
                // webview变为可见时，自动刷新数据
                this._handleRefresh();
                // 发送恢复状态的消息
                this._postMessage({ command: 'restoreState' });
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        try {
            const htmlPath = path.join(this._extensionUri.fsPath, 'resources', 'methodsTreeViewer.html');
            console.log('Reading HTML file from:', htmlPath);
            
            if (!fs.existsSync(htmlPath)) {
                console.error('HTML file not found:', htmlPath);
                throw new Error(`HTML file not found: ${htmlPath}`);
            }
            
            let html = fs.readFileSync(htmlPath, 'utf8');
            
            // 获取资源URI
            const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'methodsTreeViewer.js'));
            console.log('JS URI:', jsUri.toString());
            
            // 替换资源路径
            html = html.replace('src="methodsTreeViewer.js"', `src="${jsUri}"`);
            
            return html;
        } catch (error) {
            console.error('Error loading HTML for methodsTreeViewer:', error);
            // 返回一个简单的错误页面
            return `<!DOCTYPE html>
            <html>
            <head><title>Error</title></head>
            <body>
                <h1>加载错误</h1>
                <p>无法加载Methods Tree Viewer: ${error instanceof Error ? error.message : String(error)}</p>
            </body>
            </html>`;
        }
    }

    private async _loadData() {
        try {
            await this._dataProvider.loadData();
            const data = await this._getTreeData();
            this._postMessage({ command: 'updateData', data });
        } catch (error) {
            console.error('Failed to load methods data:', error);
        }
    }

    private async _getTreeData(): Promise<any[]> {
        return new Promise((resolve) => {
            this._dataProvider.getChildren().then(items => {
                const treeData = this._convertTreeItems(items);
                resolve(treeData);
            });
        });
    }

    private _convertTreeItems(items: TreeItem[]): any[] {
        return items.map(item => {
            // 调试文件路径
            if (item.methodFilePath) {
                console.log('Original method file path:', item.methodFilePath);
            }
            return {
                label: typeof item.label === 'string' ? item.label : item.label?.label || '',
                fullPath: item.fullPath,
                codePath: item.codePath,
                isLeaf: item.isLeaf,
                tooltip: item.tooltip,
                methodFilePath: item.methodFilePath,
                methodName: item.methodName,
                methodLine: item.methodLine,
                methodDoc: item.methodDoc,
                children: item.children ? this._convertTreeItems(item.children) : []
            };
        });
    }

    private _postMessage(message: any) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    private async _handleSearch(keyword: string) {
        console.log('Searching for keyword in methods:', keyword);
        if (keyword) {
            // 调用dataProvider的search方法并设置关键词
            (this._dataProvider as any).searchKeyword = keyword;
            (this._dataProvider as any).applySearch();
            (this._dataProvider as any)._onDidChangeTreeData.fire();
        } else {
            this._dataProvider.clearSearch();
        }
        await this._loadData();
    }

    private _handleClearSearch() {
        this._dataProvider.clearSearch();
        this._loadData();
    }

    private _handleRefresh() {
        this._dataProvider.refresh();
        this._loadData();
    }

    private _handleExpandAll() {
        this._dataProvider.expandAll();
        this._postMessage({ command: 'expandAll' });
    }

    private _handleCollapseAll() {
        this._dataProvider.collapseAll();
    }

    private async _handleOpenFile(filePath: string, lineNumber: number) {
        await vscode.commands.executeCommand('methodsViewer.openFile', filePath, lineNumber);
    }

    private _handleDragToEditor(codePath: string) {
        // 创建一个TreeItem兼容的对象
        const element = {
            codePath: codePath,
            isLeaf: true
        };
        vscode.commands.executeCommand('methodsViewer.dragToEditor', element);
    }

    private async _handleJumpToMethod(filePath: string, lineNumber: number) {
        console.log('_handleJumpToMethod received:', filePath, 'line:', lineNumber);
        // 确保路径使用正确的分隔符
        const normalizedPath = filePath.replace(/[\/\\]+/g, '\\');
        console.log('Normalized method path:', normalizedPath);
        await vscode.commands.executeCommand('methodsViewer.jumpToMethod', { methodFilePath: normalizedPath, methodLine: lineNumber });
    }

    private _handleSaveState(state: any) {
        // 保存状态到VS Code的状态存储
        if (this._view) {
            this._view.webview.postMessage({
                command: 'setState',
                state: state
            });
        }
    }

    private _handleGetState() {
        // 请求webview发送当前状态
        if (this._view) {
            this._view.webview.postMessage({
                command: 'requestState'
            });
        }
    }

    public refresh() {
        this._handleRefresh();
    }
} 