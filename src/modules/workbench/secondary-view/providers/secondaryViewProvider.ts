import * as vscode from 'vscode';
import { loadWebviewHtml } from '../../../../platform/vscode/webview/loadWebviewHtml';
import { agentService } from '../../../ai';
import { agentPanelStateStore } from '../services/agentPanelStateStore';

export class SecondaryViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'eleSecondaryView';

    private view?: vscode.WebviewView;
    private readonly viewDisposables: vscode.Disposable[] = [];
    private readonly stateDisposable: vscode.Disposable;

    public constructor(private readonly extensionUri: vscode.Uri) {
        this.stateDisposable = agentPanelStateStore.onDidChangeState(() => {
            this.pushState();
        });
    }

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
        webviewView.webview.html = loadWebviewHtml(this.extensionUri, webviewView.webview, 'resources/secondaryView.html', [
            {
                placeholder: '<script src="secondaryView.js"></script>',
                relativePath: 'resources/secondaryView.js',
                kind: 'inline-script'
            }
        ]);

        this.viewDisposables.push(webviewView.webview.onDidReceiveMessage(data => {
            if (data.command === 'ready') {
                this.pushState();
                return;
            }

            if (data.command === 'applyProposal' && typeof data.proposalId === 'string') {
                void agentPanelStateStore.applyProposal(data.proposalId).catch(error => {
                    void vscode.window.showErrorMessage(`Failed to apply proposal: ${error instanceof Error ? error.message : String(error)}`);
                });
                return;
            }

            if (data.command === 'rejectProposal' && typeof data.proposalId === 'string') {
                agentPanelStateStore.rejectProposal(data.proposalId);
                return;
            }

            if (data.command === 'openFile' && typeof data.filePath === 'string') {
                void vscode.window.showTextDocument(vscode.Uri.file(data.filePath), { preview: false }).then(undefined, error => {
                    void vscode.window.showErrorMessage(`Failed to open file: ${error instanceof Error ? error.message : String(error)}`);
                });
                return;
            }

            if (data.command === 'resumeRun') {
                void agentService.resumeRun().catch(error => {
                    void vscode.window.showErrorMessage(`Failed to resume PATH Agent: ${error instanceof Error ? error.message : String(error)}`);
                });
                return;
            }

            if (data.command === 'stopRun') {
                agentService.stopRun();
            }
        }));
        this.viewDisposables.push(webviewView.onDidDispose(() => {
            if (this.view === webviewView) {
                this.clearView();
            }
        }));
        this.pushState();
    }

    public dispose(): void {
        this.stateDisposable.dispose();
        this.clearView();
    }

    public revive(panel: vscode.WebviewView): void {
        this.replaceView(panel);
    }

    public focus(): void {
        this.view?.show?.(true);
    }

    public pushState(): void {
        if (!this.view) {
            return;
        }

        try {
            void this.view.webview.postMessage({
                command: 'renderState',
                state: agentPanelStateStore.getState()
            });
        } catch {
            this.clearView();
        }
    }

    /**
     * 每次 webview 重新 resolve 时先释放旧监听，避免向已销毁视图继续发送状态。
     */
    private replaceView(view: vscode.WebviewView): void {
        this.disposeViewDisposables();
        this.view = view;
    }

    private clearView(): void {
        this.view = undefined;
        this.disposeViewDisposables();
    }

    private disposeViewDisposables(): void {
        while (this.viewDisposables.length > 0) {
            this.viewDisposables.pop()?.dispose();
        }
    }
}
