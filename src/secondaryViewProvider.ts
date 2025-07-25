import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class SecondaryViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'eleSecondaryView';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            // 启用JavaScript
            enableScripts: true,

            // 只能从本地资源加载
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 处理来自webview的消息
        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.command) {
                case 'alert':
                    vscode.window.showInformationMessage(data.text);
                    break;
            }
        });
    }

    public revive(panel: vscode.WebviewView) {
        this._view = panel;
    }

    public focus() {
        if (this._view) {
            this._view.show?.(true); // `show` is not implemented in 1.49 but is for 1.50 insiders
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        try {
            const htmlPath = path.join(this._extensionUri.fsPath, 'resources', 'secondaryView.html');
            console.log('Reading HTML file from:', htmlPath);
            
            if (!fs.existsSync(htmlPath)) {
                console.error('HTML file not found:', htmlPath);
                throw new Error(`HTML file not found: ${htmlPath}`);
            }
            
            let html = fs.readFileSync(htmlPath, 'utf8');
            
            // 获取资源URI
            const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'secondaryView.js'));
            console.log('JS URI:', jsUri.toString());
            
            // 替换资源路径
            html = html.replace('src="secondaryView.js"', `src="${jsUri}"`);
            
            return html;
        } catch (error) {
            console.error('Error loading HTML for secondaryView:', error);
            // 返回一个简单的错误页面
            return `<!DOCTYPE html>
            <html>
            <head><title>Error</title></head>
            <body>
                <h1>加载错误</h1>
                <p>无法加载Secondary View: ${error instanceof Error ? error.message : String(error)}</p>
            </body>
            </html>`;
        }
    }


} 