import * as vscode from 'vscode';

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
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Ele Tree Secondary View</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 20px;
                    margin: 0;
                }
                
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                }
                
                .header {
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 15px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    border-left: 4px solid var(--vscode-activityBarBadge-background);
                }
                
                .title {
                    font-size: 24px;
                    font-weight: bold;
                    margin-bottom: 10px;
                    color: var(--vscode-activityBarBadge-background);
                }
                
                .subtitle {
                    font-size: 16px;
                    color: var(--vscode-descriptionForeground);
                }
                
                .content-section {
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 20px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                }
                
                .section-title {
                    font-size: 18px;
                    font-weight: bold;
                    margin-bottom: 15px;
                    color: var(--vscode-activityBarBadge-background);
                }
                
                .info-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 15px;
                    margin-bottom: 20px;
                }
                
                .info-card {
                    background-color: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 6px;
                    padding: 15px;
                }
                
                .info-label {
                    font-weight: bold;
                    color: var(--vscode-activityBarBadge-background);
                    margin-bottom: 5px;
                }
                
                .info-value {
                    color: var(--vscode-foreground);
                }
                
                .button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    margin-right: 10px;
                    margin-bottom: 10px;
                }
                
                .button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .log-area {
                    background-color: var(--vscode-terminal-background);
                    border: 1px solid var(--vscode-terminal-border);
                    border-radius: 4px;
                    padding: 15px;
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    color: var(--vscode-terminal-foreground);
                    white-space: pre-wrap;
                    max-height: 200px;
                    overflow-y: auto;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="title">🌳 Ele Tree Secondary View</div>
                    <div class="subtitle">这是右侧的辅助视图窗口，后续可以展示更多内容</div>
                </div>
                
                <div class="content-section">
                    <div class="section-title">📊 项目信息</div>
                    <div class="info-grid">
                        <div class="info-card">
                            <div class="info-label">插件名称</div>
                            <div class="info-value">Ele Tree Viewer</div>
                        </div>
                        <div class="info-card">
                            <div class="info-label">版本</div>
                            <div class="info-value">0.0.8</div>
                        </div>
                        <div class="info-card">
                            <div class="info-label">状态</div>
                            <div class="info-value">运行中</div>
                        </div>
                        <div class="info-card">
                            <div class="info-label">当前时间</div>
                            <div class="info-value" id="current-time">--</div>
                        </div>
                    </div>
                </div>
                
                <div class="content-section">
                    <div class="section-title">🛠️ 操作面板</div>
                    <button class="button" onclick="sendMessage('Hello from Secondary View!')">发送消息</button>
                    <button class="button" onclick="refreshData()">刷新数据</button>
                    <button class="button" onclick="clearLog()">清除日志</button>
                </div>
                
                <div class="content-section">
                    <div class="section-title">📝 活动日志</div>
                    <div class="log-area" id="log-area">欢迎使用 Ele Tree Secondary View！
这里可以展示各种信息和日志。
后续可以根据需要添加更多功能...</div>
                </div>
            </div>
            
            <script>
                // 获取VSCode API（只能调用一次）
                const vscode = (function() {
                    if (typeof acquireVsCodeApi !== 'undefined') {
                        return acquireVsCodeApi();
                    }
                    return null;
                })();
                
                // 更新当前时间
                function updateTime() {
                    const now = new Date();
                    document.getElementById('current-time').textContent = now.toLocaleString();
                }
                
                // 每秒更新时间
                updateTime();
                setInterval(updateTime, 1000);
                
                // 发送消息到扩展
                function sendMessage(text) {
                    if (vscode) {
                        vscode.postMessage({
                            command: 'alert',
                            text: text
                        });
                        addToLog('消息已发送: ' + text);
                    } else {
                        addToLog('错误: VSCode API 不可用');
                    }
                }
                
                // 刷新数据
                function refreshData() {
                    addToLog('数据已刷新 - ' + new Date().toLocaleString());
                }
                
                // 添加日志
                function addToLog(message) {
                    const logArea = document.getElementById('log-area');
                    logArea.textContent += '\\n[' + new Date().toLocaleTimeString() + '] ' + message;
                    logArea.scrollTop = logArea.scrollHeight;
                }
                
                // 清除日志
                function clearLog() {
                    document.getElementById('log-area').textContent = '日志已清除\\n';
                }
                
                // 初始化日志
                addToLog('Secondary View 已初始化');
            </script>
        </body>
        </html>`;
    }


} 