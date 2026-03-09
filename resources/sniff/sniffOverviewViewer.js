const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

let widgetDefText = '';

const elements = {
    propertiesContainer: document.getElementById('propertiesContainer'),
    widgetDefContainer: document.getElementById('widgetDefContainer'),
    widgetDefMeta: document.getElementById('widgetDefMeta'),
    copyWidgetDefButton: document.getElementById('copyWidgetDefButton')
};

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderProperties(properties) {
    const entries = Object.entries(properties || {});
    if (!entries.length) {
        elements.propertiesContainer.innerHTML = '<div class="empty">选择控件后显示属性</div>';
        return;
    }

    const rows = entries.map(([key, value]) => `
        <tr>
            <td>${escapeHtml(key)}</td>
            <td>${escapeHtml(typeof value === 'object' ? JSON.stringify(value) : value)}</td>
        </tr>
    `).join('');

    elements.propertiesContainer.innerHTML = `<table><tbody>${rows}</tbody></table>`;
}

function renderWidgetDef(widgetDef, matchCount, occurrence) {
    widgetDefText = JSON.stringify(widgetDef || {}, null, 2);
    elements.widgetDefMeta.textContent = `match_count: ${matchCount || 1} | occurrence: ${occurrence || 1}`;
    elements.widgetDefContainer.innerHTML = `<pre class="json-box">${escapeHtml(widgetDefText)}</pre>`;
}

function renderState(state) {
    renderProperties(state.properties || {});
    renderWidgetDef(state.widgetDef || {}, state.matchCount, state.occurrence);
}

elements.copyWidgetDefButton.addEventListener('click', async () => {
    if (!widgetDefText) {
        return;
    }

    await navigator.clipboard.writeText(widgetDefText);
});

window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'setOverviewState') {
        renderState(message.state || {});
    }
});

renderState({
    properties: {},
    widgetDef: {},
    matchCount: 1,
    occurrence: 1
});
postReady();

function postReady() {
    if (!vscode || typeof vscode.postMessage !== 'function') {
        return;
    }

    vscode.postMessage({ command: 'ready' });
}
