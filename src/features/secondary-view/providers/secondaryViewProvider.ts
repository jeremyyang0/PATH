import * as vscode from 'vscode';
import { loadWebviewHtml } from '../../../shared/webview/loadWebviewHtml';
import { agentService } from '../../ai/services/agentService';
import { agentPanelStateStore } from '../services/agentPanelStateStore';

export class SecondaryViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'eleSecondaryView';

    private view?: vscode.WebviewView;

    public constructor(private readonly extensionUri: vscode.Uri) {}

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
        webviewView.webview.html = loadWebviewHtml(this.extensionUri, webviewView.webview, 'resources/secondaryView.html', [
            {
                placeholder: '<script src="secondaryView.js"></script>',
                relativePath: 'resources/secondaryView.js',
                kind: 'inline-script'
            }
        ]);

        webviewView.webview.onDidReceiveMessage(data => {
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
        });

        agentPanelStateStore.onDidChangeState(() => {
            this.pushState();
        });
        this.pushState();
    }

    public revive(panel: vscode.WebviewView): void {
        this.view = panel;
    }

    public focus(): void {
        this.view?.show?.(true);
    }

    public pushState(): void {
        if (!this.view) {
            return;
        }

        void this.view.webview.postMessage({
            command: 'renderState',
            state: agentPanelStateStore.getState()
        });
    }
}
