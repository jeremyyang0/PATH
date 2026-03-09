import * as vscode from 'vscode';
import { loadWebviewHtml } from '../../../shared/webview/loadWebviewHtml';
import { SniffViewStateStore } from '../services/sniffViewStateStore';

export class SniffOverviewWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'pathSniffOverviewViewer';

    private view?: vscode.WebviewView;

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
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.onDidReceiveMessage(data => {
            if (data.command === 'ready') {
                this.pushState();
            }
        });

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

    public pushState(): void {
        if (!this.view) {
            return;
        }

        void this.view.webview.postMessage({
            command: 'setOverviewState',
            state: this.stateStore.getDetailsState()
        });
    }
}
