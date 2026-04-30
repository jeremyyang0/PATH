const vscode = (function () {
    if (typeof acquireVsCodeApi !== 'undefined') {
        return acquireVsCodeApi();
    }
    return null;
})();

let treeData = [];
let filteredData = [];
let expandedItems = new Set();
let currentSearchKeyword = '';
let isAllExpanded = false;
let shouldExpandOnUpdate = false;
let currentContextTarget = null;

class DragDropManager {
    constructor() {
        this.draggedElement = null;
        this.setup();
    }

    setup() {
        document.addEventListener('dragstart', this.handleDragStart.bind(this));
        document.addEventListener('dragover', this.handleDragOver.bind(this));
        document.addEventListener('drop', this.handleDrop.bind(this));
        document.addEventListener('dragend', this.handleDragEnd.bind(this));
    }

    handleDragStart(event) {
        if (event.target.closest('.context-menu') ||
            event.target.closest('.tree-actions') ||
            event.target.closest('.action-button')) {
            event.preventDefault();
            return;
        }

        const treeItem = event.target.closest('.tree-item');
        if (!treeItem || treeItem.getAttribute('data-nodetype') !== 'element') {
            event.preventDefault();
            return;
        }

        if (event.target.classList.contains('expand-icon')) {
            event.preventDefault();
            return;
        }

        const codePath = treeItem.getAttribute('data-codepath');
        const label = treeItem.getAttribute('data-label') || codePath;
        if (!codePath) {
            event.preventDefault();
            return;
        }

        this.draggedElement = treeItem;
        event.dataTransfer.setData('text/plain', codePath + '\n');
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/vnd.code.tree', JSON.stringify({
            codePath,
            elementName: label,
            type: 'element'
        }));
        treeItem.classList.add('dragging');
    }

    handleDragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    }

    handleDrop(event) {
        event.preventDefault();
        const codePath = event.dataTransfer.getData('text/plain');
        if (codePath && vscode) {
            vscode.postMessage({
                command: 'dragToEditor',
                codePath: codePath.trim()
            });
        }
    }

    handleDragEnd() {
        if (this.draggedElement) {
            this.draggedElement.classList.remove('dragging');
            this.draggedElement = null;
        }
    }
}

function saveState() {
    if (!vscode) {
        return;
    }

    vscode.setState({
        expandedItems: Array.from(expandedItems),
        currentSearchKeyword
    });
}

function restoreState(updateInput = true) {
    if (!vscode) {
        return;
    }

    const state = vscode.getState();
    if (!state) {
        return;
    }

    if (Array.isArray(state.expandedItems)) {
        expandedItems = new Set(state.expandedItems);
    }

    if (typeof state.currentSearchKeyword === 'string') {
        currentSearchKeyword = state.currentSearchKeyword;
        if (updateInput) {
            document.getElementById('searchInput').value = currentSearchKeyword;
        }
    }
}

function escapeHtml(value) {
    if (!value) {
        return '';
    }

    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getNodeType(item) {
    if (item.nodeType) {
        return item.nodeType;
    }
    return item.isLeaf ? 'element' : 'folder';
}

function collectExpandablePaths(items, targetSet) {
    for (const item of items) {
        if (item.children && item.children.length > 0) {
            targetSet.add(item.fullPath);
            collectExpandablePaths(item.children, targetSet);
        }
    }
}

function performSearch() {
    currentSearchKeyword = document.getElementById('searchInput').value.trim();
    shouldExpandOnUpdate = true;
    saveState();

    if (vscode) {
        vscode.postMessage({
            command: 'search',
            keyword: currentSearchKeyword
        });
    }
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    currentSearchKeyword = '';
    shouldExpandOnUpdate = false;
    saveState();

    if (vscode) {
        vscode.postMessage({ command: 'clearSearch' });
    }
}

function refreshData() {
    if (vscode) {
        vscode.postMessage({ command: 'refresh' });
    }
    showLoading();
}

function toggleExpandCollapseAll() {
    isAllExpanded = !isAllExpanded;
    updateToggleBtnState();

    if (isAllExpanded) {
        collectExpandablePaths(filteredData, expandedItems);
        if (vscode) {
            vscode.postMessage({ command: 'expandAll' });
        }
    } else {
        expandedItems.clear();
        if (vscode) {
            vscode.postMessage({ command: 'collapseAll' });
        }
    }

    saveState();
    renderTree();
}

function updateToggleBtnState() {
    const textSpan = document.getElementById('toggleExpandText');
    const verticalBar = document.getElementById('toggleExpandVerticalBar');
    const button = document.getElementById('toggleExpandBtn');

    if (textSpan) {
        textSpan.innerText = isAllExpanded ? '收起' : '展开';
    }

    if (button) {
        button.title = isAllExpanded ? '收起全部' : '展开全部';
    }

    if (verticalBar) {
        verticalBar.style.display = isAllExpanded ? 'none' : 'block';
    }
}

function showLoading() {
    document.getElementById('treeContainer').innerHTML = '<div class="message-container"><div class="spinner"></div><div>正在加载数据...</div></div>';
}

function showDebugStatus(text) {
    console.debug('[EleTree]', text);
    if (treeData.length > 0) {
        return;
    }
    document.getElementById('treeContainer').innerHTML = `<div class="message-container"><div>${escapeHtml(text)}</div></div>`;
}

function updateTreeData(data) {
    treeData = data;
    filteredData = data;
    renderTree();
}

function renderTree() {
    const container = document.getElementById('treeContainer');
    if (!filteredData || filteredData.length === 0) {
        container.innerHTML = '<div class="message-container"><div>没有找到匹配的结果</div></div>';
        return;
    }

    let html = '';
    for (const item of filteredData) {
        html += renderTreeItem(item, 0);
    }

    container.innerHTML = html;
}

function renderTreeItem(item, level) {
    const nodeType = getNodeType(item);
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.has(item.fullPath);
    const isElement = nodeType === 'element';

    let html = `<div class="tree-item ${isElement ? 'leaf' : 'folder'}" data-path="${escapeHtml(item.fullPath)}" data-nodetype="${escapeHtml(nodeType)}"`;

    if (isElement && item.eleFilePath) {
        html += ` data-filepath="${escapeHtml(item.eleFilePath)}"`;
        html += ` data-line="${item.eleLineNumber || 1}"`;
        html += ` data-codepath="${escapeHtml(item.codePath || '')}"`;
        html += ` data-variablename="${escapeHtml(item.eleVariableName || '')}"`;
        html += ` data-label="${escapeHtml(item.label)}"`;
        html += ' ondblclick="openFileOnDoubleClick(this)" draggable="true"';
    } else if (nodeType === 'folder') {
        html += ` data-filepath="${escapeHtml(item.filePath || '')}"`;
    }

    html += '>';

    for (let index = 0; index < level; index++) {
        html += '<span class="indent"></span>';
    }

    const chevronSvg = '<svg class="icon-chevron" viewBox="0 0 16 16" fill="currentColor"><path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06z"/></svg>';

    if (hasChildren) {
        html += `<span class="expand-icon ${isExpanded ? 'expanded' : 'expandable'}" onclick="toggleExpand('${escapeHtml(item.fullPath)}')">${chevronSvg}</span>`;
    } else if (isElement) {
        html += '<span class="expand-icon leaf"><div class="icon-dot"></div></span>';
    } else {
        html += '<span class="expand-icon leaf"><div class="icon-folder"></div></span>';
    }

    html += `<span class="tree-label" onclick="selectItem('${escapeHtml(item.fullPath)}')">${escapeHtml(item.label)}</span>`;

    if (isElement && item.eleFilePath) {
        const fileIcon = '<svg class="action-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M13.85 4.44l-3.28-3.3a.87.87 0 0 0-.6-.25H2.5a.5.5 0 0 0-.5.5v13.5a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5V5.03a.85.85 0 0 0-.25-.6zM10.5 2L13 4.5H10.5V2zM3 14V2h6.5v3h3v9H3z"/></svg>';
        const editIcon = '<svg class="action-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M11.01 10.26A1.05 1.05 0 0 1 12.06 9c.16 0 .32.05.45.14l2.16 1.62c.1.07.16.18.16.3a.53.53 0 0 1-.22.42l-2.45 1.83a.98.98 0 0 1-.59.2c-.32 0-.62-.15-.81-.4l-2.18-2.9 2.43-1.95zM12.98 2.02l-9.35 9.45-1.57 3.51.98-3.92L12.38 1.61a.85.85 0 0 1 1.2 0l1 1a.85.85 0 0 1-.02 1.21l-1.58-1.8zM4.1 12.6l6.83-6.9L12.02 6.8 5.2 13.7l-1.1-1.1zm-.55 1.7l3.41-1.06L5.8 12.08l-2.25 2.22z"/></svg>';

        html += '<div class="tree-actions">';
        html += `<button class="action-button" onclick="openFile(this)" data-filepath="${escapeHtml(item.eleFilePath)}" data-line="${item.eleLineNumber || 1}" title="打开文件">${fileIcon}</button>`;
        if (item.codePath) {
            html += `<button class="action-button" onclick="dragToEditor(this)" data-codepath="${escapeHtml(item.codePath)}" title="拖拽插入">${editIcon}</button>`;
        }
        html += '</div>';
    }

    html += '</div>';

    if (hasChildren && isExpanded) {
        for (const child of item.children) {
            html += renderTreeItem(child, level + 1);
        }
    }

    return html;
}

function toggleExpand(treePath) {
    if (expandedItems.has(treePath)) {
        expandedItems.delete(treePath);
    } else {
        expandedItems.add(treePath);
    }
    saveState();
    renderTree();
}

function hideContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (!menu) {
        return;
    }

    menu.classList.add('hidden');
    menu.innerHTML = '';
    currentContextTarget = null;
}

function createElementPayloadFromTreeItem(itemElement) {
    return {
        label: itemElement.getAttribute('data-label') || itemElement.querySelector('.tree-label')?.textContent || '',
        fullPath: itemElement.getAttribute('data-path') || '',
        eleFilePath: itemElement.getAttribute('data-filepath') || '',
        eleVariableName: itemElement.getAttribute('data-variablename') || ''
    };
}

function collectElementPayloads(node, bucket) {
    if (!node) {
        return;
    }

    if (getNodeType(node) === 'element' && node.eleFilePath && node.eleVariableName) {
        bucket.push({
            label: node.label || node.eleVariableName,
            fullPath: node.fullPath || '',
            eleFilePath: node.eleFilePath,
            eleVariableName: node.eleVariableName
        });
    }

    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            collectElementPayloads(child, bucket);
        }
    }
}

function buildFolderElementPayloads(treePath) {
    const node = findNodeByPath(treeData, treePath);
    if (!node) {
        return [];
    }

    const payloads = [];
    collectElementPayloads(node, payloads);
    return payloads;
}

function addContextMenuAction(menu, label, handler) {
    const button = document.createElement('button');
    button.className = 'context-menu-item';
    button.textContent = label;
    button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        hideContextMenu();
        handler();
    });
    menu.appendChild(button);
}

function addContextMenuSeparator(menu) {
    const separator = document.createElement('div');
    separator.className = 'context-menu-separator';
    menu.appendChild(separator);
}

/**
 * 恢复元素树自定义右键菜单，元素节点支持单个生成，目录节点支持批量生成。
 */
function showContextMenu(clientX, clientY, itemElement) {
    const menu = document.getElementById('contextMenu');
    if (!menu) {
        return;
    }

    const nodeType = itemElement.getAttribute('data-nodetype');
    const treePath = itemElement.getAttribute('data-path') || '';
    const codePath = itemElement.getAttribute('data-codepath') || '';
    const filePath = itemElement.getAttribute('data-filepath') || '';
    const lineNumber = parseInt(itemElement.getAttribute('data-line') || '1', 10) || 1;

    menu.innerHTML = '';
    currentContextTarget = itemElement;

    if (nodeType === 'element') {
        const elementPayload = createElementPayloadFromTreeItem(itemElement);
        addContextMenuAction(menu, '打开文件', () => {
            if (vscode && filePath) {
                vscode.postMessage({
                    command: 'openFile',
                    filePath,
                    lineNumber
                });
            }
        });
        addContextMenuAction(menu, '插入到编辑器', () => {
            if (vscode && codePath) {
                vscode.postMessage({
                    command: 'dragToEditor',
                    codePath
                });
            }
        });
        addContextMenuSeparator(menu);
        addContextMenuAction(menu, '生成点击方法', () => {
            if (vscode) {
                vscode.postMessage({
                    command: 'addOperation',
                    element: elementPayload,
                    operationType: 'click'
                });
            }
        });
        addContextMenuAction(menu, '生成双击方法', () => {
            if (vscode) {
                vscode.postMessage({
                    command: 'addOperation',
                    element: elementPayload,
                    operationType: 'double_click'
                });
            }
        });
    } else if (nodeType === 'folder') {
        const elements = buildFolderElementPayloads(treePath);
        if (elements.length === 0) {
            return;
        }

        addContextMenuAction(menu, `批量生成点击方法 (${elements.length})`, () => {
            if (vscode) {
                vscode.postMessage({
                    command: 'batchAddOperation',
                    elements,
                    operationType: 'click'
                });
            }
        });
        addContextMenuAction(menu, `批量生成双击方法 (${elements.length})`, () => {
            if (vscode) {
                vscode.postMessage({
                    command: 'batchAddOperation',
                    elements,
                    operationType: 'double_click'
                });
            }
        });
        addContextMenuAction(menu, `批量生成点击+双击 (${elements.length})`, () => {
            if (vscode) {
                vscode.postMessage({
                    command: 'batchAddOperation',
                    elements,
                    operationType: 'all'
                });
            }
        });
    } else {
        return;
    }

    selectItem(treePath);
    menu.classList.remove('hidden');

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const menuWidth = menu.offsetWidth || 180;
    const menuHeight = menu.offsetHeight || 120;
    const left = Math.min(clientX, viewportWidth - menuWidth - 8);
    const top = Math.min(clientY, viewportHeight - menuHeight - 8);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
}

function selectItem(treePath) {
    const selected = document.querySelector('.tree-item.selected');
    if (selected) {
        selected.classList.remove('selected');
    }

    const item = document.querySelector(`[data-path="${escapeHtml(treePath)}"]`);
    if (item) {
        item.classList.add('selected');
        if (vscode) {
            vscode.postMessage({
                command: 'selectItem',
                item: {
                    fullPath: treePath,
                    label: item.getAttribute('data-label') || item.querySelector('.tree-label')?.textContent || '',
                    codePath: item.getAttribute('data-codepath') || '',
                    eleFilePath: item.getAttribute('data-filepath') || '',
                    eleLineNumber: parseInt(item.getAttribute('data-line') || '0', 10) || 0,
                    eleVariableName: item.getAttribute('data-variablename') || ''
                }
            });
        }
    }
}

/**
 * 根据元素文件和变量名定位前端树节点，并自动展开祖先、滚动到可见区域。
 */
function revealElementInTree(target) {
    const matched = findTreePathByTarget(treeData, target);
    if (!matched) {
        return;
    }

    for (const ancestor of matched.ancestors) {
        if (ancestor.fullPath) {
            expandedItems.add(ancestor.fullPath);
        }
    }

    saveState();
    renderTree();
    selectItem(matched.item.fullPath);

    const selectedItem = document.querySelector(`[data-path="${escapeHtml(matched.item.fullPath)}"]`);
    if (selectedItem) {
        selectedItem.scrollIntoView({
            block: 'center',
            behavior: 'smooth'
        });
    }
}

function openFile(button) {
    const filePath = button.getAttribute('data-filepath');
    const lineNumber = parseInt(button.getAttribute('data-line') || '1', 10);
    if (vscode && filePath) {
        vscode.postMessage({
            command: 'openFile',
            filePath,
            lineNumber
        });
    }
}

function openFileOnDoubleClick(element) {
    const filePath = element.getAttribute('data-filepath');
    const lineNumber = parseInt(element.getAttribute('data-line') || '1', 10);
    if (vscode && filePath) {
        vscode.postMessage({
            command: 'openFile',
            filePath,
            lineNumber
        });
    }
}

function dragToEditor(button) {
    const codePath = button.getAttribute('data-codepath');
    if (vscode && codePath) {
        vscode.postMessage({
            command: 'dragToEditor',
            codePath
        });
    }
}

function findNodeByPath(items, targetPath) {
    for (const item of items) {
        if (item.fullPath === targetPath) {
            return item;
        }
        if (item.children && item.children.length > 0) {
            const found = findNodeByPath(item.children, targetPath);
            if (found) {
                return found;
            }
        }
    }
    return null;
}

/**
 * 递归查找目标元素，并返回它在树中的祖先链，供前端展开路径。
 */
function findTreePathByTarget(items, target, ancestors = []) {
    for (const item of items) {
        const sameFile = normalizeFilePath(item.eleFilePath || '') === normalizeFilePath(target.eleFilePath || '');
        const sameVariable = target.eleVariableName && item.eleVariableName === target.eleVariableName;
        const sameLine = Number(target.eleLineNumber || 0) > 0 && Number(item.eleLineNumber || 0) === Number(target.eleLineNumber || 0);

        if (getNodeType(item) === 'element' && sameFile && (sameVariable || sameLine)) {
            return {
                item,
                ancestors
            };
        }

        if (item.children && item.children.length > 0) {
            const result = findTreePathByTarget(item.children, target, [...ancestors, item]);
            if (result) {
                return result;
            }
        }
    }

    return null;
}

function normalizeFilePath(filePath) {
    return String(filePath || '').replace(/\//g, '\\').toLowerCase();
}

window.addEventListener('message', event => {
    const message = event.data;

    switch (message.command) {
        case 'updateData':
            updateTreeData(message.data);

            if (message.resetState) {
                expandedItems.clear();
                if (vscode) {
                    vscode.setState(undefined);
                }
                renderTree();
                break;
            }

            restoreState(false);
            if (currentSearchKeyword && shouldExpandOnUpdate) {
                collectExpandablePaths(treeData, expandedItems);
                saveState();
                renderTree();
                shouldExpandOnUpdate = false;
            }
            break;
        case 'clearSearchState':
            document.getElementById('searchInput').value = '';
            currentSearchKeyword = '';
            shouldExpandOnUpdate = false;
            saveState();
            break;
        case 'expandAll':
            expandedItems.clear();
            collectExpandablePaths(filteredData, expandedItems);
            isAllExpanded = true;
            updateToggleBtnState();
            saveState();
            renderTree();
            break;
        case 'restoreState':
            restoreState();
            renderTree();
            break;
        case 'revealElement':
            revealElementInTree(message.target || {});
            break;
        case 'debugStatus':
            showDebugStatus(message.text);
            break;
    }
});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('searchInput').addEventListener('keypress', event => {
        if (event.key === 'Enter') {
            performSearch();
        }
    });

    new DragDropManager();
    restoreState();
    updateToggleBtnState();
    document.addEventListener('contextmenu', event => {
        const target = event.target.closest('.tree-item');
        if (!target) {
            hideContextMenu();
            return;
        }

        const nodeType = target.getAttribute('data-nodetype');
        if (nodeType !== 'element' && nodeType !== 'folder') {
            hideContextMenu();
            return;
        }

        event.preventDefault();
        showContextMenu(event.clientX, event.clientY, target);
    });
    document.addEventListener('click', event => {
        if (!event.target.closest('#contextMenu')) {
            hideContextMenu();
        }
    });
    document.addEventListener('scroll', hideContextMenu, true);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            hideContextMenu();
        }
    });
    showDebugStatus('Ele Tree 前端已启动，等待扩展数据...');
    if (vscode) {
        vscode.postMessage({ command: 'ready' });
    }
});
