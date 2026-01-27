// 获取VSCode API
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

// 拖拽管理器
class DragDropManager {
    constructor() {
        this.draggedElement = null;
        this.setupDragAndDrop();
    }

    setupDragAndDrop() {
        // 为可拖拽元素添加事件监听
        document.addEventListener('dragstart', this.handleDragStart.bind(this));
        document.addEventListener('dragover', this.handleDragOver.bind(this));
        document.addEventListener('drop', this.handleDrop.bind(this));
        document.addEventListener('dragend', this.handleDragEnd.bind(this));
    }

    handleDragStart(event) {
        // 检查是否点击了右键菜单或其他交互元素
        if (event.target.closest('.context-menu') ||
            event.target.classList.contains('context-menu-item')) {
            event.preventDefault();
            return;
        }

        const treeItem = event.target.closest('.tree-item');
        if (!treeItem || !treeItem.hasAttribute('data-codepath')) {
            event.preventDefault();
            return;
        }

        // 允许从树项的大部分区域开始拖拽
        // 检查是否从展开图标开始（不允许）
        if (event.target.classList.contains('expand-icon')) {
            event.preventDefault();
            return;
        }

        this.draggedElement = treeItem;
        const codePath = treeItem.getAttribute('data-codepath');
        const elementName = treeItem.getAttribute('data-label') || codePath;

        // 设置拖拽数据（末尾添加换行符，方便连续拖入）
        event.dataTransfer.setData('text/plain', codePath + '\n');
        event.dataTransfer.effectAllowed = 'copy';

        // 设置拖拽图像文本
        event.dataTransfer.setData('application/vnd.code.tree', JSON.stringify({
            codePath: codePath,
            elementName: elementName,
            type: 'element'
        }));

        // 添加拖拽样式
        treeItem.classList.add('dragging');

        console.log('开始拖拽元素:', elementName);
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
                codePath: codePath
            });
            console.log('拖拽到编辑器:', codePath);
        }
    }

    handleDragEnd(event) {
        if (this.draggedElement) {
            this.draggedElement.classList.remove('dragging');
            this.draggedElement = null;
        }
    }
}

// 初始化拖拽管理器
let dragDropManager;
let contextMenuTarget = null; // 右键菜单目标元素
let parentContextMenuTarget = null; // 父节点右键菜单目标数据

// 状态保存和恢复功能
function saveState() {
    if (vscode) {
        const state = {
            expandedItems: Array.from(expandedItems),
            currentSearchKeyword: currentSearchKeyword
        };
        vscode.setState(state);
        console.log('State saved:', state);
    }
}

function restoreState() {
    if (vscode) {
        const state = vscode.getState();
        if (state) {
            console.log('State restored:', state);

            // 恢复展开状态
            if (state.expandedItems) {
                expandedItems = new Set(state.expandedItems);
            }
            // 恢复搜索关键词
            if (state.currentSearchKeyword) {
                currentSearchKeyword = state.currentSearchKeyword;
                document.getElementById('searchInput').value = currentSearchKeyword;
            }
            // 重新渲染树
            renderTree();
        }
    }
}

// HTML转义函数
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// 搜索功能
function performSearch() {
    const keyword = document.getElementById('searchInput').value.trim();
    currentSearchKeyword = keyword;
    saveState(); // 保存状态
    if (vscode) {
        vscode.postMessage({
            command: 'search',
            keyword: keyword
        });
    }
}

// 监听搜索框回车事件
document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('searchInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });

    // 初始化拖拽管理器
    dragDropManager = new DragDropManager();

    // 页面加载完成后尝试恢复状态
    restoreState();
});

// 清除搜索
function clearSearch() {
    document.getElementById('searchInput').value = '';
    currentSearchKeyword = '';
    saveState(); // 保存状态
    if (vscode) {
        vscode.postMessage({
            command: 'clearSearch'
        });
    }
}

// 刷新数据
function refreshData() {
    if (vscode) {
        vscode.postMessage({
            command: 'refresh'
        });
    }
    showLoading();
}

// 展开/收起全部
let isAllExpanded = false;

function toggleExpandCollapseAll() {
    isAllExpanded = !isAllExpanded;
    updateToggleBtnState();

    if (isAllExpanded) {
        // Expand All
        // Note: filteredData contains the current visible tree items
        function addAllPaths(items) {
            for (const item of items) {
                if (item.children && item.children.length > 0) {
                    expandedItems.add(item.fullPath);
                    addAllPaths(item.children);
                }
            }
        }
        addAllPaths(filteredData);
        if (vscode) {
            vscode.postMessage({ command: 'expandAll' });
        }
    } else {
        // Collapse All
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
    const title = isAllExpanded ? '收起全部' : '展开全部';
    const text = isAllExpanded ? '收起' : '展开';

    if (textSpan) textSpan.innerText = text;
    document.getElementById('toggleExpandBtn').title = title;

    // Toggle the vertical bar in the icon (plus -> minus)
    if (verticalBar) {
        verticalBar.style.display = isAllExpanded ? 'none' : 'block';
    }
}

// 显示加载状态
function showLoading() {
    document.getElementById('treeContainer').innerHTML = '<div class="loading">正在加载数据...</div>';
}

// 更新树形数据
function updateTreeData(data) {
    treeData = data;
    filteredData = data;
    renderTree();
}

// 渲染树形结构
function renderTree() {
    const container = document.getElementById('treeContainer');
    if (!filteredData || filteredData.length === 0) {
        container.innerHTML = '<div class="no-results">没有找到匹配的结果</div>';
        return;
    }

    let html = '';
    for (const item of filteredData) {
        html += renderTreeItem(item, 0);
    }
    container.innerHTML = html;
}

// 渲染单个树项
function renderTreeItem(item, level) {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.has(item.fullPath);
    const isLeaf = item.isLeaf;

    let html = '<div class="tree-item ' + (isLeaf ? 'leaf' : 'folder') + '" data-path="' + escapeHtml(item.fullPath) + '"';

    // 为叶子节点添加右键菜单、双击事件和拖拽属性
    if (isLeaf && item.eleFilePath) {
        html += ' data-filepath="' + escapeHtml(item.eleFilePath) + '" data-line="' + item.eleLineNumber + '" data-codepath="' + escapeHtml(item.codePath || '') + '" data-variablename="' + escapeHtml(item.eleVariableName || '') + '" data-label="' + escapeHtml(item.label) + '"';
        html += ' oncontextmenu="showContextMenu(event, this)" ondblclick="openFileOnDoubleClick(this)"';
        // 添加拖拽属性
        html += ' draggable="true"';
    } else if (hasChildren) {
        // 为父节点添加右键菜单 (用于批量生成方法)
        html += ' oncontextmenu="showParentContextMenu(event, \'' + escapeHtml(item.fullPath) + '\')"';
    }

    html += '>';

    // 缩进
    for (let i = 0; i < level; i++) {
        html += '<span class="indent"></span>';
    }

    // 展开/收起图标
    // 使用SVG Chevron替代 Unicode
    const chevronSvg = '<svg class="icon-chevron" viewBox="0 0 16 16" fill="currentColor"><path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06z"/></svg>';

    if (hasChildren) {
        html += '<span class="expand-icon ' + (isExpanded ? 'expanded' : 'expandable') + '" onclick="toggleExpand(\'' + escapeHtml(item.fullPath) + '\')">' + chevronSvg + '</span>';
    } else {
        html += '<span class="expand-icon leaf"><div class="icon-dot"></div></span>';
    }

    // 标签
    html += '<span class="tree-label" onclick="selectItem(\'' + escapeHtml(item.fullPath) + '\')">' + escapeHtml(item.label) + '</span>';

    // 操作按钮 (使用 SVG)
    if (isLeaf && item.eleFilePath) {
        const fileIcon = '<svg class="action-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M13.85 4.44l-3.28-3.3a.87.87 0 0 0-.6-.25H2.5a.5.5 0 0 0-.5.5v13.5a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5V5.03a.85.85 0 0 0-.25-.6zM10.5 2L13 4.5H10.5V2zM3 14V2h6.5v3h3v9H3z"/></svg>';
        const editIcon = '<svg class="action-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M11.01 10.26A1.05 1.05 0 0 1 12.06 9c.16 0 .32.05.45.14l2.16 1.62c.1.07.16.18.16.3a.53.53 0 0 1-.22.42l-2.45 1.83a.98.98 0 0 1-.59.2c-.32 0-.62-.15-.81-.4l-2.18-2.9 2.43-1.95zM12.98 2.02l-9.35 9.45-1.57 3.51.98-3.92L12.38 1.61a.85.85 0 0 1 1.2 0l1 1a.85.85 0 0 1-.02 1.21l-1.58-1.8zM4.1 12.6l6.83-6.9L12.02 6.8 5.2 13.7l-1.1-1.1zm-.55 1.7l3.41-1.06L5.8 12.08l-2.25 2.22z"/></svg>';

        html += '<div class="tree-actions">';
        html += '<button class="action-button" onclick="openFile(this)" data-filepath="' + escapeHtml(item.eleFilePath) + '" data-line="' + item.eleLineNumber + '" title="打开文件">' + fileIcon + '</button>';
        if (item.codePath) {
            html += '<button class="action-button" onclick="dragToEditor(this)" data-codepath="' + escapeHtml(item.codePath) + '" title="拖拽插入">' + editIcon + '</button>';
        }
        html += '</div>';
    }

    html += '</div>';

    // 渲染子项
    if (hasChildren && isExpanded) {
        for (const child of item.children) {
            html += renderTreeItem(child, level + 1);
        }
    }

    return html;
}

// 切换展开/收起状态
function toggleExpand(path) {
    if (expandedItems.has(path)) {
        expandedItems.delete(path);
    } else {
        expandedItems.add(path);
    }
    saveState(); // 保存状态
    renderTree();
}

// 选择项目
function selectItem(path) {
    // 移除之前的选中状态
    const selected = document.querySelector('.tree-item.selected');
    if (selected) {
        selected.classList.remove('selected');
    }

    // 添加新的选中状态
    const item = document.querySelector('[data-path="' + escapeHtml(path) + '"]');
    if (item) {
        item.classList.add('selected');
    }
}

// 打开文件（从按钮点击）
function openFile(button) {
    const filePath = button.getAttribute('data-filepath');
    const lineNumber = parseInt(button.getAttribute('data-line'));
    console.log('Opening file:', filePath, 'line:', lineNumber);
    if (vscode && filePath) {
        vscode.postMessage({
            command: 'openFile',
            filePath: filePath,
            lineNumber: lineNumber
        });
    }
}

// 拖拽到编辑器
function dragToEditor(button) {
    const codePath = button.getAttribute('data-codepath');
    if (vscode && codePath) {
        vscode.postMessage({
            command: 'dragToEditor',
            codePath: codePath
        });
    }
}

// 显示右键菜单
function showContextMenu(event, element) {
    event.preventDefault();
    event.stopPropagation();

    contextMenuTarget = element;
    const contextMenu = document.getElementById('contextMenu');

    // 设置菜单位置
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
    contextMenu.style.display = 'block';
    return false;
}

// 右键菜单操作
function contextMenuAction(actionType) {
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.style.display = 'none';

    if (!contextMenuTarget) return;

    const filePath = contextMenuTarget.getAttribute('data-filepath');
    const fullPath = contextMenuTarget.getAttribute('data-path');
    const variableName = contextMenuTarget.getAttribute('data-variablename');
    const label = contextMenuTarget.getAttribute('data-label');

    console.log('Context menu action:', actionType, 'for element:', {
        filePath, fullPath, variableName, label
    });

    if (vscode && filePath && fullPath && variableName) {
        vscode.postMessage({
            command: 'addOperation',
            element: {
                fullPath: fullPath,
                eleFilePath: filePath,
                eleVariableName: variableName,
                label: label
            },
            operationType: actionType === 'click' ? 'click' : 'double_click'
        });
    }

    contextMenuTarget = null;
}

// 双击打开文件
function openFileOnDoubleClick(element) {
    const filePath = element.getAttribute('data-filepath');
    const lineNumber = parseInt(element.getAttribute('data-line'));

    if (vscode && filePath) {
        vscode.postMessage({
            command: 'openFile',
            filePath: filePath,
            lineNumber: lineNumber
        });
    }
}

// 点击其他地方隐藏右键菜单
document.addEventListener('click', function (event) {
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu && !contextMenu.contains(event.target)) {
        contextMenu.style.display = 'none';
        contextMenuTarget = null;
    }
    const parentContextMenu = document.getElementById('parentContextMenu');
    if (parentContextMenu && !parentContextMenu.contains(event.target)) {
        parentContextMenu.style.display = 'none';
        parentContextMenuTarget = null;
    }
});

// 显示父节点右键菜单
function showParentContextMenu(event, path) {
    event.preventDefault();
    event.stopPropagation();

    // 隐藏叶子节点的右键菜单
    document.getElementById('contextMenu').style.display = 'none';

    // 找到对应的节点数据
    function findNodeByPath(items, targetPath) {
        for (const item of items) {
            if (item.fullPath === targetPath) {
                return item;
            }
            if (item.children && item.children.length > 0) {
                const found = findNodeByPath(item.children, targetPath);
                if (found) return found;
            }
        }
        return null;
    }

    const node = findNodeByPath(filteredData, path);
    if (!node) return;

    parentContextMenuTarget = node;
    const parentContextMenu = document.getElementById('parentContextMenu');

    // 设置菜单位置
    parentContextMenu.style.left = event.pageX + 'px';
    parentContextMenu.style.top = event.pageY + 'px';
    parentContextMenu.style.display = 'block';
    return false;
}

// 收集所有叶子节点
function collectLeafChildren(node) {
    const leaves = [];
    console.log('collectLeafChildren called for node:', node.fullPath, 'children count:', node.children ? node.children.length : 0);
    function collect(item, depth) {
        console.log('  '.repeat(depth) + 'Checking item:', item.fullPath || item.label, 'isLeaf:', item.isLeaf, 'eleFilePath:', item.eleFilePath, 'eleVariableName:', item.eleVariableName);
        if (item.isLeaf && item.eleFilePath && item.eleVariableName) {
            console.log('  '.repeat(depth) + '  -> Found leaf!');
            leaves.push({
                fullPath: item.fullPath,
                eleFilePath: item.eleFilePath,
                eleVariableName: item.eleVariableName,
                label: item.label
            });
        }
        if (item.children && item.children.length > 0) {
            console.log('  '.repeat(depth) + '  -> Has', item.children.length, 'children, recursing...');
            for (const child of item.children) {
                collect(child, depth + 1);
            }
        }
    }
    collect(node, 0);
    console.log('collectLeafChildren result: found', leaves.length, 'leaves');
    return leaves;
}

// 父节点右键菜单操作
function parentContextMenuAction(actionType) {
    const parentContextMenu = document.getElementById('parentContextMenu');
    parentContextMenu.style.display = 'none';

    if (!parentContextMenuTarget) return;

    const leaves = collectLeafChildren(parentContextMenuTarget);
    if (leaves.length === 0) {
        console.log('No leaf elements found under this node');
        return;
    }

    console.log('Batch action:', actionType, 'for', leaves.length, 'elements');

    if (vscode) {
        vscode.postMessage({
            command: 'batchAddOperation',
            elements: leaves,
            operationType: actionType
        });
    }

    parentContextMenuTarget = null;
}

// 监听来自扩展的消息
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'updateData':
            updateTreeData(message.data);

            if (message.resetState) {
                console.log('Reset state requested by extension');
                expandedItems.clear();
                if (vscode) {
                    vscode.setState(undefined);
                }
                renderTree();
            } else {
                // 数据更新后恢复状态
                restoreState();
            }
            break;
        case 'expandAll':
            // 展开所有项
            expandedItems.clear();
            function addAllPaths(items) {
                for (const item of items) {
                    if (item.children && item.children.length > 0) {
                        expandedItems.add(item.fullPath);
                        addAllPaths(item.children);
                    }
                }
            }
            addAllPaths(filteredData);
            isAllExpanded = true;
            updateToggleBtnState();
            saveState(); // 保存状态
            renderTree();
            break;
        case 'restoreState':
            // 响应恢复状态的请求
            restoreState();
            break;
    }
}); 