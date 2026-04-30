import * as http from 'http';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    AgentMessage,
    AgentModelResponse,
    AgentRequest,
    AgentTool,
    SkillDefinition,
    ToolCall
} from '../models/agentModels';
import { agentPanelStateStore } from '../../workbench';
import { mcpToolProvider } from './mcpToolProvider';
import {
    AgentConfig,
    AgentRunInterruptedError,
    buildToolInstruction,
    buildToolResultMessage,
    callModel,
    createSkillRegistry,
    createToolContext,
    extractJson,
    formatAssistantResponseContent,
    getAgentConfig
} from './agentRuntime';
import { createLocalTools } from './agentLocalTools';
import { applyChangeProposal, createTodoFallbackProposal } from './agentProposalService';

interface AgentRunSession {
    document: vscode.TextDocument;
    skill: SkillDefinition;
    config: AgentConfig;
    request: AgentRequest;
    messages: AgentMessage[];
    localTools: AgentTool[];
    toolMap: Map<string, AgentTool>;
    allowedToolNames: Set<string>;
    nextTurn: number;
}

const agentOutputChannel = vscode.window.createOutputChannel('PATH Agent');

export class AgentService {
    private readonly skillRegistry = createSkillRegistry();
    private currentSession?: AgentRunSession;
    private currentRunPromise?: Promise<void>;
    private activeRequest?: http.ClientRequest;
    private stopRequested = false;

    public constructor() {
        agentPanelStateStore.registerProposalApplyHandler(async proposal => {
            await applyChangeProposal(proposal);
        });
    }

    private log(message: string): void {
        agentOutputChannel.appendLine(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`);
    }

    public async processDocument(document: vscode.TextDocument, skillId = 'generate_test_steps'): Promise<void> {
        if (this.currentRunPromise) {
            vscode.window.showWarningMessage('PATH Agent is already running. Stop it or wait before starting a new run.');
            return;
        }

        const config = getAgentConfig();
        agentOutputChannel.show(true);
        this.log(`Command received for ${document.uri.fsPath}`);

        if (!config.url || !config.apiKey || !config.model) {
            this.log('Missing AI configuration. Aborting agent run.');
            agentPanelStateStore.startRun({
                documentUri: document.uri.toString(),
                filePath: document.uri.fsPath,
                skillId,
                userGoal: 'Waiting for valid PATH AI configuration.',
                permissionMode: 'propose_only'
            }, config.maxTurns);
            agentPanelStateStore.fail('Missing PATH AI configuration: url, apiKey, or model.');
            vscode.window.showWarningMessage('Configure PATH AI url, apiKey, and model before running Agent Generation.');
            return;
        }

        const skill = this.skillRegistry.find(item => item.id === skillId);
        if (!skill) {
            this.log(`Unknown skill requested: ${skillId}`);
            vscode.window.showErrorMessage(`Unknown PATH agent skill: ${skillId}`);
            return;
        }

        if (!config.skills.includes(skill.id)) {
            this.log(`Skill disabled by configuration: ${skill.id}`);
            vscode.window.showErrorMessage(`PATH agent skill is disabled by configuration: ${skill.id}`);
            return;
        }

        const request: AgentRequest = {
            documentUri: document.uri.toString(),
            filePath: document.uri.fsPath,
            skillId: skill.id,
            userGoal: `Inspect ${path.basename(document.uri.fsPath)} and propose code generation for missing preconditions, steps, and asserts.`,
            permissionMode: 'propose_only'
        };

        agentPanelStateStore.startRun(request, config.maxTurns);
        this.log(`Started skill ${skill.id}`);
        await vscode.commands.executeCommand('eleSecondaryView.focus');
        agentPanelStateStore.setSummary(`Running ${skill.label}...`);

        const session = await this.createSession(document, skill, config, request);
        this.currentSession = session;
        await this.runSession(session, false);
    }

    public async resumeRun(): Promise<void> {
        if (this.currentRunPromise) {
            vscode.window.showWarningMessage('PATH Agent is still running.');
            return;
        }

        if (!this.currentSession) {
            vscode.window.showWarningMessage('No paused PATH Agent run is available to continue.');
            return;
        }

        const state = agentPanelStateStore.getState();
        if (state.status !== 'paused' && state.status !== 'cancelled') {
            vscode.window.showWarningMessage('Current PATH Agent state is not resumable.');
            return;
        }

        agentPanelStateStore.resume(`继续执行中，第 ${this.currentSession.nextTurn} 轮开始。`);
        await vscode.commands.executeCommand('eleSecondaryView.focus');
        await this.runSession(this.currentSession, true);
    }

    public stopRun(): void {
        if (!this.currentRunPromise || !this.currentSession) {
            void vscode.window.showInformationMessage('PATH Agent is not running.');
            return;
        }

        this.stopRequested = true;
        agentPanelStateStore.setStopping('正在强制停止当前回复...');
        this.log('Stop requested by user.');
        this.activeRequest?.destroy(new Error('__PATH_AGENT_STOP__'));
    }

    private async createSession(
        document: vscode.TextDocument,
        skill: SkillDefinition,
        config: AgentConfig,
        request: AgentRequest
    ): Promise<AgentRunSession> {
        const localTools = await createLocalTools(document, () => agentPanelStateStore.getState());
        const tools = [...localTools, ...mcpToolProvider.getTools(config.allowedMcpServers)];
        const toolMap = new Map(tools.map(tool => [tool.definition.name, tool]));
        const allowedToolNames = new Set(skill.allowedTools);
        const messages: AgentMessage[] = [
            {
                role: 'system',
                content: buildToolInstruction(skill, tools)
            },
            {
                role: 'user',
                content: JSON.stringify({
                    goal: request.userGoal,
                    filePath: request.filePath,
                    permissionMode: request.permissionMode,
                    notes: [
                        '先调用 readActiveTestFile，再决定后续工具。',
                        'fixture 中的 # 前置步骤 也必须纳入生成范围，不要只处理 test_ 方法里的步骤。',
                        '所有自然语言字段都使用简体中文。',
                        '如果直接方法不清楚，先调用 searchCaseImplementations 检索其他测试用例实现，再决定生成内容。',
                        '只能生成 proposal，不能直接写文件。',
                        '不要输出仓库中不存在的方法或代码；不确定时继续检索。',
                        '如果方法有必填参数，先结合步骤/预期注释、现有用例和方法源码判断能否提取参数；能提取就写入 args。',
                        '找不到步骤方法时，允许保留空的 calls，并填写中文 suggestion，让系统插入 TODO(agent)。',
                        '找到断言方法后，必须写入 assertCalls，让系统插入到预期结果注释下。',
                        '找不到预期断言时，不要在预期结果注释下生成 TODO，只在 proposal summary 中描述缺失项。',
                        '如果已经生成 proposal，最终只返回简洁 summary 和 proposalId。'
                    ]
                }, null, 2)
            }
        ];

        return {
            document,
            skill,
            config,
            request,
            messages,
            localTools,
            toolMap,
            allowedToolNames,
            nextTurn: 1
        };
    }

    private async runSession(session: AgentRunSession, resumed: boolean): Promise<void> {
        const runPromise = this.executeSession(session, resumed);
        this.currentRunPromise = runPromise;
        try {
            await runPromise;
        } finally {
            if (this.currentRunPromise === runPromise) {
                this.currentRunPromise = undefined;
                this.activeRequest = undefined;
                this.stopRequested = false;
            }
        }
    }

    private async executeSession(session: AgentRunSession, resumed: boolean): Promise<void> {
        try {
            if (resumed) {
                this.log(`Resuming PATH Agent from turn ${session.nextTurn}.`);
            }

            let activeAssistantResponseId = '';
            for (let turn = session.nextTurn; turn <= session.config.maxTurns; turn++) {
                if (this.stopRequested) {
                    throw new AgentRunInterruptedError('stopped', 'PATH Agent run was stopped by the user.');
                }

                agentPanelStateStore.setTurn(turn);
                activeAssistantResponseId = agentPanelStateStore.startAssistantResponse(turn);
                this.log(`Turn ${turn}/${session.config.maxTurns}: requesting model response`);

                const modelResult = await callModel(session.messages, session.config, {
                    onChunk: chunk => agentPanelStateStore.appendAssistantResponse(activeAssistantResponseId, chunk),
                    onRequestCreated: request => {
                        this.activeRequest = request;
                    },
                    isStopRequested: () => this.stopRequested
                });

                this.activeRequest = undefined;
                const rawResponse = modelResult.content;
                this.log(`Turn ${turn}: model responded (${rawResponse.length} chars)`);

                const parsedResponse = extractJson<AgentModelResponse>(rawResponse);
                if (!parsedResponse) {
                    agentPanelStateStore.finalizeAssistantResponse(activeAssistantResponseId, {
                        content: rawResponse,
                        status: 'completed',
                        parsedType: 'unknown'
                    });
                    session.messages.push({ role: 'assistant', content: rawResponse });
                    session.messages.push({
                        role: 'user',
                        content: '只返回合法 JSON。必须使用 type="tool_call" 或 type="final"，并且自然语言字段使用简体中文。'
                    });
                    agentPanelStateStore.addEvent(`第 ${turn} 轮返回了非 JSON 响应，已要求模型按 JSON 重试。`, 'warning');
                    this.log(`Turn ${turn}: model response was not valid JSON`);
                    session.nextTurn = turn + 1;
                    continue;
                }

                if (parsedResponse.type === 'final') {
                    let proposalId = parsedResponse.proposalId;
                    if (!proposalId && parsedResponse.proposal) {
                        const proposalTool = session.toolMap.get('proposePatch');
                        if (proposalTool) {
                            const proposalResult = await proposalTool.execute(
                                parsedResponse.proposal as unknown as Record<string, unknown>,
                                createToolContext(agentPanelStateStore.getState(), session.allowedToolNames, session.config.logTools)
                            );
                            proposalId = typeof proposalResult.content === 'object' && proposalResult.content !== null
                                ? String((proposalResult.content as { proposalId?: string }).proposalId || '')
                                : '';
                        }
                    }

                    agentPanelStateStore.finalizeAssistantResponse(activeAssistantResponseId, {
                        content: formatAssistantResponseContent({
                            ...parsedResponse,
                            proposalId
                        }),
                        status: 'completed',
                        parsedType: 'final'
                    });

                    const summary = proposalId
                        ? `${parsedResponse.summary} Proposal ${proposalId} is ready in the PATH Agent view.`
                        : parsedResponse.summary;
                    agentPanelStateStore.complete(summary);
                    this.log(`Run completed. ${summary}`);
                    vscode.window.showInformationMessage(summary);
                    this.currentSession = undefined;
                    return;
                }

                agentPanelStateStore.finalizeAssistantResponse(activeAssistantResponseId, {
                    content: formatAssistantResponseContent(parsedResponse),
                    status: 'completed',
                    parsedType: 'tool_call'
                });
                agentPanelStateStore.addEvent(`Turn ${turn}: ${parsedResponse.rationale}`);
                this.log(`Turn ${turn}: ${parsedResponse.rationale}`);

                const executedCalls: ToolCall[] = [];
                for (const requestedToolCall of parsedResponse.toolCalls) {
                    if (this.stopRequested) {
                        throw new AgentRunInterruptedError('stopped', 'PATH Agent run was stopped by the user.');
                    }

                    const toolCall: ToolCall = {
                        id: requestedToolCall.id || `tool-${Date.now()}`,
                        turn,
                        toolName: requestedToolCall.tool,
                        args: requestedToolCall.args || {},
                        status: 'running'
                    };
                    const tool = session.toolMap.get(requestedToolCall.tool);

                    if (!tool) {
                        toolCall.status = 'failed';
                        toolCall.error = `Unknown tool: ${requestedToolCall.tool}`;
                        agentPanelStateStore.upsertToolCall(toolCall);
                        executedCalls.push(toolCall);
                        this.log(`Tool failed before execution: ${toolCall.error}`);
                        continue;
                    }

                    if (!session.allowedToolNames.has(tool.definition.name)) {
                        toolCall.status = 'failed';
                        toolCall.error = `Tool not allowed for skill ${session.skill.id}: ${tool.definition.name}`;
                        agentPanelStateStore.upsertToolCall(toolCall);
                        executedCalls.push(toolCall);
                        this.log(`Tool rejected by permission gate: ${toolCall.error}`);
                        continue;
                    }

                    agentPanelStateStore.upsertToolCall(toolCall);
                    try {
                        this.log(`Executing tool ${tool.definition.name}`);
                        const result = await tool.execute(
                            requestedToolCall.args || {},
                            createToolContext(agentPanelStateStore.getState(), session.allowedToolNames, session.config.logTools)
                        );
                        toolCall.status = 'completed';
                        toolCall.summary = result.summary;
                        toolCall.result = result.content;
                        this.log(`Tool completed: ${tool.definition.name} -> ${result.summary}`);
                    } catch (error) {
                        toolCall.status = 'failed';
                        toolCall.error = error instanceof Error ? error.message : String(error);
                        this.log(`Tool failed: ${tool.definition.name} -> ${toolCall.error}`);
                    }

                    agentPanelStateStore.upsertToolCall(toolCall);
                    executedCalls.push(toolCall);
                }

                session.messages.push({ role: 'assistant', content: JSON.stringify(parsedResponse, null, 2) });
                session.messages.push({
                    role: 'user',
                    content: [
                        '以下是你刚才请求的工具执行结果(JSON)。请基于这些结果继续决策；如果信息仍不足，就继续返回 type="tool_call"。',
                        JSON.stringify(executedCalls.map(toolCall => ({
                            tool: toolCall.toolName,
                            status: toolCall.status,
                            summary: toolCall.summary,
                            error: toolCall.error,
                            result: toolCall.result
                        })), null, 2)
                    ].join('\n')
                });

                if (executedCalls.every(toolCall => toolCall.status === 'failed')) {
                    session.messages.push({
                        role: 'user',
                        content: '本轮工具全部失败。请改用其他允许的工具，不要猜测仓库中不存在的代码。'
                    });
                    this.log(`Turn ${turn}: all tool calls failed`);
                } else if (session.config.logTools) {
                    agentPanelStateStore.addEvent(`Turn ${turn} tool results:\n${executedCalls.map(buildToolResultMessage).join('\n')}`);
                }

                session.nextTurn = turn + 1;
                activeAssistantResponseId = '';
            }

            const timeoutMessage = `PATH Agent reached the max turn limit (${session.config.maxTurns}) without producing a final result.`;
            const fallbackProposal = createTodoFallbackProposal(session.document, timeoutMessage, agentPanelStateStore.getState());
            if (fallbackProposal) {
                agentPanelStateStore.addProposal(fallbackProposal);
                const fallbackSummary = `已达到最大轮数 ${session.config.maxTurns}，未找到合适方法，已生成 TODO(agent) 建议。`;
                agentPanelStateStore.complete(fallbackSummary);
                this.log(`${timeoutMessage} Fallback proposal created: ${fallbackProposal.id}`);
                vscode.window.showWarningMessage(fallbackSummary);
                this.currentSession = undefined;
                return;
            }

            agentPanelStateStore.fail(timeoutMessage);
            this.log(timeoutMessage);
            vscode.window.showWarningMessage(timeoutMessage);
            this.currentSession = undefined;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const runningAssistantResponse = agentPanelStateStore.getState().assistantResponses.find(response => response.status === 'streaming');
            if (runningAssistantResponse) {
                agentPanelStateStore.finalizeAssistantResponse(runningAssistantResponse.id, {
                    status: 'failed'
                });
            }

            if (error instanceof AgentRunInterruptedError) {
                const pauseMessage = error.reason === 'timeout'
                    ? '本轮请求超时，已暂停。你可以点击“继续续跑”从当前上下文接着执行。'
                    : '已强制停止当前回复。你可以点击“继续续跑”从当前上下文接着执行。';
                agentPanelStateStore.pause(pauseMessage);
                this.log(`Run paused: ${pauseMessage}`);
                void vscode.window.showWarningMessage(pauseMessage);
                return;
            }

            agentPanelStateStore.fail(message);
            this.log(`Run failed: ${message}`);
            this.currentSession = undefined;
            vscode.window.showErrorMessage(`PATH Agent failed: ${message}`);
        }
    }
}

export const agentService = new AgentService();
