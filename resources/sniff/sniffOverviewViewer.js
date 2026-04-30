const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

let widgetDefText = '';
let activeTab = 'widgetInfo';

const elements = {
    tabs: Array.from(document.querySelectorAll('.tab')),
    panels: Array.from(document.querySelectorAll('.tab-panel')),
    widgetInfoContainer: document.getElementById('widgetInfoContainer'),
    propertiesContainer: document.getElementById('propertiesContainer'),
    signalsContainer: document.getElementById('signalsContainer'),
    slotsContainer: document.getElementById('slotsContainer'),
    widgetDefContainer: document.getElementById('widgetDefContainer'),
    widgetDefMeta: document.getElementById('widgetDefMeta'),
    copyWidgetDefButton: document.getElementById('copyWidgetDefButton')
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatValue(value) {
    if (value === null || value === undefined) {
        return '';
    }
    if (Array.isArray(value) || typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value);
}

function renderEmpty(container, text) {
    if (container) {
        container.innerHTML = `<div class="empty">${escapeHtml(text)}</div>`;
    }
}

function renderKeyValueTable(container, entries, emptyText) {
    if (!entries.length) {
        renderEmpty(container, emptyText);
        return;
    }

    const rows = entries.map(([key, value]) => `
        <tr>
            <td class="key-cell">${escapeHtml(key)}</td>
            <td>${escapeHtml(formatValue(value))}</td>
        </tr>
    `).join('');

    container.innerHTML = `
        <table>
            <thead><tr><th>属性</th><th>值</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function renderRecordsTable(container, records, headers, emptyText) {
    if (!Array.isArray(records) || records.length === 0) {
        renderEmpty(container, emptyText);
        return;
    }

    const headerHtml = headers.map(header => `<th>${escapeHtml(header.label)}</th>`).join('');
    const rows = records.map(record => `
        <tr>
            ${headers.map(header => `<td>${escapeHtml(formatValue(record[header.key]))}</td>`).join('')}
        </tr>
    `).join('');

    container.innerHTML = `
        <table>
            <thead><tr>${headerHtml}</tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function normalizeCapabilityArgs(value) {
    if (Array.isArray(value)) {
        return value.map(item => {
            if (typeof item === 'string') {
                return item;
            }
            if (item && typeof item === 'object') {
                const name = item.name || item.arg_name || '';
                const type = item.type || item.arg_type || '';
                return [type, name].filter(Boolean).join(' ');
            }
            return String(item ?? '');
        }).filter(Boolean).join(', ');
    }
    return value || '';
}

function normalizeParameterLists(record) {
    const parameterTypes = Array.isArray(record.parameter_types)
        ? record.parameter_types
        : (Array.isArray(record.parameterTypes) ? record.parameterTypes : []);
    const parameterNames = Array.isArray(record.parameter_names)
        ? record.parameter_names
        : (Array.isArray(record.parameterNames) ? record.parameterNames : []);
    if (!parameterTypes.length && !parameterNames.length) {
        return '';
    }

    const count = Math.max(parameterTypes.length, parameterNames.length);
    const parameters = [];
    for (let index = 0; index < count; index += 1) {
        const type = parameterTypes[index] || '';
        const name = parameterNames[index] || '';
        parameters.push([type, name].filter(Boolean).join(' '));
    }
    return parameters.filter(Boolean).join(', ');
}

function normalizeSignalOrSlot(record) {
    // Needle agent 的能力接口使用 parameter_types/parameter_names，这里兼容成 Overview 的“参数”列。
    const parameters = normalizeParameterLists(record)
        || normalizeCapabilityArgs(record.arguments || record.args || record.parameters);
    return {
        name: record.name || record.method || '',
        signature: record.signature || '',
        returnType: record.returnType || record.return_type || record.returns || '',
        arguments: parameters
    };
}

function splitOverviewState(state) {
    // Sniff provider 把 Needle 返回的能力列表挂在 details.properties 中，这里拆成四个页签各自的数据源。
    const properties = state.properties || {};
    const capabilityKeys = new Set(['supportedProperties', 'supportedSignals', 'supportedSlots']);
    const widgetInfoEntries = Object.entries(properties).filter(([key]) => !capabilityKeys.has(key));

    return {
        widgetInfoEntries,
        supportedProperties: Array.isArray(properties.supportedProperties) ? properties.supportedProperties : [],
        supportedSignals: Array.isArray(properties.supportedSignals) ? properties.supportedSignals.map(normalizeSignalOrSlot) : [],
        supportedSlots: Array.isArray(properties.supportedSlots) ? properties.supportedSlots.map(normalizeSignalOrSlot) : []
    };
}

function renderWidgetDef(widgetDef, matchCount, occurrence) {
    widgetDefText = JSON.stringify(widgetDef || {}, null, 2);
    if (elements.widgetDefMeta) {
        elements.widgetDefMeta.textContent = `match_count: ${matchCount || 1} | occurrence: ${occurrence || 1}`;
    }
    if (elements.widgetDefContainer) {
        elements.widgetDefContainer.textContent = widgetDefText;
    }
}

function renderState(state) {
    const overview = splitOverviewState(state || {});
    renderKeyValueTable(elements.widgetInfoContainer, overview.widgetInfoEntries, '选择控件后显示 WidgetInfo');
    renderRecordsTable(
        elements.propertiesContainer,
        overview.supportedProperties,
        [
            { key: 'name', label: '属性' },
            { key: 'type', label: '类型' },
            { key: 'value', label: '值' }
        ],
        '当前控件没有可展示的支持属性'
    );
    renderRecordsTable(
        elements.signalsContainer,
        overview.supportedSignals,
        [
            { key: 'name', label: '信号' },
            { key: 'signature', label: '签名' },
            { key: 'returnType', label: '返回' },
            { key: 'arguments', label: '参数' }
        ],
        '当前控件没有可展示的信号'
    );
    renderRecordsTable(
        elements.slotsContainer,
        overview.supportedSlots,
        [
            { key: 'name', label: '槽函数' },
            { key: 'signature', label: '签名' },
            { key: 'returnType', label: '返回' },
            { key: 'arguments', label: '参数' }
        ],
        '当前控件没有可展示的槽函数'
    );
    renderWidgetDef((state || {}).widgetDef || {}, (state || {}).matchCount, (state || {}).occurrence);
}

function activateTab(tabName) {
    activeTab = tabName || 'widgetInfo';
    for (const tab of elements.tabs) {
        tab.classList.toggle('active', tab.getAttribute('data-tab') === activeTab);
    }
    for (const panel of elements.panels) {
        panel.classList.toggle('active', panel.getAttribute('data-panel') === activeTab);
    }
    if (vscode) {
        vscode.setState({ activeTab });
    }
}

for (const tab of elements.tabs) {
    tab.addEventListener('click', () => {
        activateTab(tab.getAttribute('data-tab') || 'widgetInfo');
    });
}

elements.copyWidgetDefButton.addEventListener('click', async () => {
    if (!widgetDefText) {
        return;
    }

    if (!vscode || typeof vscode.postMessage !== 'function') {
        return;
    }

    vscode.postMessage({ command: 'copyWidgetDefTemplate' });
});

window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'setOverviewState') {
        renderState(message.state || {});
    }
});

const savedState = vscode ? vscode.getState() || {} : {};
activateTab(typeof savedState.activeTab === 'string' ? savedState.activeTab : 'widgetInfo');
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
