const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

let treeData = [];
let selectedWidgetId = '';
let selectedWidgetIds = [];
let expandedWidgetIds = new Set();
let errorText = '';
let contextTargetWidgetId = '';
let activeConnectionLabel = '未连接';
let lastTreeClick = { widgetId: '', time: 0 };
let autoRefreshEnabled = false;
let autoRefreshIntervalSeconds = 5;
let pickInProgress = false;
let ctrlMultiSelectActive = false;
let restoredConnectionForm = false;
let loadAppProfiles = [];
let selectedLoadAppProfileName = '';
let loadAppManagerView = 'list';
let loadAppEditOriginalName = '';

const elements = {
    treeContainer: document.getElementById('treeContainer'),
    treeMeta: document.getElementById('treeMeta'),
    selectionMeta: document.getElementById('selectionMeta'),
    statusIndicator: document.getElementById('statusIndicator'),
    connectionModeSelect: document.getElementById('connectionModeSelect'),
    remoteFields: document.getElementById('remoteFields'),
    attachFields: document.getElementById('attachFields'),
    loadappFields: document.getElementById('loadappFields'),
    hostInput: document.getElementById('hostInput'),
    portInput: document.getElementById('portInput'),
    pidInput: document.getElementById('pidInput'),
    loadAppProfileSelect: document.getElementById('loadAppProfileSelect'),
    manageLoadAppProfilesButton: document.getElementById('manageLoadAppProfilesButton'),
    loadAppManagerModal: document.getElementById('loadAppManagerModal'),
    loadAppManagerTitle: document.getElementById('loadAppManagerTitle'),
    loadAppManagerListView: document.getElementById('loadAppManagerListView'),
    loadAppManagerEditView: document.getElementById('loadAppManagerEditView'),
    loadAppManagerListFooter: document.getElementById('loadAppManagerListFooter'),
    loadAppManagerEditFooter: document.getElementById('loadAppManagerEditFooter'),
    loadAppManagerProfileList: document.getElementById('loadAppManagerProfileList'),
    loadAppManagerNewButton: document.getElementById('loadAppManagerNewButton'),
    loadAppManagerCloseButton: document.getElementById('loadAppManagerCloseButton'),
    loadAppManagerCancelEditButton: document.getElementById('loadAppManagerCancelEditButton'),
    loadAppManagerSaveEditButton: document.getElementById('loadAppManagerSaveEditButton'),
    loadAppEditNameInput: document.getElementById('loadAppEditNameInput'),
    loadAppEditTargetExeInput: document.getElementById('loadAppEditTargetExeInput'),
    loadAppEditArgsInput: document.getElementById('loadAppEditArgsInput'),
    loadAppEditPickExeButton: document.getElementById('loadAppEditPickExeButton'),
    connectButton: document.getElementById('connectButton'),
    connectionLabel: document.getElementById('connectionLabel'),
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
        connectionMode: elements.connectionModeSelect ? elements.connectionModeSelect.value : 'remote',
        host: elements.hostInput ? elements.hostInput.value : '',
        port: elements.portInput ? elements.portInput.value : '',
        pid: elements.pidInput ? elements.pidInput.value : '',
        selectedLoadAppProfileName,
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

    if (typeof state.connectionMode === 'string' && elements.connectionModeSelect) {
        elements.connectionModeSelect.value = state.connectionMode;
        restoredConnectionForm = true;
    }

    if (typeof state.host === 'string' && elements.hostInput) {
        elements.hostInput.value = state.host || '127.0.0.1';
        restoredConnectionForm = true;
    }

    if (typeof state.port === 'string' && elements.portInput) {
        elements.portInput.value = state.port;
        restoredConnectionForm = true;
    }

    if (typeof state.pid === 'string' && elements.pidInput) {
        elements.pidInput.value = state.pid;
        restoredConnectionForm = true;
    }

    if (typeof state.selectedLoadAppProfileName === 'string') {
        selectedLoadAppProfileName = state.selectedLoadAppProfileName;
        restoredConnectionForm = true;
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

function getConnectionMode() {
    const mode = elements.connectionModeSelect ? elements.connectionModeSelect.value : 'remote';
    return ['remote', 'attach', 'loadapp'].includes(mode) ? mode : 'remote';
}

function getConnectionRequest() {
    const mode = getConnectionMode();
    if (mode === 'attach') {
        return {
            mode,
            pid: Number(elements.pidInput ? elements.pidInput.value : 0)
        };
    }
    if (mode === 'loadapp') {
        const profile = findLoadAppProfileByName(selectedLoadAppProfileName);
        return {
            mode,
            profileName: selectedLoadAppProfileName,
            targetExe: profile ? profile.targetExe : '',
            targetArgs: profile ? profile.targetArgs : ''
        };
    }
    return {
        mode,
        host: (elements.hostInput ? elements.hostInput.value : '').trim() || '127.0.0.1',
        port: Number(elements.portInput ? elements.portInput.value : 0)
    };
}

function syncConnectionFields() {
    const mode = getConnectionMode();
    if (elements.remoteFields) {
        elements.remoteFields.classList.toggle('visible', mode === 'remote');
    }
    if (elements.attachFields) {
        elements.attachFields.classList.toggle('visible', mode === 'attach');
    }
    if (elements.loadappFields) {
        elements.loadappFields.classList.toggle('visible', mode === 'loadapp');
    }
}

function applyConnectionForm(connection, force = false) {
    if (!connection || (!force && restoredConnectionForm)) {
        return;
    }

    if (connection.mode && elements.connectionModeSelect) {
        elements.connectionModeSelect.value = String(connection.mode);
    }
    if (connection.host !== undefined && elements.hostInput) {
        elements.hostInput.value = String(connection.host || '127.0.0.1');
    }
    if (connection.port !== undefined && elements.portInput) {
        elements.portInput.value = Number(connection.port) > 0 ? String(connection.port) : '';
    }
    if (connection.pid !== undefined && elements.pidInput) {
        elements.pidInput.value = Number(connection.pid) > 0 ? String(connection.pid) : '';
    }
    if (typeof connection.profileName === 'string') {
        selectedLoadAppProfileName = connection.profileName;
        syncLoadAppProfileSelect();
    }
    restoredConnectionForm = true;
    syncConnectionFields();
    saveState();
}

function connectNeedle() {
    setStatus('正在连接 Needle');
    saveState();
    postToExtensionHost({
        command: 'connect',
        connection: getConnectionRequest()
    });
}

function findLoadAppProfileByName(name) {
    if (!name) {
        return null;
    }
    return loadAppProfiles.find(profile => profile.name === name) || null;
}

// 同步 LoadApp 配置下拉框，保证前端选中项始终对应有效配置。
function syncLoadAppProfileSelect() {
    const select = elements.loadAppProfileSelect;
    if (!select) {
        return;
    }

    const previousValue = selectedLoadAppProfileName;
    select.innerHTML = '';

    if (loadAppProfiles.length === 0) {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '暂无配置（点击 管理配置 新建）';
        placeholder.disabled = true;
        placeholder.selected = true;
        select.appendChild(placeholder);
        selectedLoadAppProfileName = '';
        return;
    }

    for (const profile of loadAppProfiles) {
        const option = document.createElement('option');
        option.value = profile.name;
        option.textContent = profile.name;
        select.appendChild(option);
    }

    if (previousValue && loadAppProfiles.some(profile => profile.name === previousValue)) {
        select.value = previousValue;
        selectedLoadAppProfileName = previousValue;
    } else {
        select.value = loadAppProfiles[0].name;
        selectedLoadAppProfileName = loadAppProfiles[0].name;
    }
}

// 规范化扩展端返回的配置列表，并刷新下拉框与管理弹窗。
function setLoadAppProfiles(profiles, preferredSelectedName) {
    loadAppProfiles = Array.isArray(profiles)
        ? profiles
            .filter(profile => profile && typeof profile.name === 'string' && profile.name)
            .map(profile => ({
                name: String(profile.name),
                targetExe: String(profile.targetExe || ''),
                targetArgs: String(profile.targetArgs || '')
            }))
        : [];

    if (typeof preferredSelectedName === 'string' && preferredSelectedName) {
        selectedLoadAppProfileName = preferredSelectedName;
    }

    syncLoadAppProfileSelect();
    if (loadAppManagerView === 'list' && elements.loadAppManagerModal && elements.loadAppManagerModal.classList.contains('visible')) {
        renderLoadAppManagerList();
    }
    saveState();
}

// 打开配置管理弹窗时主动拉取最新配置，避免展示过期状态。
function openLoadAppManager() {
    if (!elements.loadAppManagerModal) {
        return;
    }
    showLoadAppManagerListView();
    elements.loadAppManagerModal.classList.add('visible');
    postToExtensionHost({ command: 'getLoadAppProfiles' });
}

function closeLoadAppManager() {
    if (!elements.loadAppManagerModal) {
        return;
    }
    elements.loadAppManagerModal.classList.remove('visible');
}

function showLoadAppManagerListView() {
    loadAppManagerView = 'list';
    if (elements.loadAppManagerListView) {
        elements.loadAppManagerListView.hidden = false;
    }
    if (elements.loadAppManagerEditView) {
        elements.loadAppManagerEditView.hidden = true;
    }
    if (elements.loadAppManagerListFooter) {
        elements.loadAppManagerListFooter.hidden = false;
    }
    if (elements.loadAppManagerEditFooter) {
        elements.loadAppManagerEditFooter.hidden = true;
    }
    if (elements.loadAppManagerTitle) {
        elements.loadAppManagerTitle.textContent = 'LoadApp 配置管理';
    }
    renderLoadAppManagerList();
}

function showLoadAppManagerEditView(profile) {
    loadAppManagerView = 'edit';
    loadAppEditOriginalName = profile && profile.name ? profile.name : '';

    if (elements.loadAppEditNameInput) {
        elements.loadAppEditNameInput.value = profile ? profile.name : '';
    }
    if (elements.loadAppEditTargetExeInput) {
        elements.loadAppEditTargetExeInput.value = profile ? profile.targetExe : '';
    }
    if (elements.loadAppEditArgsInput) {
        elements.loadAppEditArgsInput.value = profile ? profile.targetArgs : '';
    }

    if (elements.loadAppManagerListView) {
        elements.loadAppManagerListView.hidden = true;
    }
    if (elements.loadAppManagerEditView) {
        elements.loadAppManagerEditView.hidden = false;
    }
    if (elements.loadAppManagerListFooter) {
        elements.loadAppManagerListFooter.hidden = true;
    }
    if (elements.loadAppManagerEditFooter) {
        elements.loadAppManagerEditFooter.hidden = false;
    }
    if (elements.loadAppManagerTitle) {
        elements.loadAppManagerTitle.textContent = loadAppEditOriginalName ? '编辑 LoadApp 配置' : '新建 LoadApp 配置';
    }

    if (elements.loadAppEditNameInput) {
        elements.loadAppEditNameInput.focus();
    }
}

function renderLoadAppManagerList() {
    const container = elements.loadAppManagerProfileList;
    if (!container) {
        return;
    }

    container.innerHTML = '';

    if (loadAppProfiles.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'profile-list-empty';
        empty.textContent = '暂无配置，点击右上角"新建"添加。';
        container.appendChild(empty);
        return;
    }

    for (const profile of loadAppProfiles) {
        const row = document.createElement('div');
        row.className = 'profile-row';

        const meta = document.createElement('div');
        meta.className = 'profile-row-meta';

        const name = document.createElement('div');
        name.className = 'profile-row-name';
        name.textContent = profile.name;
        meta.appendChild(name);

        const detail = document.createElement('div');
        detail.className = 'profile-row-detail';
        detail.textContent = profile.targetArgs
            ? `${profile.targetExe}  |  ${profile.targetArgs}`
            : profile.targetExe;
        detail.title = detail.textContent;
        meta.appendChild(detail);

        const editButton = document.createElement('button');
        editButton.className = 'button secondary compact-button';
        editButton.type = 'button';
        editButton.textContent = '编辑';
        editButton.addEventListener('click', () => {
            showLoadAppManagerEditView({ ...profile });
        });

        const deleteButton = document.createElement('button');
        deleteButton.className = 'button secondary compact-button';
        deleteButton.type = 'button';
        deleteButton.textContent = '删除';
        deleteButton.addEventListener('click', () => {
            if (window.confirm(`确定删除 LoadApp 配置 "${profile.name}"？`)) {
                postToExtensionHost({
                    command: 'removeLoadAppProfile',
                    name: profile.name
                });
            }
        });

        row.appendChild(meta);
        row.appendChild(editButton);
        row.appendChild(deleteButton);
        container.appendChild(row);
    }
}

// 提交前校验配置名称和 target.exe，校验通过后交给扩展端持久化。
function submitLoadAppEditForm() {
    const name = (elements.loadAppEditNameInput ? elements.loadAppEditNameInput.value : '').trim();
    const targetExe = (elements.loadAppEditTargetExeInput ? elements.loadAppEditTargetExeInput.value : '').trim();
    const targetArgs = elements.loadAppEditArgsInput ? elements.loadAppEditArgsInput.value : '';

    if (!name) {
        window.alert('请填写配置名称。');
        if (elements.loadAppEditNameInput) {
            elements.loadAppEditNameInput.focus();
        }
        return;
    }

    if (!targetExe) {
        window.alert('请选择或输入 target.exe 的路径。');
        if (elements.loadAppEditTargetExeInput) {
            elements.loadAppEditTargetExeInput.focus();
        }
        return;
    }

    postToExtensionHost({
        command: 'upsertLoadAppProfile',
        originalName: loadAppEditOriginalName,
        profile: { name, targetExe, targetArgs }
    });
}

function pickLoadAppExeForEdit() {
    const currentPath = elements.loadAppEditTargetExeInput ? elements.loadAppEditTargetExeInput.value : '';
    postToExtensionHost({
        command: 'pickLoadAppExe',
        currentPath
    });
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
        saveState();
        setStatus('正在刷新');
        postToExtensionHost({
            command: 'refresh'
        });
    });
}

if (elements.connectButton) {
    elements.connectButton.addEventListener('click', () => {
        connectNeedle();
    });
}

if (elements.loadAppProfileSelect) {
    elements.loadAppProfileSelect.addEventListener('change', event => {
        selectedLoadAppProfileName = String(event.target.value || '');
        saveState();
    });
}

if (elements.manageLoadAppProfilesButton) {
    elements.manageLoadAppProfilesButton.addEventListener('click', () => {
        openLoadAppManager();
    });
}

if (elements.loadAppManagerNewButton) {
    elements.loadAppManagerNewButton.addEventListener('click', () => {
        showLoadAppManagerEditView(null);
    });
}

if (elements.loadAppManagerCloseButton) {
    elements.loadAppManagerCloseButton.addEventListener('click', () => {
        closeLoadAppManager();
    });
}

if (elements.loadAppManagerCancelEditButton) {
    elements.loadAppManagerCancelEditButton.addEventListener('click', () => {
        showLoadAppManagerListView();
    });
}

if (elements.loadAppManagerSaveEditButton) {
    elements.loadAppManagerSaveEditButton.addEventListener('click', () => {
        submitLoadAppEditForm();
    });
}

if (elements.loadAppEditPickExeButton) {
    elements.loadAppEditPickExeButton.addEventListener('click', () => {
        pickLoadAppExeForEdit();
    });
}

if (elements.loadAppManagerModal) {
    elements.loadAppManagerModal.addEventListener('click', event => {
        if (event.target === elements.loadAppManagerModal) {
            closeLoadAppManager();
        }
    });
}

for (const input of [elements.loadAppEditNameInput, elements.loadAppEditTargetExeInput, elements.loadAppEditArgsInput]) {
    if (!input) {
        continue;
    }
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            submitLoadAppEditForm();
        }
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

if (elements.connectionModeSelect) {
    elements.connectionModeSelect.addEventListener('change', () => {
        syncConnectionFields();
        saveState();
    });
}

for (const input of [elements.hostInput, elements.portInput, elements.pidInput]) {
    if (!input) {
        continue;
    }
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            connectNeedle();
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
            command: 'pickWidget'
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
            activeConnectionLabel = String(message.connectionLabel || activeConnectionLabel);
            if (elements.connectionLabel) {
                elements.connectionLabel.textContent = activeConnectionLabel;
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
        case 'setConnectionState':
            if (message.connection) {
                activeConnectionLabel = String(message.connection.label || activeConnectionLabel);
                if (elements.connectionLabel) {
                    elements.connectionLabel.textContent = activeConnectionLabel;
                }
                if (message.connection.mode && elements.connectionModeSelect) {
                    elements.connectionModeSelect.value = String(message.connection.mode);
                    syncConnectionFields();
                }
                if (message.connection.host && elements.hostInput) {
                    elements.hostInput.value = String(message.connection.host);
                }
                if (message.connection.port && elements.portInput) {
                    elements.portInput.value = String(message.connection.port);
                }
                if (message.connection.pid && elements.pidInput) {
                    elements.pidInput.value = String(message.connection.pid);
                }
                if (typeof message.connection.profileName === 'string') {
                    selectedLoadAppProfileName = message.connection.profileName;
                    syncLoadAppProfileSelect();
                }
                saveState();
            }
            break;
        case 'setLoadAppProfile':
            applyConnectionForm(message.connection || null, Boolean(message.force));
            break;
        case 'setLoadAppProfiles':
            setLoadAppProfiles(message.profiles, typeof message.selectedName === 'string' ? message.selectedName : undefined);
            break;
        case 'setLoadAppPickedExe':
            if (loadAppManagerView === 'edit' && elements.loadAppEditTargetExeInput && typeof message.path === 'string' && message.path) {
                elements.loadAppEditTargetExeInput.value = message.path;
            }
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
syncConnectionFields();
syncLoadAppProfileSelect();
syncAutoRefreshControls();
syncPickControls();
renderTree();
renderSearchHint('输入 widget_def JSON 后开始搜索');
setStatus(vscode ? '等待连接' : 'bridge unavailable');
updateSelectionMeta();
postToExtensionHost({
    command: 'ready',
    autoRefreshEnabled,
    autoRefreshIntervalSeconds
});
