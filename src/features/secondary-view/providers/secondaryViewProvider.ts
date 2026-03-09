import * as vscode from 'vscode';
import { loadWebviewHtml } from '../../../shared/webview/loadWebviewHtml';

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
                placeholder: 'src="secondaryView.js"',
                relativePath: 'resources/secondaryView.js'
            }
        ]);

        webviewView.webview.onDidReceiveMessage(data => {
            if (data.command === 'alert') {
                vscode.window.showInformationMessage(data.text);
            }
        });
    }

    public revive(panel: vscode.WebviewView): void {
        this.view = panel;
    }

    public focus(): void {
        this.view?.show?.(true);
    }
}
