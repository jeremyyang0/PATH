const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

let treeData = [];
let selectedWidgetId = '';
let expandedWidgetIds = new Set();
let errorText = '';
let contextTargetWidgetId = '';
let activeServerName = 'common';
let lastTreeClick = { widgetId: '', time: 0 };

const elements = {
    treeContainer: document.getElementById('treeContainer'),
    treeMeta: document.getElementById('treeMeta'),
    selectionMeta: document.getElementById('selectionMeta'),
    statusIndicator: document.getElementById('statusIndicator'),
    serverNameInput: document.getElementById('serverNameInput'),
    applyServerButton: document.getElementById('applyServerButton'),
    refreshButton: document.getElementById('refreshButton'),
    findButton: document.getElementById('findButton'),
    searchModal: document.getElementById('searchModal'),
    searchWidgetDefInput: document.getElementById('searchWidgetDefInput'),
    searchResultsBody: document.getElementById('searchResultsBody'),
    closeSearchModalButton: document.getElementById('closeSearchModalButton'),
    submitSearchButton: document.getElementById('submitSearchButton'),
    errorModal: document.getElementById('errorModal'),
    errorBody: document.getElementById('errorBody'),
    copyErrorButton: document.getElementById('copyErrorButton'),
    closeErrorModalButton: document.getElementById('closeErrorModalButton'),
    contextMenu: document.getElementById('contextMenu')
};

function postToExtensionHost(message) {
    if (!vscode || typeof vscode.postMessage !== 'function') {
        setStatus('bridge 不可用');
        return;
    }

    try {
        vscode.postMessage(message);
    } catch {
        setStatus('消息发送失败');
    }
}

function getState() {
    if (!vscode) {
        return {};
    }

    return vscode.getState() || {};
}

function saveState() {
    if (!vscode) {
        return;
    }

    vscode.setState({
        expandedWidgetIds: Array.from(expandedWidgetIds),
        selectedWidgetId,
        searchWidgetDefInput: elements.searchWidgetDefInput.value,
        serverNameInput: elements.serverNameInput.value
    });
}

function restoreState() {
    const state = getState();
    if (Array.isArray(state.expandedWidgetIds)) {
        expandedWidgetIds = new Set(state.expandedWidgetIds);
    }

    if (typeof state.selectedWidgetId === 'string') {
        selectedWidgetId = state.selectedWidgetId;
    }

    if (typeof state.searchWidgetDefInput === 'string') {
        elements.searchWidgetDefInput.value = state.searchWidgetDefInput;
    }

    if (typeof state.serverNameInput === 'string' && state.serverNameInput.trim()) {
        elements.serverNameInput.value = state.serverNameInput;
    }
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function setStatus(text) {
    if (elements.statusIndicator) {
        elements.statusIndicator.textContent = text;
    }
}

function setSelectionMeta(text) {
    if (elements.selectionMeta) {
        elements.selectionMeta.textContent = text;
    }
}

function countNodes(nodes) {
    let total = 0;
    for (const node of nodes) {
        total += 1 + countNodes(node.children || []);
    }
    return total;
}

function getNodeLabel(node) {
    return node.text ? `${node.type} - "${node.text}"` : node.type;
}

function findPathToWidget(nodes, widgetId, parentPath = []) {
    for (const node of nodes) {
        const currentPath = [...parentPath, node.widgetId];
        if (node.widgetId === widgetId) {
            return currentPath;
        }

        const childPath = findPathToWidget(node.children || [], widgetId, currentPath);
        if (childPath) {
            return childPath;
        }
    }

    return null;
}

function hasWidget(nodes, widgetId) {
    return Boolean(findPathToWidget(nodes, widgetId));
}

function renderTree() {
    elements.treeMeta.textContent = `${countNodes(treeData)} nodes`;
    if (!treeData.length) {
        elements.treeContainer.innerHTML = '<div class="empty">暂无控件树数据</div>';
        setSelectionMeta('未选择控件');
        return;
    }

    elements.treeContainer.innerHTML = treeData.map(node => renderTreeNode(node, 0)).join('');
}

function renderTreeNode(node, level) {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const isExpanded = expandedWidgetIds.has(node.widgetId);
    const childrenHtml = hasChildren && isExpanded
        ? node.children.map(child => renderTreeNode(child, level + 1)).join('')
        : '';
    const twisty = hasChildren
        ? (isExpanded ? '&#9662;' : '&#9656;')
        : '&#8226;';

    return `
        <div>
            <div
                class="tree-item ${selectedWidgetId === node.widgetId ? 'selected' : ''}"
                data-widget-id="${escapeHtml(node.widgetId)}"
                data-widget-label="${escapeHtml(getNodeLabel(node))}"
                data-has-children="${hasChildren ? '1' : '0'}"
                style="padding-left:${8 + level * 18}px"
            >
                <span class="indent"></span>
                <span class="twisty">${twisty}</span>
                <span class="tree-label">${escapeHtml(getNodeLabel(node))}</span>
            </div>
            ${childrenHtml}
        </div>
    `;
}

function getRequestedServerName() {
    return (elements.serverNameInput.value || '').trim() || 'common';
}

function applyServerName() {
    setStatus('正在切换 server_name');
    saveState();
    postToExtensionHost({
        command: 'setServerName',
        serverName: getRequestedServerName()
    });
}

function selectWidget(widgetId, label = '') {
    if (!hasWidget(treeData, widgetId)) {
        return;
    }

    selectedWidgetId = widgetId;
    const pathToWidget = findPathToWidget(treeData, widgetId) || [];
    for (const pathWidgetId of pathToWidget) {
        expandedWidgetIds.add(pathWidgetId);
    }

    saveState();
    renderTree();
    setSelectionMeta(label || widgetId);
    postToExtensionHost({
        command: 'selectWidget',
        widgetId
    });
}

function highlightWidget(widgetId) {
    setStatus('正在高亮控件');
    postToExtensionHost({
        command: 'highlightWidget',
        widgetId
    });
}

function renderSearchHint(text) {
    elements.searchResultsBody.innerHTML = `<div class="empty">${escapeHtml(text)}</div>`;
}

function openSearchModal() {
    if (!elements.searchResultsBody.innerHTML.trim()) {
        renderSearchHint('输入 widget_def JSON 后开始搜索');
    }

    elements.searchModal.classList.add('visible');
    requestAnimationFrame(() => {
        elements.searchWidgetDefInput.focus();
        elements.searchWidgetDefInput.selectionStart = elements.searchWidgetDefInput.value.length;
        elements.searchWidgetDefInput.selectionEnd = elements.searchWidgetDefInput.value.length;
    });
}

function hideSearchModal() {
    elements.searchModal.classList.remove('visible');
}

function submitSearch() {
    const rawText = elements.searchWidgetDefInput.value.trim();
    saveState();

    if (!rawText) {
        renderSearchHint('请输入 widget_def JSON');
        elements.searchWidgetDefInput.focus();
        return;
    }

    let widgetDef;
    try {
        widgetDef = JSON.parse(rawText);
    } catch (error) {
        showError({
            errorType: 'InvalidJSON',
            error: error instanceof Error ? error.message : String(error)
        });
        return;
    }

    renderSearchHint('正在搜索...');
    setStatus('正在查找');
    postToExtensionHost({
        command: 'findWidgets',
        widgetDef: JSON.stringify(widgetDef)
    });
}

function showSearchResults(results) {
    if (!results || results.length === 0) {
        renderSearchHint('未找到匹配的控件');
    } else {
        elements.searchResultsBody.innerHTML = results.map(result => `
            <div class="result-row" data-widget-id="${escapeHtml(result.widgetId)}" data-widget-label="${escapeHtml(result.type)}">
                ${escapeHtml(`${result.type} - ${result.text || result.name || result.widgetId}`)}
            </div>
        `).join('');
    }

    openSearchModal();
}

function showError(error) {
    errorText = [
        `错误类型: ${error.errorType || 'Unknown'}`,
        `错误消息: ${error.error || 'Unknown'}`
    ].join('\n') + (error.traceback ? `\n\n${error.traceback}` : '');

    elements.errorBody.innerHTML = `<pre class="json-box">${escapeHtml(errorText)}</pre>`;
    elements.errorModal.classList.add('visible');
    setStatus(`请求失败: ${error.errorType || 'Unknown'}`);
}

function hideContextMenu() {
    elements.contextMenu.classList.remove('visible');
    contextTargetWidgetId = '';
}

elements.refreshButton.addEventListener('click', () => {
    const requestedServerName = getRequestedServerName();
    saveState();

    if (requestedServerName !== activeServerName) {
        applyServerName();
        return;
    }

    setStatus('正在刷新');
    postToExtensionHost({
        command: 'refresh',
        serverName: requestedServerName
    });
});

elements.applyServerButton.addEventListener('click', () => {
    applyServerName();
});

elements.serverNameInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        applyServerName();
    }
});

elements.findButton.addEventListener('click', () => {
    openSearchModal();
});

elements.submitSearchButton.addEventListener('click', () => {
    submitSearch();
});

elements.searchWidgetDefInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submitSearch();
    }
});

elements.closeSearchModalButton.addEventListener('click', () => {
    hideSearchModal();
});

elements.searchModal.addEventListener('click', event => {
    if (event.target === elements.searchModal) {
        hideSearchModal();
    }
});

elements.closeErrorModalButton.addEventListener('click', () => {
    elements.errorModal.classList.remove('visible');
});

elements.errorModal.addEventListener('click', event => {
    if (event.target === elements.errorModal) {
        elements.errorModal.classList.remove('visible');
    }
});

elements.copyErrorButton.addEventListener('click', () => {
    postToExtensionHost({
        command: 'copyError',
        text: errorText
    });
});

elements.treeContainer.addEventListener('click', event => {
    hideContextMenu();
    const item = event.target.closest('.tree-item');
    if (!item) {
        return;
    }

    const widgetId = item.getAttribute('data-widget-id');
    if (!widgetId) {
        return;
    }

    const hasChildren = item.getAttribute('data-has-children') === '1';
    if (hasChildren && event.target.classList.contains('twisty')) {
        if (expandedWidgetIds.has(widgetId)) {
            expandedWidgetIds.delete(widgetId);
        } else {
            expandedWidgetIds.add(widgetId);
        }
        saveState();
        renderTree();
        return;
    }

    const now = Date.now();
    const isRepeatedClick = lastTreeClick.widgetId === widgetId && now - lastTreeClick.time < 350;
    lastTreeClick = { widgetId, time: now };

    selectWidget(widgetId, item.getAttribute('data-widget-label') || '');
    if (isRepeatedClick) {
        highlightWidget(widgetId);
    }
});

elements.treeContainer.addEventListener('dblclick', event => {
    const item = event.target.closest('.tree-item');
    if (!item) {
        return;
    }

    const widgetId = item.getAttribute('data-widget-id');
    if (widgetId) {
        selectWidget(widgetId, item.getAttribute('data-widget-label') || '');
        highlightWidget(widgetId);
    }
});

elements.treeContainer.addEventListener('contextmenu', event => {
    event.preventDefault();
    const item = event.target.closest('.tree-item');
    if (!item) {
        hideContextMenu();
        return;
    }

    const widgetId = item.getAttribute('data-widget-id');
    if (!widgetId) {
        return;
    }

    contextTargetWidgetId = widgetId;
    if (selectedWidgetId !== widgetId) {
        selectWidget(widgetId, item.getAttribute('data-widget-label') || '');
    }

    elements.contextMenu.style.left = `${event.clientX}px`;
    elements.contextMenu.style.top = `${event.clientY}px`;
    elements.contextMenu.classList.add('visible');
});

elements.contextMenu.addEventListener('click', event => {
    const action = event.target.getAttribute('data-action');
    if (!action || !contextTargetWidgetId) {
        return;
    }

    if (action === 'view') {
        selectWidget(contextTargetWidgetId);
    } else if (action === 'highlight') {
        highlightWidget(contextTargetWidgetId);
    } else if (action === 'generate') {
        postToExtensionHost({
            command: 'generateWidgetDef',
            widgetId: contextTargetWidgetId
        });
    }

    hideContextMenu();
});

elements.searchResultsBody.addEventListener('click', event => {
    const row = event.target.closest('.result-row');
    if (!row) {
        return;
    }

    const widgetId = row.getAttribute('data-widget-id');
    if (!widgetId) {
        return;
    }

    hideSearchModal();
    selectWidget(widgetId, row.getAttribute('data-widget-label') || '');
    highlightWidget(widgetId);
});

window.addEventListener('click', event => {
    if (!event.target.closest('.context-menu')) {
        hideContextMenu();
    }
});

window.addEventListener('keydown', event => {
    if (event.key !== 'Escape') {
        return;
    }

    hideContextMenu();
    hideSearchModal();
    elements.errorModal.classList.remove('visible');
});

window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'setTree':
            treeData = message.tree || [];
            activeServerName = String(message.serverName || activeServerName);
            elements.serverNameInput.value = activeServerName;
            if (message.resetState) {
                expandedWidgetIds.clear();
                selectedWidgetId = '';
                setSelectionMeta('未选择控件');
                saveState();
            }
            renderTree();
            if (selectedWidgetId) {
                if (hasWidget(treeData, selectedWidgetId)) {
                    selectWidget(selectedWidgetId);
                } else {
                    selectedWidgetId = '';
                    setSelectionMeta('未选择控件');
                    saveState();
                }
            }
            break;
        case 'setStatus':
            setStatus(String(message.text || ''));
            break;
        case 'highlightCompleted':
            setStatus(`已高亮控件 ${String(message.widgetId || '')}`);
            break;
        case 'setSearchResults':
            showSearchResults(message.results || []);
            break;
        case 'showError':
            showError(message.error || {});
            break;
    }
});

restoreState();
renderTree();
renderSearchHint('输入 widget_def JSON 后开始搜索');
setStatus(vscode ? '等待连接' : 'bridge 不可用');
setSelectionMeta('未选择控件');
postToExtensionHost({
    command: 'ready',
    serverName: getRequestedServerName()
});
