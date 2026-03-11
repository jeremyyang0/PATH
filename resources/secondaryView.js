const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatJson(value) {
    if (value === undefined || value === null) {
        return '';
    }
    if (typeof value === 'string') {
        return value;
    }
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

function formatRunStatus(status) {
    switch (status) {
        case 'running':
            return '运行中';
        case 'paused':
            return '已暂停';
        case 'stopping':
            return '停止中';
        case 'completed':
            return '已完成';
        case 'failed':
            return '失败';
        case 'cancelled':
            return '已取消';
        default:
            return '空闲';
    }
}

function renderRunControls(state) {
    const runControls = document.getElementById('runControls');
    if (!runControls) {
        return;
    }

    const controls = [];
    if (state.canResume) {
        controls.push('<button class="secondary" data-action="resume-run">继续续跑</button>');
    }
    if (state.canStop) {
        controls.push('<button class="secondary" data-action="stop-run">强制停止</button>');
    }
    runControls.innerHTML = controls.join('');
}

function toggleResultPanels(state) {
    const summaryPanel = document.getElementById('summaryPanel');
    const proposalPanel = document.getElementById('proposalPanel');
    const shouldShow = ['completed', 'failed', 'paused', 'cancelled'].includes(state.status || 'idle');

    if (summaryPanel) {
        summaryPanel.classList.toggle('hidden', !shouldShow);
    }
    if (proposalPanel) {
        proposalPanel.classList.toggle('hidden', !shouldShow);
    }
}

function updateConversationPanel(state) {
    const panel = document.getElementById('conversationPanel');
    if (!(panel instanceof HTMLDetailsElement)) {
        return;
    }

    const status = state.status || 'idle';
    const previousStatus = panel.dataset.status || '';
    if (status !== previousStatus) {
        panel.open = status !== 'completed';
        panel.dataset.status = status;
    }
}

function renderProposals(state) {
    const proposalList = document.getElementById('proposalList');
    if (!proposalList) {
        return;
    }

    if (!state.proposals || state.proposals.length === 0) {
        proposalList.innerHTML = '<div class="empty">No proposals yet.</div>';
        return;
    }

    proposalList.innerHTML = state.proposals.map(proposal => `
        <div class="list-item">
            <strong>${escapeHtml(proposal.title)} <span class="status-pill">${escapeHtml(proposal.status)}</span></strong>
            <div>${escapeHtml(proposal.summary || proposal.reason)}</div>
            <pre>${escapeHtml(proposal.patch || '')}</pre>
            <div class="actions">
                <button data-action="apply" data-proposal-id="${escapeHtml(proposal.id)}" ${proposal.status !== 'pending' ? 'disabled' : ''}>Apply Proposal</button>
                <button class="secondary" data-action="reject" data-proposal-id="${escapeHtml(proposal.id)}" ${proposal.status !== 'pending' ? 'disabled' : ''}>Reject</button>
                <button class="secondary" data-action="open-file" data-file-path="${escapeHtml(proposal.targetFilePath)}">Open File</button>
            </div>
        </div>
    `).join('');
}

function renderInlineToolCall(toolCall) {
    return `
        <details class="tool-item" ${toolCall.status === 'running' ? 'open' : ''}>
            <summary>
                <div class="tool-summary">
                    <strong>已调用 ${escapeHtml(toolCall.toolName)}</strong>
                    <span>${escapeHtml(toolCall.summary || toolCall.error || '展开查看调用详情')}</span>
                </div>
                <span class="status-pill small">${escapeHtml((toolCall.status || 'pending').toUpperCase())}</span>
            </summary>
            <div class="tool-body">
                <div class="tool-compact">调用详情</div>
                <div class="tool-block">
                    <label>参数</label>
                    <pre>${escapeHtml(formatJson(toolCall.args))}</pre>
                </div>
                ${(toolCall.result !== undefined && toolCall.result !== null) ? `
                    <div class="tool-block">
                        <label>结果</label>
                        <pre>${escapeHtml(formatJson(toolCall.result))}</pre>
                    </div>
                ` : ''}
                ${toolCall.error ? `
                    <div class="tool-block">
                        <label>错误</label>
                        <pre>${escapeHtml(toolCall.error)}</pre>
                    </div>
                ` : ''}
            </div>
        </details>
    `;
}

function renderAssistant(state) {
    const assistantList = document.getElementById('assistantList');
    if (!assistantList) {
        return;
    }

    if (!state.assistantResponses || state.assistantResponses.length === 0) {
        assistantList.innerHTML = '<div class="empty">No assistant replies yet.</div>';
        return;
    }

    assistantList.innerHTML = state.assistantResponses.map(response => `
        <article class="assistant-message">
            <div class="assistant-card ${escapeHtml(response.status || 'completed')}">
                <pre class="assistant-content">${escapeHtml(response.content || (response.status === 'streaming' ? '思考中...' : ''))}</pre>
                ${((state.toolCalls || []).filter(toolCall => toolCall.turn === response.turn).length > 0) ? `
                    <div class="assistant-tools">
                        ${(state.toolCalls || [])
                            .filter(toolCall => toolCall.turn === response.turn)
                            .map(renderInlineToolCall)
                            .join('')}
                    </div>
                ` : ''}
            </div>
        </article>
    `).join('');
}

function renderState(state) {
    setText('headlineSubtitle', state.request?.userGoal || 'Waiting for a run.');
    setText('statusPill', formatRunStatus(state.status || 'idle'));
    setText('summary', state.summary || 'No active run.');
    renderRunControls(state);
    toggleResultPanels(state);
    updateConversationPanel(state);
    renderAssistant(state);
    renderProposals(state);
}

document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
        return;
    }

    const action = target.getAttribute('data-action');
    if (!action || !vscode) {
        return;
    }

    if (action === 'apply') {
        vscode.postMessage({
            command: 'applyProposal',
            proposalId: target.getAttribute('data-proposal-id')
        });
        return;
    }

    if (action === 'reject') {
        vscode.postMessage({
            command: 'rejectProposal',
            proposalId: target.getAttribute('data-proposal-id')
        });
        return;
    }

    if (action === 'open-file') {
        vscode.postMessage({
            command: 'openFile',
            filePath: target.getAttribute('data-file-path')
        });
        return;
    }

    if (action === 'resume-run') {
        vscode.postMessage({ command: 'resumeRun' });
        return;
    }

    if (action === 'stop-run') {
        vscode.postMessage({ command: 'stopRun' });
    }
});

window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'renderState') {
        renderState(message.state || {});
    }
});

if (vscode) {
    vscode.postMessage({ command: 'ready' });
}
