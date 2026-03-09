const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

const elements = {
    logContainer: document.getElementById('logContainer')
};

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderLogs(logLines) {
    if (!logLines || logLines.length === 0) {
        elements.logContainer.innerHTML = '<div class="empty">暂无日志</div>';
        return;
    }

    elements.logContainer.innerHTML = `<pre class="log-box">${escapeHtml(logLines.join('\n'))}</pre>`;
}

window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'setLogsState') {
        renderLogs((message.state || {}).logLines || []);
    }
});

renderLogs([]);
postReady();

function postReady() {
    if (!vscode || typeof vscode.postMessage !== 'function') {
        return;
    }

    vscode.postMessage({ command: 'ready' });
}
