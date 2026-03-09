import * as vscode from 'vscode';
import { StructuredError } from '../../../shared/errors/structuredError';
import { loadWebviewHtml } from '../../../shared/webview/loadWebviewHtml';
import { SniffWidgetTreeNode } from '../models/sniffModels';
import { SniffService } from '../services/sniffService';
import { SniffViewStateStore } from '../services/sniffViewStateStore';

export class SniffWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'pathSniffViewer';

    private static readonly outputChannel = vscode.window.createOutputChannel('PATH Sniff');

    private view?: vscode.WebviewView;
    private currentServerName = 'common';
    private service = new SniffService(this.currentServerName);
    private hasReceivedReady = false;

    public constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly stateStore: SniffViewStateStore
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.view = webviewView;
        this.hasReceivedReady = false;
        this.log(`Resolve tree view. currentServerName=${this.currentServerName}`);
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.onDidReceiveMessage(data => {
            const command = String(data.command || 'unknown');
            this.log(`Received tree command: ${command}`);

            switch (data.command) {
                case 'ready':
                    this.hasReceivedReady = true;
                    this.pushTreeState();
                    void this.refresh(String(data.serverName || this.currentServerName), false);
                    break;
                case 'refresh':
                    void this.refresh(String(data.serverName || this.currentServerName), false);
                    break;
                case 'setServerName':
                    void this.refresh(String(data.serverName || this.currentServerName), true);
                    break;
                case 'selectWidget':
                    void this.selectWidget(String(data.widgetId || ''));
                    break;
                case 'highlightWidget':
                    void this.highlightWidget(String(data.widgetId || ''));
                    break;
                case 'generateWidgetDef':
                    void this.generateWidgetDef(String(data.widgetId || ''));
                    break;
                case 'findWidgets':
                    void this.findWidgets(String(data.widgetDef || ''));
                    break;
                case 'copyError':
                    void vscode.env.clipboard.writeText(String(data.text || ''));
                    break;
            }
        });

        webviewView.webview.html = loadWebviewHtml(this.extensionUri, webviewView.webview, 'resources/sniff/sniffViewer.html', [
            {
                placeholder: '<script src="sniffViewer.js"></script>',
                relativePath: 'resources/sniff/sniffViewer.js',
                kind: 'inline-script'
            }
        ]);

        setTimeout(() => {
            this.pushTreeState();
            void this.refresh(this.currentServerName, false);
        }, 300);
    }

    public refresh(serverName = this.currentServerName, resetState = false): Promise<void> {
        return this.run(async () => {
            const serverChanged = this.updateServerName(serverName);
            this.stateStore.setStatus(`正在连接 ${this.currentServerName} 并刷新控件树...`);
            this.postMessage({
                command: 'setStatus',
                text: `正在连接 ${this.currentServerName} 并刷新控件树...`
            });
            this.log(
                `Refreshing tree. serverName=${this.currentServerName}, ` +
                `serverChanged=${String(serverChanged)}, resetState=${String(resetState)}`
            );
            const tree = await this.service.refreshTree();
            this.log(`Tree refreshed. topLevelNodes=${tree.length}`);
            this.stateStore.setStatus(
                tree.length > 0
                    ? `已连接 ${this.currentServerName}，收到 ${tree.length} 个顶层节点`
                    : `已连接 ${this.currentServerName}，但控件树为空`
            );
            this.postMessage({
                command: 'setStatus',
                text: tree.length > 0
                    ? `已连接 ${this.currentServerName}，收到 ${tree.length} 个顶层节点`
                    : `已连接 ${this.currentServerName}，但控件树为空`
            });
            this.stateStore.setServerName(this.currentServerName);
            this.stateStore.setTree(tree);
            const selectedWidgetId = this.stateStore.getDetailsState().selectedWidgetId;
            if (selectedWidgetId && !this.containsWidget(tree, selectedWidgetId)) {
                this.log(`Selected widget disappeared after refresh. widgetId=${selectedWidgetId}`);
                this.stateStore.clearSelection();
            }
            this.postMessage({
                command: 'setTree',
                tree,
                serverName: this.currentServerName,
                resetState: resetState && serverChanged
            });
        });
    }

    private async selectWidget(widgetId: string): Promise<void> {
        await this.run(async () => {
            this.stateStore.setSelection(widgetId);
            const [widgetInfo, widgetDef] = await Promise.all([
                this.service.getWidgetInfo(widgetId),
                this.service.generateWidgetDef(widgetId)
            ]);
            this.log(
                `Widget selected. widgetId=${widgetId}, ` +
                `propertyCount=${Object.keys(widgetInfo.properties).length}, matchCount=${widgetDef.matchCount}`
            );
            this.stateStore.setWidgetInfo(widgetId, widgetInfo.properties);
            this.stateStore.setWidgetDef(widgetId, widgetDef.widgetDef, widgetDef.matchCount, widgetDef.occurrence);
        });
    }

    private async highlightWidget(widgetId: string): Promise<void> {
        await this.run(async () => {
            this.stateStore.setStatus('正在高亮控件');
            await this.service.highlightWidget(widgetId);
            this.log(`Widget highlighted. widgetId=${widgetId}`);
            this.stateStore.setStatus(`已高亮控件 ${widgetId}`);
            this.postMessage({
                command: 'highlightCompleted',
                widgetId
            });
        });
    }

    private async generateWidgetDef(widgetId: string): Promise<void> {
        await this.run(async () => {
            const widgetDef = await this.service.generateWidgetDef(widgetId);
            this.log(
                `widget_def generated. widgetId=${widgetId}, ` +
                `matchCount=${widgetDef.matchCount}, occurrence=${widgetDef.occurrence}`
            );
            this.stateStore.setWidgetDef(widgetId, widgetDef.widgetDef, widgetDef.matchCount, widgetDef.occurrence);
        });
    }

    private async findWidgets(widgetDefText: string): Promise<void> {
        await this.run(async () => {
            const widgetDef = JSON.parse(widgetDefText) as Record<string, unknown>;
            const results = await this.service.searchWidgets(widgetDef);
            this.log(`Search completed. resultCount=${results.length}`);
            this.postMessage({
                command: 'setSearchResults',
                results
            });
        });
    }

    private async run(action: () => Promise<void>): Promise<void> {
        try {
            await action();
        } catch (error) {
            const structuredError = error instanceof StructuredError
                ? error
                : new StructuredError({ error: error instanceof Error ? error.message : String(error) });
            this.log(
                `Request failed. errorType=${structuredError.errorType || 'Unknown'}, ` +
                `error=${structuredError.message || 'Unknown'}`
            );
            this.stateStore.setStatus(`请求失败: ${structuredError.errorType || 'Unknown'}`);
            this.postMessage({
                command: 'setStatus',
                text: `请求失败: ${structuredError.errorType || 'Unknown'}`
            });
            this.postMessage({
                command: 'showError',
                error: structuredError.toJSON()
            });
        }
    }

    private pushTreeState(): void {
        const treeState = this.stateStore.getTreeState();
        this.postMessage({
            command: 'setTree',
            tree: treeState.tree,
            serverName: treeState.serverName,
            resetState: false
        });
    }

    private postMessage(message: Record<string, unknown>): void {
        if (this.view) {
            void this.view.webview.postMessage(message);
        }
    }

    private updateServerName(serverName: string): boolean {
        const normalizedServerName = serverName.trim() || 'common';
        if (normalizedServerName === this.currentServerName) {
            return false;
        }

        this.log(`Server name changed. from=${this.currentServerName} to=${normalizedServerName}`);
        this.currentServerName = normalizedServerName;
        this.service = new SniffService(this.currentServerName);
        this.stateStore.setServerName(this.currentServerName);
        this.stateStore.clearSelection();
        return true;
    }

    private containsWidget(tree: SniffWidgetTreeNode[], widgetId: string): boolean {
        return tree.some(node => node.widgetId === widgetId || this.containsWidget(node.children, widgetId));
    }

    private log(message: string): void {
        const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`;
        SniffWebviewProvider.outputChannel.appendLine(line);
        this.stateStore.appendLog(message);
    }
}
