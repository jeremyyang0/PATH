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
let shouldExpandOnUpdate = false;
let isAllExpanded = false;

class DragDropManager {
    constructor() {
        this.draggedElement = null;
        this.setupDragAndDrop();
    }

    setupDragAndDrop() {
        document.addEventListener('dragstart', this.handleDragStart.bind(this));
        document.addEventListener('dragover', this.handleDragOver.bind(this));
        document.addEventListener('drop', this.handleDrop.bind(this));
        document.addEventListener('dragend', this.handleDragEnd.bind(this));
    }

    handleDragStart(event) {
        if (event.target.closest('.tree-actions') ||
            event.target.classList.contains('action-button') ||
            event.target.closest('.action-button')) {
            event.preventDefault();
            return;
        }

        const treeItem = event.target.closest('.tree-item');
        if (!treeItem || treeItem.getAttribute('data-nodetype') !== 'method') {
            event.preventDefault();
            return;
        }

        if (event.target.classList.contains('expand-icon')) {
            event.preventDefault();
            return;
        }

        const codePath = treeItem.getAttribute('data-codepath');
        const methodName = treeItem.getAttribute('data-methodname') || codePath;
        if (!codePath) {
            event.preventDefault();
            return;
        }

        this.draggedElement = treeItem;
        event.dataTransfer.setData('text/plain', codePath + '()\n');
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/vnd.code.tree', JSON.stringify({
            codePath,
            methodName,
            type: 'method'
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
                codePath: codePath.replace(/\(\)\s*$/, '')
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

let dragDropManager;

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

    renderTree();
}

function escapeHtml(unsafe) {
    if (!unsafe) {
        return '';
    }

    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('searchInput').addEventListener('keypress', function (event) {
        if (event.key === 'Enter') {
            performSearch();
        }
    });

    dragDropManager = new DragDropManager();
    restoreState();
});

function clearSearch() {
    document.getElementById('searchInput').value = '';
    currentSearchKeyword = '';
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

function collectExpandablePaths(items, targetSet) {
    for (const item of items) {
        if (item.children && item.children.length > 0) {
            targetSet.add(item.fullPath);
            collectExpandablePaths(item.children, targetSet);
        }
    }
}

function updateToggleBtnState() {
    const textSpan = document.getElementById('toggleExpandText');
    const verticalBar = document.getElementById('toggleExpandVerticalBar');

    if (textSpan) {
        textSpan.innerText = isAllExpanded ? '收起' : '展开';
    }

    const button = document.getElementById('toggleExpandBtn');
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
    console.debug('[MethodsTree]', text);
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

function getNodeType(item) {
    if (item.nodeType) {
        return item.nodeType;
    }
    return item.isLeaf ? 'method' : 'folder';
}

function renderTreeItem(item, level) {
    const nodeType = getNodeType(item);
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.has(item.fullPath);
    const rowClass = nodeType === 'method' ? 'leaf' : nodeType;

    let html = `<div class="tree-item ${rowClass}" data-path="${escapeHtml(item.fullPath)}" data-nodetype="${escapeHtml(nodeType)}"`;

    if (nodeType === 'method') {
        html += ` data-filepath="${escapeHtml(item.methodFilePath || item.filePath || '')}"`;
        html += ` data-line="${item.methodLine || 1}"`;
        html += ` data-codepath="${escapeHtml(item.codePath || '')}"`;
        html += ` data-methodname="${escapeHtml(item.methodName || '')}"`;
        html += ' ondblclick="jumpToMethodOnDoubleClick(this)" draggable="true"';
    } else if (nodeType === 'folder') {
        html += ` data-filepath="${escapeHtml(item.filePath || '')}" ondblclick="openFolderOnDoubleClick(this)"`;
    } else if (nodeType === 'file') {
        html += ` data-filepath="${escapeHtml(item.filePath || '')}" ondblclick="openFileOnDoubleClick(this)"`;
    }

    html += '>';

    for (let index = 0; index < level; index++) {
        html += '<span class="indent"></span>';
    }

    const chevronSvg = '<svg class="icon-chevron" viewBox="0 0 16 16" fill="currentColor"><path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06z"/></svg>';

    if (hasChildren) {
        html += `<span class="expand-icon ${isExpanded ? 'expanded' : 'expandable'}" onclick="toggleExpand('${escapeHtml(item.fullPath)}')">${chevronSvg}</span>`;
    } else if (nodeType === 'method') {
        html += '<span class="expand-icon leaf"><div class="icon-method"></div></span>';
    } else if (nodeType === 'file') {
        html += '<span class="expand-icon leaf"><div class="icon-file"></div></span>';
    } else {
        html += '<span class="expand-icon leaf"><div class="icon-folder"></div></span>';
    }

    html += `<span class="tree-label" onclick="handleItemClick(event, '${escapeHtml(item.fullPath)}')">${escapeHtml(item.label)}</span>`;

    if (nodeType === 'method') {
        const jumpIcon = '<svg class="action-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M11.72 10.22L13.5 12 15 10.5l-2.78-2.78a.75.75 0 0 0-1.06 0l-2.78 2.78L9.94 12l1.78-1.78zM8.75 5.5h-5a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5zM2.75 2.5a.75.75 0 0 0 0 1.5h10.5a.75.75 0 0 0 0-1.5H2.75zM2.75 12a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5z"/></svg>';
        const editIcon = '<svg class="action-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M11.01 10.26A1.05 1.05 0 0 1 12.06 9c.16 0 .32.05.45.14l2.16 1.62c.1.07.16.18.16.3a.53.53 0 0 1-.22.42l-2.45 1.83a.98.98 0 0 1-.59.2c-.32 0-.62-.15-.81-.4l-2.18-2.9 2.43-1.95zM12.98 2.02l-9.35 9.45-1.57 3.51.98-3.92L12.38 1.61a.85.85 0 0 1 1.2 0l1 1a.85.85 0 0 1-.02 1.21l-1.58-1.8zM4.1 12.6l6.83-6.9L12.02 6.8 5.2 13.7l-1.1-1.1zm-.55 1.7l3.41-1.06L5.8 12.08l-2.25 2.22z"/></svg>';

        html += '<div class="tree-actions">';
        html += `<button class="action-button" onclick="jumpToMethod(this)" data-filepath="${escapeHtml(item.methodFilePath || item.filePath || '')}" data-line="${item.methodLine || 1}" title="跳转到方法">${jumpIcon}</button>`;
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

function handleItemClick(event, treePath) {
    const element = document.querySelector(`[data-path="${escapeHtml(treePath)}"]`);
    if (!element) {
        return;
    }

    if (element.getAttribute('data-nodetype') === 'method' && event.shiftKey) {
        const codePath = element.getAttribute('data-codepath');
        if (codePath && vscode) {
            vscode.postMessage({
                command: 'dragToEditor',
                codePath: codePath.replace(/\(\)\s*$/, '')
            });
        }
        return;
    }

    selectItem(treePath);
}

function selectItem(treePath) {
    const selected = document.querySelector('.tree-item.selected');
    if (selected) {
        selected.classList.remove('selected');
    }

    const item = document.querySelector(`[data-path="${escapeHtml(treePath)}"]`);
    if (item) {
        item.classList.add('selected');
    }
}

function openFolderOnDoubleClick(element) {
    const folderPath = element.getAttribute('data-filepath');
    if (vscode && folderPath) {
        vscode.postMessage({
            command: 'openFolder',
            folderPath
        });
    }
}

function openFileOnDoubleClick(element) {
    const filePath = element.getAttribute('data-filepath');
    if (vscode && filePath) {
        vscode.postMessage({
            command: 'openFile',
            filePath,
            lineNumber: 1
        });
    }
}

function jumpToMethod(button) {
    const filePath = button.getAttribute('data-filepath');
    const lineNumber = parseInt(button.getAttribute('data-line') || '1', 10);
    if (vscode && filePath) {
        vscode.postMessage({
            command: 'jumpToMethod',
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

function jumpToMethodOnDoubleClick(element) {
    const filePath = element.getAttribute('data-filepath');
    const lineNumber = parseInt(element.getAttribute('data-line') || '1', 10);
    if (vscode && filePath) {
        vscode.postMessage({
            command: 'jumpToMethod',
            filePath,
            lineNumber
        });
    }
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
            } else {
                restoreState(false);

                if (currentSearchKeyword && shouldExpandOnUpdate) {
                    collectExpandablePaths(treeData, expandedItems);
                    saveState();
                    renderTree();
                    shouldExpandOnUpdate = false;
                }
            }
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
            break;
        case 'debugStatus':
            showDebugStatus(message.text);
            break;
    }
});

document.addEventListener('DOMContentLoaded', () => {
    showDebugStatus('Methods Tree 前端已启动，等待扩展数据...');
    if (vscode) {
        vscode.postMessage({ command: 'ready' });
    }
});
