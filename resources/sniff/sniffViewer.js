const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

let treeData = [];
let selectedWidgetId = '';
let selectedWidgetIds = [];
let expandedWidgetIds = new Set();
let errorText = '';
let contextTargetWidgetId = '';
let activeServerName = 'common';
let lastTreeClick = { widgetId: '', time: 0 };
let autoRefreshEnabled = false;
let autoRefreshIntervalSeconds = 5;
let pickInProgress = false;
let ctrlMultiSelectActive = false;

const elements = {
    treeContainer: document.getElementById('treeContainer'),
    treeMeta: document.getElementById('treeMeta'),
    selectionMeta: document.getElementById('selectionMeta'),
    statusIndicator: document.getElementById('statusIndicator'),
    serverNameInput: document.getElementById('serverNameInput'),
    applyServerButton: document.getElementById('applyServerButton'),
    autoRefreshToggle: document.getElementById('autoRefreshToggle'),
    autoRefreshIntervalInput: document.getElementById('autoRefreshIntervalInput'),
    refreshButton: document.getElementById('refreshButton'),
    pickButton: document.getElementById('pickButton'),
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

ensureBatchCopyContextItem();

function postToExtensionHost(message) {
    if (!vscode || typeof vscode.postMessage !== 'function') {
        setStatus('bridge unavailable');
        return;
    }

    try {
        vscode.postMessage(message);
    } catch {
        setStatus('message post failed');
    }
}

function ensureBatchCopyContextItem() {
    if (!elements.contextMenu || elements.contextMenu.querySelector('[data-action="batch-copy"]')) {
        return;
    }

    const item = document.createElement('div');
    item.className = 'context-item';
    item.setAttribute('data-action', 'batch-copy');
    item.textContent = '批量复制控件定义';
    elements.contextMenu.appendChild(item);
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
        selectedWidgetIds,
        searchWidgetDefInput: elements.searchWidgetDefInput ? elements.searchWidgetDefInput.value : '',
        serverNameInput: elements.serverNameInput ? elements.serverNameInput.value : '',
        autoRefreshEnabled,
        autoRefreshIntervalSeconds
    });
}

function restoreState() {
    const state = getState();
    if (Array.isArray(state.expandedWidgetIds)) {
        expandedWidgetIds = new Set(state.expandedWidgetIds);
    }

    if (Array.isArray(state.selectedWidgetIds)) {
        selectedWidgetIds = state.selectedWidgetIds.filter(widgetId => typeof widgetId === 'string');
    } else if (typeof state.selectedWidgetId === 'string' && state.selectedWidgetId) {
        selectedWidgetIds = [state.selectedWidgetId];
    }

    if (typeof state.selectedWidgetId === 'string') {
        selectedWidgetId = state.selectedWidgetId;
    } else {
        selectedWidgetId = selectedWidgetIds[selectedWidgetIds.length - 1] || '';
    }

    if (typeof state.searchWidgetDefInput === 'string' && elements.searchWidgetDefInput) {
        elements.searchWidgetDefInput.value = state.searchWidgetDefInput;
    }

    if (typeof state.serverNameInput === 'string' && state.serverNameInput.trim() && elements.serverNameInput) {
        elements.serverNameInput.value = state.serverNameInput;
    }

    if (typeof state.autoRefreshEnabled === 'boolean') {
        autoRefreshEnabled = state.autoRefreshEnabled;
    }

    if (Number.isFinite(state.autoRefreshIntervalSeconds)) {
        autoRefreshIntervalSeconds = normalizeAutoRefreshInterval(state.autoRefreshIntervalSeconds);
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

function findWidgetNode(nodes, widgetId) {
    for (const node of nodes) {
        if (node.widgetId === widgetId) {
            return node;
        }

        const childNode = findWidgetNode(node.children || [], widgetId);
        if (childNode) {
            return childNode;
        }
    }

    return null;
}

function hasWidget(nodes, widgetId) {
    return Boolean(findPathToWidget(nodes, widgetId));
}

function getLabelByWidgetId(widgetId) {
    const node = findWidgetNode(treeData, widgetId);
    return node ? getNodeLabel(node) : widgetId;
}

function updateSelectionMeta() {
    if (!selectedWidgetIds.length) {
        setSelectionMeta('未选择控件');
        return;
    }

    if (selectedWidgetIds.length === 1) {
        setSelectionMeta(getLabelByWidgetId(selectedWidgetIds[0]));
        return;
    }

    setSelectionMeta(`已选中 ${selectedWidgetIds.length} 个控件`);
}

function findTreeItemElement(widgetId) {
    if (!elements.treeContainer || !widgetId) {
        return null;
    }

    const items = elements.treeContainer.querySelectorAll('.tree-item');
    for (const item of items) {
        if (item.getAttribute('data-widget-id') === widgetId) {
            return item;
        }
    }

    return null;
}

function revealWidgetInTree(widgetId) {
    if (!widgetId) {
        return;
    }

    requestAnimationFrame(() => {
        const item = findTreeItemElement(widgetId);
        if (item) {
            item.scrollIntoView({
                block: 'center',
                inline: 'nearest'
            });
        }
    });
}

function renderTree() {
    if (elements.treeMeta) {
        elements.treeMeta.textContent = `${countNodes(treeData)} nodes`;
    }

    if (!treeData.length) {
        if (elements.treeContainer) {
            elements.treeContainer.innerHTML = '<div class="empty">暂无控件树数据</div>';
        }
        setSelectionMeta('未选择控件');
        return;
    }

    if (elements.treeContainer) {
        elements.treeContainer.innerHTML = treeData.map(node => renderTreeNode(node, 0)).join('');
    }
}

function renderTreeNode(node, level) {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const isExpanded = expandedWidgetIds.has(node.widgetId);
    const isSelected = selectedWidgetIds.includes(node.widgetId);
    const childrenHtml = hasChildren && isExpanded
        ? node.children.map(child => renderTreeNode(child, level + 1)).join('')
        : '';
    const chevronSvg = '<svg class="icon-chevron" viewBox="0 0 16 16" fill="currentColor"><path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06z"/></svg>';
    const twisty = hasChildren
        ? `<span class="twisty ${isExpanded ? 'expanded' : ''}">${chevronSvg}</span>`
        : '<span class="twisty leaf"><span class="icon-dot"></span></span>';

    return `
        <div>
            <div
                class="tree-item ${isSelected ? 'selected' : ''}"
                data-widget-id="${escapeHtml(node.widgetId)}"
                data-widget-label="${escapeHtml(getNodeLabel(node))}"
                data-has-children="${hasChildren ? '1' : '0'}"
                style="padding-left:${8 + level * 18}px"
            >
                <span class="indent"></span>
                ${twisty}
                <span class="tree-label">${escapeHtml(getNodeLabel(node))}</span>
            </div>
            ${childrenHtml}
        </div>
    `;
}

function getRequestedServerName() {
    return (elements.serverNameInput ? elements.serverNameInput.value : '').trim() || 'common';
}

function normalizeAutoRefreshInterval(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return 5;
    }

    return Math.max(1, Math.min(3600, Math.floor(numericValue)));
}

function syncAutoRefreshControls() {
    if (elements.autoRefreshToggle) {
        elements.autoRefreshToggle.checked = autoRefreshEnabled;
    }

    if (elements.autoRefreshIntervalInput) {
        elements.autoRefreshIntervalInput.value = String(autoRefreshIntervalSeconds);
    }
}

function syncPickControls() {
    if (!elements.pickButton) {
        return;
    }

    elements.pickButton.disabled = pickInProgress;
    elements.pickButton.title = pickInProgress ? '拾取进行中' : '拾取控件';
    elements.pickButton.setAttribute('aria-label', pickInProgress ? '拾取进行中' : '拾取控件');
}

function applyAutoRefreshSettings() {
    syncAutoRefreshControls();
    saveState();
    postToExtensionHost({
        command: 'setAutoRefresh',
        enabled: autoRefreshEnabled,
        intervalSeconds: autoRefreshIntervalSeconds
    });
}

function applyServerName() {
    setStatus('正在切换 server_name');
    saveState();
    postToExtensionHost({
        command: 'setServerName',
        serverName: getRequestedServerName()
    });
}

function normalizeSelection(widgetIds) {
    const normalized = [];
    for (const widgetId of widgetIds) {
        if (!widgetId || normalized.includes(widgetId) || !hasWidget(treeData, widgetId)) {
            continue;
        }

        normalized.push(widgetId);
    }

    return normalized;
}

function expandSelection(widgetIds) {
    for (const widgetId of widgetIds) {
        const pathToWidget = findPathToWidget(treeData, widgetId) || [];
        for (const pathWidgetId of pathToWidget) {
            expandedWidgetIds.add(pathWidgetId);
        }
    }
}

function applySelection(widgetIds, primaryWidgetId, options = {}) {
    const requestDetails = options.requestDetails !== false;
    const revealPrimaryWidget = options.revealPrimaryWidget === true;
    const normalizedWidgetIds = normalizeSelection(widgetIds);
    const resolvedPrimaryWidgetId = normalizedWidgetIds.includes(primaryWidgetId)
        ? primaryWidgetId
        : (normalizedWidgetIds[normalizedWidgetIds.length - 1] || '');

    selectedWidgetIds = normalizedWidgetIds;
    selectedWidgetId = resolvedPrimaryWidgetId;
    expandSelection(selectedWidgetIds);
    saveState();
    renderTree();
    if (revealPrimaryWidget && selectedWidgetId) {
        revealWidgetInTree(selectedWidgetId);
    }
    updateSelectionMeta();

    if (!requestDetails) {
        return;
    }

    if (!selectedWidgetId) {
        postToExtensionHost({ command: 'clearSelection' });
        return;
    }

    postToExtensionHost({
        command: 'selectWidget',
        widgetId: selectedWidgetId
    });
}

function selectSingleWidget(widgetId) {
    applySelection([widgetId], widgetId, { requestDetails: true });
}

function toggleWidgetSelection(widgetId) {
    const isSelected = selectedWidgetIds.includes(widgetId);
    if (isSelected) {
        const nextSelectedWidgetIds = selectedWidgetIds.filter(currentWidgetId => currentWidgetId !== widgetId);
        const nextPrimaryWidgetId = selectedWidgetId === widgetId
            ? (nextSelectedWidgetIds[nextSelectedWidgetIds.length - 1] || '')
            : selectedWidgetId;
        applySelection(nextSelectedWidgetIds, nextPrimaryWidgetId, {
            requestDetails: selectedWidgetId === widgetId
        });
        return;
    }

    applySelection([...selectedWidgetIds, widgetId], widgetId, { requestDetails: true });
}

function syncSelectionWithTree() {
    const validWidgetIds = normalizeSelection(selectedWidgetIds);
    const primaryWidgetId = validWidgetIds.includes(selectedWidgetId)
        ? selectedWidgetId
        : (validWidgetIds[validWidgetIds.length - 1] || '');
    selectedWidgetIds = validWidgetIds;
    selectedWidgetId = primaryWidgetId;
    saveState();
    updateSelectionMeta();
}

function highlightWidget(widgetId) {
    if (!widgetId) {
        return;
    }

    setStatus('正在高亮控件');
    postToExtensionHost({
        command: 'highlightWidget',
        widgetId
    });
}

function renderSearchHint(text) {
    if (elements.searchResultsBody) {
        elements.searchResultsBody.innerHTML = `<div class="empty">${escapeHtml(text)}</div>`;
    }
}

function openSearchModal() {
    if (elements.searchResultsBody && !elements.searchResultsBody.innerHTML.trim()) {
        renderSearchHint('输入 widget_def JSON 后开始搜索');
    }

    if (elements.searchModal) {
        elements.searchModal.classList.add('visible');
    }

    requestAnimationFrame(() => {
        if (!elements.searchWidgetDefInput) {
            return;
        }

        elements.searchWidgetDefInput.focus();
        elements.searchWidgetDefInput.selectionStart = elements.searchWidgetDefInput.value.length;
        elements.searchWidgetDefInput.selectionEnd = elements.searchWidgetDefInput.value.length;
    });
}

function hideSearchModal() {
    if (elements.searchModal) {
        elements.searchModal.classList.remove('visible');
    }
}

function submitSearch() {
    const rawText = elements.searchWidgetDefInput ? elements.searchWidgetDefInput.value.trim() : '';
    saveState();

    if (!rawText) {
        renderSearchHint('请输入 widget_def JSON');
        if (elements.searchWidgetDefInput) {
            elements.searchWidgetDefInput.focus();
        }
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
    if (!elements.searchResultsBody) {
        return;
    }

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

    if (elements.errorBody) {
        elements.errorBody.innerHTML = `<pre class="json-box">${escapeHtml(errorText)}</pre>`;
    }
    if (elements.errorModal) {
        elements.errorModal.classList.add('visible');
    }
    setStatus(`请求失败: ${error.errorType || 'Unknown'}`);
}

function hideContextMenu() {
    if (elements.contextMenu) {
        elements.contextMenu.classList.remove('visible');
    }
    contextTargetWidgetId = '';
}

if (elements.refreshButton) {
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
}

if (elements.applyServerButton) {
    elements.applyServerButton.addEventListener('click', () => {
        applyServerName();
    });
}

if (elements.autoRefreshToggle) {
    elements.autoRefreshToggle.addEventListener('change', event => {
        autoRefreshEnabled = Boolean(event.target.checked);
        applyAutoRefreshSettings();
    });
}

if (elements.autoRefreshIntervalInput) {
    elements.autoRefreshIntervalInput.addEventListener('change', event => {
        autoRefreshIntervalSeconds = normalizeAutoRefreshInterval(event.target.value);
        applyAutoRefreshSettings();
    });
}

if (elements.serverNameInput) {
    elements.serverNameInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            applyServerName();
        }
    });
}

if (elements.findButton) {
    elements.findButton.addEventListener('click', () => {
        openSearchModal();
    });
}

if (elements.pickButton) {
    elements.pickButton.addEventListener('click', () => {
        if (pickInProgress) {
            return;
        }

        setStatus('正在准备拾取');
        saveState();
        postToExtensionHost({
            command: 'pickWidget',
            serverName: getRequestedServerName()
        });
    });
}

if (elements.submitSearchButton) {
    elements.submitSearchButton.addEventListener('click', () => {
        submitSearch();
    });
}

if (elements.searchWidgetDefInput) {
    elements.searchWidgetDefInput.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submitSearch();
        }
    });
}

if (elements.closeSearchModalButton) {
    elements.closeSearchModalButton.addEventListener('click', () => {
        hideSearchModal();
    });
}

if (elements.searchModal) {
    elements.searchModal.addEventListener('click', event => {
        if (event.target === elements.searchModal) {
            hideSearchModal();
        }
    });
}

if (elements.closeErrorModalButton) {
    elements.closeErrorModalButton.addEventListener('click', () => {
        if (elements.errorModal) {
            elements.errorModal.classList.remove('visible');
        }
    });
}

if (elements.errorModal) {
    elements.errorModal.addEventListener('click', event => {
        if (event.target === elements.errorModal) {
            elements.errorModal.classList.remove('visible');
        }
    });
}

if (elements.copyErrorButton) {
    elements.copyErrorButton.addEventListener('click', () => {
        postToExtensionHost({
            command: 'copyError',
            text: errorText
        });
    });
}

if (elements.treeContainer) {
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
        if (hasChildren && event.target.closest('.twisty')) {
            if (expandedWidgetIds.has(widgetId)) {
                expandedWidgetIds.delete(widgetId);
            } else {
                expandedWidgetIds.add(widgetId);
            }
            saveState();
            renderTree();
            return;
        }

        const isAdditiveSelection = ctrlMultiSelectActive || event.ctrlKey || event.metaKey;
        const now = Date.now();
        const isRepeatedClick = !isAdditiveSelection
            && lastTreeClick.widgetId === widgetId
            && now - lastTreeClick.time < 350;
        lastTreeClick = { widgetId, time: now };

        if (isAdditiveSelection) {
            toggleWidgetSelection(widgetId);
        } else {
            selectSingleWidget(widgetId);
        }

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
            selectSingleWidget(widgetId);
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
        if (!selectedWidgetIds.includes(widgetId)) {
            selectSingleWidget(widgetId);
        }

        if (!elements.contextMenu) {
            return;
        }

        elements.contextMenu.style.left = `${event.clientX}px`;
        elements.contextMenu.style.top = `${event.clientY}px`;
        elements.contextMenu.classList.add('visible');
    });
}

if (elements.contextMenu) {
    elements.contextMenu.addEventListener('click', event => {
        const actionElement = event.target.closest('[data-action]');
        const action = actionElement ? actionElement.getAttribute('data-action') : '';
        if (!action || !contextTargetWidgetId) {
            return;
        }

        if (action === 'view') {
            const nextSelectedWidgetIds = selectedWidgetIds.includes(contextTargetWidgetId)
                ? selectedWidgetIds
                : [contextTargetWidgetId];
            applySelection(nextSelectedWidgetIds, contextTargetWidgetId, { requestDetails: true });
        } else if (action === 'highlight') {
            highlightWidget(contextTargetWidgetId);
        } else if (action === 'generate') {
            postToExtensionHost({
                command: 'generateWidgetDef',
                widgetId: contextTargetWidgetId
            });
        } else if (action === 'batch-copy') {
            const widgetIds = selectedWidgetIds.length > 0 ? selectedWidgetIds : [contextTargetWidgetId];
            postToExtensionHost({
                command: 'copyWidgetDefs',
                widgetIds
            });
        }

        hideContextMenu();
    });
}

if (elements.searchResultsBody) {
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
        selectSingleWidget(widgetId);
        highlightWidget(widgetId);
    });
}

window.addEventListener('click', event => {
    if (!event.target.closest('.context-menu')) {
        hideContextMenu();
    }
});

window.addEventListener('keydown', event => {
    if (event.key === 'Control') {
        ctrlMultiSelectActive = true;
    }

    if (event.key !== 'Escape') {
        return;
    }

    hideContextMenu();
    hideSearchModal();
    if (elements.errorModal) {
        elements.errorModal.classList.remove('visible');
    }
});

window.addEventListener('keyup', event => {
    if (event.key === 'Control') {
        ctrlMultiSelectActive = false;
    }
});

window.addEventListener('blur', () => {
    ctrlMultiSelectActive = false;
});

window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'setTree':
            treeData = message.tree || [];
            activeServerName = String(message.serverName || activeServerName);
            if (elements.serverNameInput) {
                elements.serverNameInput.value = activeServerName;
            }
            if (message.resetState) {
                selectedWidgetId = '';
                selectedWidgetIds = [];
                expandedWidgetIds.clear();
                saveState();
            } else {
                syncSelectionWithTree();
            }
            renderTree();
            updateSelectionMeta();
            break;
        case 'setStatus':
            setStatus(String(message.text || ''));
            break;
        case 'highlightCompleted':
            setStatus(`已高亮控件 ${String(message.widgetId || '')}`);
            break;
        case 'setAutoRefreshState':
            autoRefreshEnabled = Boolean(message.enabled);
            autoRefreshIntervalSeconds = normalizeAutoRefreshInterval(message.intervalSeconds);
            syncAutoRefreshControls();
            saveState();
            break;
        case 'setPickState':
            pickInProgress = Boolean(message.inProgress);
            syncPickControls();
            break;
        case 'applyExternalSelection':
            applySelection(message.widgetIds || [], String(message.primaryWidgetId || ''), {
                requestDetails: false,
                revealPrimaryWidget: true
            });
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
syncAutoRefreshControls();
syncPickControls();
renderTree();
renderSearchHint('输入 widget_def JSON 后开始搜索');
setStatus(vscode ? '等待连接' : 'bridge unavailable');
updateSelectionMeta();
postToExtensionHost({
    command: 'ready',
    serverName: getRequestedServerName(),
    autoRefreshEnabled,
    autoRefreshIntervalSeconds
});
