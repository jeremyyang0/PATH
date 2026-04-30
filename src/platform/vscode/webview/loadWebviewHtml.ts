import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface WebviewAssetDefinition {
    placeholder: string;
    relativePath: string;
    kind?: 'uri' | 'inline-script';
}

function escapeForInlineHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function createInlineScriptTag(scriptContent: string, relativePath: string): string {
    const safeRelativePath = escapeForInlineHtml(relativePath);
    const escapedScriptContent = scriptContent.replace(/<\/script/gi, '<\\/script');
    const bootstrapScript = `
<script>
(() => {
    const renderMessage = (text) => {
        const container = document.getElementById('treeContainer');
        if (!container) {
            return;
        }
        container.innerHTML = '<div class="message-container"><div>' + text + '</div></div>';
    };
    const escapeHtml = (value) => String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    renderMessage('前端 bootstrap 已执行，正在加载 ${safeRelativePath}...');

    window.addEventListener('error', (event) => {
        const message = event.error && event.error.stack
            ? event.error.stack
            : (event.message || 'Unknown script error');
        renderMessage('前端脚本异常: ' + escapeHtml(message));
    });
})();
</script>`;

    return `${bootstrapScript}\n<script data-inline-source="${safeRelativePath}">\n${escapedScriptContent}\n</script>`;
}

export function loadWebviewHtml(
    extensionUri: vscode.Uri,
    webview: vscode.Webview,
    htmlRelativePath: string,
    assets: WebviewAssetDefinition[]
): string {
    const htmlPath = path.join(extensionUri.fsPath, htmlRelativePath);
    let html = fs.readFileSync(htmlPath, 'utf8');

    for (const asset of assets) {
        if (asset.kind === 'inline-script') {
            const scriptPath = path.join(extensionUri.fsPath, asset.relativePath);
            const scriptContent = fs.readFileSync(scriptPath, 'utf8');
            const inlineScriptTag = createInlineScriptTag(scriptContent, asset.relativePath);

            if (html.includes(asset.placeholder)) {
                html = html.replace(asset.placeholder, inlineScriptTag);
                continue;
            }

            html = html.replace('</body>', `${inlineScriptTag}\n</body>`);
            continue;
        }

        const assetUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, asset.relativePath));
        html = html.replace(asset.placeholder, assetUri.toString());
    }

    return html;
}
