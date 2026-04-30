import * as vscode from 'vscode';
import { loadWebviewHtml } from '../../../platform/vscode/webview/loadWebviewHtml';
import { SniffWidgetDefCopyService } from '../services/sniffWidgetDefCopyService';
import { SniffViewStateStore } from '../services/sniffViewStateStore';

export class SniffOverviewWebviewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'pathSniffOverviewViewer';

    private view?: vscode.WebviewView;
    private readonly viewDisposables: vscode.Disposable[] = [];
    private readonly copyService = new SniffWidgetDefCopyService();

    public constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly stateStore: SniffViewStateStore
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.replaceView(webviewView);
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        this.viewDisposables.push(webviewView.webview.onDidReceiveMessage(data => {
            if (data.command === 'ready') {
                this.pushState();
                return;
            }

            if (data.command === 'copyWidgetDefTemplate') {
                void this.copyWidgetDefTemplate();
            }
        }));
        this.viewDisposables.push(webviewView.onDidDispose(() => {
            if (this.view === webviewView) {
                this.clearView();
            }
        }));

        webviewView.webview.html = loadWebviewHtml(
            this.extensionUri,
            webviewView.webview,
            'resources/sniff/sniffOverviewViewer.html',
            [
                {
                    placeholder: '<script src="sniffOverviewViewer.js"></script>',
                    relativePath: 'resources/sniff/sniffOverviewViewer.js',
                    kind: 'inline-script'
                }
            ]
        );

        this.pushState();
    }

    public dispose(): void {
        this.clearView();
    }

    public pushState(): void {
        if (!this.view) {
            return;
        }

        try {
            void this.view.webview.postMessage({
                command: 'setOverviewState',
                state: this.stateStore.getDetailsState()
            });
        } catch {
            this.clearView();
        }
    }

    private async copyWidgetDefTemplate(): Promise<void> {
        const detailsState = this.stateStore.getDetailsState();
        const copyText = this.copyService.buildCopyText(detailsState.widgetDef);

        if (!copyText) {
            void vscode.window.showInformationMessage('当前没有可复制的 widget_def 模板');
            return;
        }

        await vscode.env.clipboard.writeText(copyText);
        void vscode.window.showInformationMessage('已复制 Sniff widget_def 模板');
    }

    private replaceView(view: vscode.WebviewView): void {
        this.clearView();
        this.view = view;
    }

    private clearView(): void {
        this.view = undefined;
        while (this.viewDisposables.length > 0) {
            this.viewDisposables.pop()?.dispose();
        }
    }
}
