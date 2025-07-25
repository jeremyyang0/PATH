// 获取VSCode API（只能调用一次）
const vscode = (function() {
    try {
        if (typeof acquireVsCodeApi !== 'undefined') {
            const api = acquireVsCodeApi();
            console.log('VSCode API acquired successfully');
            return api;
        }
    } catch (error) {
        console.error('Failed to acquire VSCode API:', error);
    }
    return null;
})();

// 发送日志到扩展
function sendLog(message) {
    if (vscode) {
        vscode.postMessage({
            command: 'log',
            message: message
        });
    }
    console.log('Secondary View:', message);
}

// 发送错误到扩展
function sendError(message) {
    if (vscode) {
        vscode.postMessage({
            command: 'error',
            message: message
        });
    }
    console.error('Secondary View Error:', message);
}

// 页面加载完成后立即执行
sendLog('secondaryView.js started loading');

// 更新当前时间
function updateTime() {
    const now = new Date();
    document.getElementById('current-time').textContent = now.toLocaleString();
}

// 初始化时间显示
document.addEventListener('DOMContentLoaded', function() {
    sendLog('DOMContentLoaded event fired');
    try {
        updateTime();
        setInterval(updateTime, 1000);
        addToLog('Secondary View 已初始化');
        sendLog('Secondary View initialization completed');
    } catch (error) {
        sendError('Error during initialization: ' + error.message);
    }
});

// 如果DOM已经加载完成，立即执行初始化
if (document.readyState === 'loading') {
    sendLog('Document is still loading, waiting for DOMContentLoaded');
} else {
    sendLog('Document already loaded, initializing immediately');
    try {
        updateTime();
        setInterval(updateTime, 1000);
        addToLog('Secondary View 已初始化 (immediate)');
        sendLog('Secondary View initialization completed (immediate)');
    } catch (error) {
        sendError('Error during immediate initialization: ' + error.message);
    }
}

// 发送消息到扩展
function sendMessage(text) {
    if (vscode) {
        vscode.postMessage({
            command: 'alert',
            text: text
        });
        addToLog('消息已发送: ' + text);
    } else {
        addToLog('错误: VSCode API 不可用');
    }
}

// 刷新数据
function refreshData() {
    addToLog('数据已刷新 - ' + new Date().toLocaleString());
}

// 添加日志
function addToLog(message) {
    const logArea = document.getElementById('log-area');
    logArea.textContent += '\n[' + new Date().toLocaleTimeString() + '] ' + message;
    logArea.scrollTop = logArea.scrollHeight;
}

// 清除日志
function clearLog() {
    document.getElementById('log-area').textContent = '日志已清除\n';
} 