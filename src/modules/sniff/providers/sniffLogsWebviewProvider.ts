import * as vscode from 'vscode';
import { loadWebviewHtml } from '../../../platform/vscode/webview/loadWebviewHtml';
import { SniffViewStateStore } from '../services/sniffViewStateStore';

export class SniffLogsWebviewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'pathSniffLogsViewer';

    private view?: vscode.WebviewView;
    private readonly viewDisposables: vscode.Disposable[] = [];

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
            'resources/sniff/sniffLogsViewer.html',
            [
                {
                    placeholder: '<script src="sniffLogsViewer.js"></script>',
                    relativePath: 'resources/sniff/sniffLogsViewer.js',
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
                command: 'setLogsState',
                state: this.stateStore.getDetailsState()
            });
        } catch {
            this.clearView();
        }
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
