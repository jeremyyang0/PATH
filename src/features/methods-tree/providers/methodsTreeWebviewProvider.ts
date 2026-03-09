import * as path from 'path';
import * as vscode from 'vscode';
import { TreeItem } from '../../../shared/tree/treeItem';
import { loadWebviewHtml } from '../../../shared/webview/loadWebviewHtml';
import { MethodsDataProvider } from './methodsDataProvider';

export class MethodsTreeWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'methodsViewer';

    private view?: vscode.WebviewView;
    private readonly dataProvider = new MethodsDataProvider();
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
        webviewView.webview.html = loadWebviewHtml(this.extensionUri, webviewView.webview, 'resources/methodsTreeViewer.html', [
            {
                placeholder: '<script src="methodsTreeViewer.js"></script>',
                relativePath: 'resources/methodsTreeViewer.js',
                kind: 'inline-script'
            }
        ]);

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.command) {
                case 'ready':
                    this.hasReceivedReady = true;
                    this.postMessage({ command: 'debugStatus', text: '扩展已收到 Methods Tree ready 消息' });
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
                case 'openFolder':
                    void this.handleOpenFolder(data.folderPath);
                    break;
                case 'dragToEditor':
                    this.handleDragToEditor(data.codePath);
                    break;
                case 'jumpToMethod':
                    void this.handleJumpToMethod(data.filePath, data.lineNumber);
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
            this.postMessage({ command: 'debugStatus', text: '扩展正在主动推送 Methods Tree 数据' });
            void this.loadData();
        }, 300);

        setTimeout(() => {
            if (this.hasReceivedReady) {
                return;
            }

            void vscode.window.showWarningMessage(
                'Methods Tree Webview 前端脚本未启动，请结束当前 F5 会话后重新启动调试宿主。'
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
            this.postMessage({ command: 'debugStatus', text: 'Methods Tree 开始加载数据' });
            await this.dataProvider.loadData();
            const data = await this.getTreeData();
            this.postMessage({
                command: 'updateData',
                data,
                resetState: this.isFirstLaunch
            });
            this.postMessage({ command: 'debugStatus', text: `Methods Tree 数据已推送，顶层节点 ${data.length}` });
            this.isFirstLaunch = false;
        } catch (error) {
            console.error('Failed to load methods data:', error);
            this.postMessage({
                command: 'debugStatus',
                text: `Methods Tree 加载失败: ${error instanceof Error ? error.message : String(error)}`
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
            filePath: item.filePath,
            codePath: item.codePath,
            isLeaf: item.isLeaf,
            nodeType: item.nodeType,
            tooltip: item.tooltip,
            methodFilePath: item.methodFilePath,
            methodName: item.methodName,
            methodLine: item.methodLine,
            methodDoc: item.methodDoc,
            children: item.children ? this.convertTreeItems(item.children) : []
        }));
    }

    private async handleSearch(keyword: string): Promise<void> {
        if (keyword) {
            this.dataProvider.applySearchKeyword(keyword);
        } else {
            this.dataProvider.clearSearch();
        }

        await this.loadData();
    }

    private async handleClearSearch(): Promise<void> {
        this.dataProvider.clearSearch();
        await this.loadData();
    }

    private async handleRefresh(): Promise<void> {
        await this.loadData();
    }

    private handleExpandAll(): void {
        this.dataProvider.expandAll();
        this.postMessage({ command: 'expandAll' });
    }

    private handleCollapseAll(): void {
        this.dataProvider.collapseAll();
    }

    private async handleOpenFile(filePath: string, lineNumber?: number): Promise<void> {
        await vscode.commands.executeCommand('methodsViewer.openFile', filePath, lineNumber || 1);
    }

    private async handleOpenFolder(folderPath: string): Promise<void> {
        const initFilePath = path.join(folderPath, '__init__.py');
        await vscode.commands.executeCommand('methodsViewer.openFile', initFilePath, 1);
    }

    private handleDragToEditor(codePath: string): void {
        void vscode.commands.executeCommand('methodsViewer.dragToEditor', { codePath, isLeaf: true });
    }

    private async handleJumpToMethod(filePath: string, lineNumber: number): Promise<void> {
        const normalizedPath = filePath.replace(/[\\/]+/g, '\\');
        await vscode.commands.executeCommand('methodsViewer.jumpToMethod', {
            methodFilePath: normalizedPath,
            methodLine: lineNumber
        });
    }
}
