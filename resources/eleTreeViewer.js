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

// 展开全部
function expandAll() {
    if (vscode) {
        vscode.postMessage({
            command: 'expandAll'
        });
    }
}

// 收起全部
function collapseAll() {
    expandedItems.clear();
    saveState(); // 保存状态
    renderTree();
    if (vscode) {
        vscode.postMessage({
            command: 'collapseAll'
        });
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
    }

    html += '>';

    // 缩进
    for (let i = 0; i < level; i++) {
        html += '<span class="indent"></span>';
    }

    // 展开/收起图标
    if (hasChildren) {
        html += '<span class="expand-icon ' + (isExpanded ? 'expanded' : 'expandable') + '" onclick="toggleExpand(\'' + escapeHtml(item.fullPath) + '\')"></span>';
    } else {
        html += '<span class="expand-icon leaf"></span>';
    }

    // 标签
    html += '<span class="tree-label" onclick="selectItem(\'' + escapeHtml(item.fullPath) + '\')">' + escapeHtml(item.label) + '</span>';

    // 操作按钮
    if (isLeaf && item.eleFilePath) {
        html += '<div class="tree-actions">';
        html += '<button class="action-button" onclick="openFile(this)" data-filepath="' + escapeHtml(item.eleFilePath) + '" data-line="' + item.eleLineNumber + '" title="打开文件">📄</button>';
        if (item.codePath) {
            html += '<button class="action-button" onclick="dragToEditor(this)" data-codepath="' + escapeHtml(item.codePath) + '" title="添加到编辑器">📝</button>';
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
});

// 监听来自扩展的消息
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'updateData':
            updateTreeData(message.data);
            // 数据更新后恢复状态
            restoreState();
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
            saveState(); // 保存状态
            renderTree();
            break;
        case 'restoreState':
            // 响应恢复状态的请求
            restoreState();
            break;
    }
}); 