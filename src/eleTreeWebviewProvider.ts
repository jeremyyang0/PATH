import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { EleTreeDataProvider, ParseResult, FileResult, EleVariable } from './eleTreeDataProvider';
import { TreeItem } from './treeItem';

export class EleTreeWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'eleTreeViewer';
    private _view?: vscode.WebviewView;
    private _dataProvider: EleTreeDataProvider;

    constructor(private readonly _extensionUri: vscode.Uri) {
        this._dataProvider = new EleTreeDataProvider();
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
                case 'addOperation':
                    this._handleAddOperation(data.element, data.operationType);
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

        // 在webview变为可见时恢复状态
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                // webview变为可见时，发送恢复状态的消息
                this._handleRefresh(); // 自动刷新
                this._postMessage({ command: 'restoreState' });
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        try {
            const htmlPath = path.join(this._extensionUri.fsPath, 'resources', 'eleTreeViewer.html');
            console.log('Reading HTML file from:', htmlPath);
            
            if (!fs.existsSync(htmlPath)) {
                console.error('HTML file not found:', htmlPath);
                throw new Error(`HTML file not found: ${htmlPath}`);
            }
            
            let html = fs.readFileSync(htmlPath, 'utf8');
            
            // 获取资源URI
            const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'eleTreeViewer.js'));
            console.log('JS URI:', jsUri.toString());
            
            // 替换资源路径
            html = html.replace('src="eleTreeViewer.js"', `src="${jsUri}"`);
            
            return html;
        } catch (error) {
            console.error('Error loading HTML for eleTreeViewer:', error);
            // 返回一个简单的错误页面
            return `<!DOCTYPE html>
            <html>
            <head><title>Error</title></head>
            <body>
                <h1>加载错误</h1>
                <p>无法加载Ele Tree Viewer: ${error instanceof Error ? error.message : String(error)}</p>
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
            console.error('Failed to load data:', error);
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
            if (item.eleFilePath) {
                console.log('Original file path:', item.eleFilePath);
            }
            return {
                label: typeof item.label === 'string' ? item.label : item.label?.label || '',
                fullPath: item.fullPath,
                codePath: item.codePath,
                isLeaf: item.isLeaf,
                tooltip: item.tooltip,
                eleFilePath: item.eleFilePath,
                eleVariableName: item.eleVariableName,
                eleLineNumber: item.eleLineNumber,
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
        console.log('Searching for keyword:', keyword);
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
        console.log('_handleOpenFile received:', filePath, 'line:', lineNumber);
        // 确保路径使用正确的分隔符
        const normalizedPath = filePath.replace(/[\/\\]+/g, '\\');
        console.log('Normalized path:', normalizedPath);
        await vscode.commands.executeCommand('eleTreeViewer.openFile', normalizedPath, lineNumber);
    }

    private _handleDragToEditor(codePath: string) {
        // 创建一个TreeItem兼容的对象
        const element = {
            codePath: codePath,
            isLeaf: true
        };
        vscode.commands.executeCommand('eleTreeViewer.dragToEditor', element);
    }

    private _handleAddOperation(element: any, operationType: string) {
        console.log('_handleAddOperation called with:', element, operationType);
        
        // 构造TreeItem对象
        const treeItem = new TreeItem(
            element.label || element.fullPath, 
            vscode.TreeItemCollapsibleState.None
        );
        treeItem.eleFilePath = element.eleFilePath;
        treeItem.eleVariableName = element.eleVariableName;
        treeItem.fullPath = element.fullPath;
        treeItem.label = element.label;
        treeItem.isLeaf = true;
        
        // 根据操作类型调用对应的命令
        if (operationType === 'click') {
            vscode.commands.executeCommand('eleTreeViewer.addClickOperation', treeItem);
        } else if (operationType === 'double_click') {
            vscode.commands.executeCommand('eleTreeViewer.addDoubleClickOperation', treeItem);
        } else {
            console.error('Unknown operation type:', operationType);
        }
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