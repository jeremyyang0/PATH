import * as http from 'http';
import * as https from 'https';
import * as vscode from 'vscode';
import {
    AgentMessage,
    AgentModelResponse,
    AgentTool,
    AgentToolContext,
    AgentRunState,
    SkillDefinition,
    ToolCall
} from '../models/agentModels';

export interface AgentConfig {
    enabled: boolean;
    url: string;
    apiKey: string;
    model: string;
    maxTurns: number;
    logConversation: boolean;
    logTools: boolean;
    allowedMcpServers: string[];
    skills: string[];
}

export interface ModelCallResult {
    content: string;
    streamed: boolean;
}

export class AgentRunInterruptedError extends Error {
    public constructor(public readonly reason: 'stopped' | 'timeout', message: string) {
        super(message);
        this.name = 'AgentRunInterruptedError';
    }
}

export function getAgentConfig(): AgentConfig {
    const pathConfig = vscode.workspace.getConfiguration('path.ai');
    const agentConfig = vscode.workspace.getConfiguration('path.ai.agent');
    return {
        enabled: agentConfig.get<boolean>('enabled') ?? true,
        url: pathConfig.get<string>('url') || '',
        apiKey: pathConfig.get<string>('apiKey') || '',
        model: pathConfig.get<string>('model') || '',
        maxTurns: Math.max(80, agentConfig.get<number>('maxTurns') ?? 80),
        logConversation: pathConfig.get<boolean>('logConversation') || false,
        logTools: agentConfig.get<boolean>('logTools') ?? true,
        allowedMcpServers: agentConfig.get<string[]>('allowedMcpServers') ?? [],
        skills: agentConfig.get<string[]>('skills') ?? ['generate_test_steps', 'find_matching_methods', 'inspect_widget_and_method']
    };
}

export function createSkillRegistry(): SkillDefinition[] {
    return [
        {
            id: 'generate_test_steps',
            label: 'Generate Test Steps',
            description: 'Read the active test case, inspect matching methods, and propose a patch for missing steps.',
            allowedTools: [
                'readActiveTestFile',
                'readWorkspaceFile',
                'searchWorkspace',
                'searchCaseImplementations',
                'findMethodCandidates',
                'readMethodSource',
                'readElementSource',
                'getSniffState',
                'getEleTreeSelection',
                'getMethodsTreeSelection',
                'proposePatch'
            ],
            outputFormat: 'Return JSON only. Either request tools or finish with a proposal.',
            stopCondition: 'Stop once a proposal has been created for the active test file.',
            systemPrompt: [
                '你是 PATH Agent，负责辅助生成 Python 测试代码。',
                '必须先读取和检索，再决定是否调用 proposePatch。',
                '禁止捏造仓库中不存在的方法、文件路径、类名、断言或代码片段。',
                '如果方法存在必填参数，必须结合步骤注释、预期注释、已有用例实现和方法源码判断是否能提取参数；能提取就填写 args，不能提取就明确保留为空并说明原因。',
                '前置步骤和普通步骤都属于生成范围，不能忽略。',
                '当步骤没有找到可复用方法时，可以保留空的 calls，并提供中文 suggestion，让系统插入 TODO(agent)。',
                '当已经找到断言方法时，必须把它写入 assertCalls，让系统插入到预期结果注释下。',
                '当预期结果没有找到断言时，不要捏造断言，不要要求系统在预期注释下插入 TODO；只需在 summary 里说明缺失项。',
                '已有代码的步骤保持原样，不要重复生成。',
                '所有自然语言字段必须使用简体中文。',
                '最终输出必须是 JSON，type="final" 时 summary 要简洁，并优先引用 proposePatch 返回的 proposalId。'
            ].join('\n')
        },
        {
            id: 'find_matching_methods',
            label: 'Find Matching Methods',
            description: 'Inspect the codebase and rank method candidates for a described action or expectation.',
            allowedTools: [
                'findMethodCandidates',
                'readMethodSource',
                'readElementSource',
                'searchWorkspace',
                'getEleTreeSelection',
                'getMethodsTreeSelection'
            ],
            outputFormat: 'Return JSON only. Either request tools or finish with a short summary.',
            stopCondition: 'Stop after identifying the best method candidates.',
            systemPrompt: [
                '你是 PATH Agent，当前任务是查找匹配方法。',
                '只能基于工具返回的候选和源码做判断；信息不足时继续调用工具，不要猜。',
                '所有自然语言字段必须使用简体中文。',
                '这个 skill 不允许提出文件修改。'
            ].join('\n')
        },
        {
            id: 'inspect_widget_and_method',
            label: 'Inspect Widget And Method',
            description: 'Compare Sniff state, selected tree items, and method candidates to explain the best mapping.',
            allowedTools: [
                'getSniffState',
                'getEleTreeSelection',
                'getMethodsTreeSelection',
                'readElementSource',
                'readMethodSource',
                'findMethodCandidates'
            ],
            outputFormat: 'Return JSON only. Either request tools or finish with an explanation.',
            stopCondition: 'Stop once the mapping between widget context and method candidates is clear.',
            systemPrompt: [
                '你是 PATH Agent，当前任务是分析控件与方法映射。',
                '先利用 Sniff 状态和树选中项建立上下文，再决定是否读取源码。',
                '不要输出仓库中不存在的方法或文件。',
                '所有自然语言字段必须使用简体中文。',
                '这个 skill 不允许提出文件修改。'
            ].join('\n')
        }
    ];
}

export function buildToolInstruction(skill: SkillDefinition, tools: AgentTool[]): string {
    const visibleTools = tools.filter(tool => skill.allowedTools.includes(tool.definition.name));
    const toolList = visibleTools
        .map(tool => `- ${tool.definition.name}: ${tool.definition.description}. args=${tool.definition.inputSchema}`)
        .join('\n');

    return [
        skill.systemPrompt,
        '',
        '所有 JSON 中的自然语言字段必须使用简体中文，并保持简洁。',
        '如果没有足够依据，就继续调用工具；不要编造仓库中不存在的代码、方法路径、文件路径或断言。',
        'readActiveTestFile 返回的前置步骤、普通步骤、预期断言都属于待覆盖范围。',
        '只有工具结果明确出现过的方法路径，才能放进 proposePatch。',
        '',
        `Allowed tools:\n${toolList}`,
        '',
        'You must respond with JSON only.',
        'Tool-call response format:',
        '{',
        '  "type": "tool_call",',
        '  "rationale": "why the tools are needed",',
        '  "toolCalls": [',
        '    { "id": "call-1", "tool": "toolName", "args": {} }',
        '  ]',
        '}',
        '',
        'Final response format:',
        '{',
        '  "type": "final",',
        '  "summary": "short summary",',
        '  "proposalId": "proposal-id-if-created"',
        '}',
        '',
        'If you need to create edits, call proposePatch before finishing.',
        skill.outputFormat,
        `Stop condition: ${skill.stopCondition}`
    ].join('\n');
}

export function extractJson<T>(text: string): T | null {
    try {
        return JSON.parse(text) as T;
    } catch {
        const fenced = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
        if (fenced?.[1]) {
            try {
                return JSON.parse(fenced[1]) as T;
            } catch {
                return null;
            }
        }

        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
            try {
                return JSON.parse(text.slice(start, end + 1)) as T;
            } catch {
                return null;
            }
        }
    }

    return null;
}

function extractCompletionContent(raw: string): string | null {
    const parsed = extractJson<{ choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }>(raw);
    if (parsed?.error?.message) {
        throw new Error(parsed.error.message);
    }

    const content = parsed?.choices?.[0]?.message?.content;
    return typeof content === 'string' && content.trim() ? content : null;
}

export function formatAssistantResponseContent(response: AgentModelResponse): string {
    if (response.type === 'final') {
        const lines = [response.summary];
        if (response.proposalId) {
            lines.push('', `提议: ${response.proposalId}`);
        }
        return lines.join('\n').trim();
    }

    return response.rationale.trim();
}

export async function callModel(
    messages: AgentMessage[],
    config: AgentConfig,
    options: {
        onChunk?: (chunk: string) => void;
        onRequestCreated?: (request: http.ClientRequest) => void;
        isStopRequested?: () => boolean;
    } = {}
): Promise<ModelCallResult> {
    const baseUrl = config.url.replace(/\/+$/, '');
    const url = `${baseUrl}/chat/completions`;
    const body = JSON.stringify({
        model: config.model,
        temperature: 0.1,
        stream: true,
        messages
    });

    return await new Promise<ModelCallResult>((resolve, reject) => {
        const urlObject = new URL(url);
        const transport = urlObject.protocol === 'https:' ? https : http;
        let settled = false;

        const finishResolve = (result: ModelCallResult): void => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(result);
        };

        const finishReject = (error: Error): void => {
            if (settled) {
                return;
            }
            settled = true;
            reject(error);
        };

        const request = transport.request({
            hostname: urlObject.hostname,
            port: urlObject.port || (urlObject.protocol === 'https:' ? 443 : 80),
            path: `${urlObject.pathname}${urlObject.search}`,
            method: 'POST',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            headers: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'application/json',
                // eslint-disable-next-line @typescript-eslint/naming-convention
                Accept: 'application/json, text/event-stream',
                // eslint-disable-next-line @typescript-eslint/naming-convention
                Authorization: `Bearer ${config.apiKey}`
            },
            timeout: 60000
        }, (response: http.IncomingMessage) => {
            const statusCode = response.statusCode ?? 0;
            const contentType = String(response.headers['content-type'] || '').toLowerCase();
            const isEventStream = contentType.includes('text/event-stream');

            if (!isEventStream) {
                let raw = '';
                response.setEncoding('utf8');
                response.on('data', chunk => {
                    raw += chunk;
                });
                response.on('end', () => {
                    if (statusCode >= 400) {
                        finishReject(new Error(`AI request failed (${statusCode}): ${raw.slice(0, 500)}`));
                        return;
                    }

                    try {
                        const content = extractCompletionContent(raw);
                        if (!content) {
                            finishReject(new Error(`Unexpected AI response: ${raw.slice(0, 300)}`));
                            return;
                        }

                        finishResolve({
                            content,
                            streamed: false
                        });
                    } catch (error) {
                        finishReject(error instanceof Error ? error : new Error(String(error)));
                    }
                });
                return;
            }

            let buffer = '';
            let content = '';

            const flushEventBuffer = (): void => {
                let separatorIndex = buffer.indexOf('\n\n');
                while (separatorIndex !== -1) {
                    const rawEvent = buffer.slice(0, separatorIndex);
                    buffer = buffer.slice(separatorIndex + 2);
                    separatorIndex = buffer.indexOf('\n\n');

                    const dataPayload = rawEvent
                        .split('\n')
                        .map(line => line.replace(/\r$/, ''))
                        .filter(line => line.startsWith('data:'))
                        .map(line => line.slice(5).trimStart())
                        .join('\n');

                    if (!dataPayload || dataPayload === '[DONE]') {
                        continue;
                    }

                    const eventJson = extractJson<{
                        error?: { message?: string };
                        choices?: Array<{
                            delta?: { content?: string };
                            message?: { content?: string };
                        }>;
                    }>(dataPayload);

                    if (eventJson?.error?.message) {
                        finishReject(new Error(eventJson.error.message));
                        return;
                    }

                    const chunkText = eventJson?.choices?.[0]?.delta?.content
                        ?? eventJson?.choices?.[0]?.message?.content
                        ?? '';

                    if (!chunkText) {
                        continue;
                    }

                    content += chunkText;
                    options.onChunk?.(chunkText);
                }
            };

            response.setEncoding('utf8');
            response.on('data', chunk => {
                if (options.isStopRequested?.()) {
                    request.destroy(new Error('__PATH_AGENT_STOP__'));
                    return;
                }
                buffer += chunk.replace(/\r\n/g, '\n');
                flushEventBuffer();
            });
            response.on('end', () => {
                if (statusCode >= 400) {
                    finishReject(new Error(`AI stream failed (${statusCode}).`));
                    return;
                }

                flushEventBuffer();
                if (!content.trim()) {
                    finishReject(new Error('AI stream ended without content.'));
                    return;
                }

                finishResolve({
                    content,
                    streamed: true
                });
            });
        });

        options.onRequestCreated?.(request);
        request.on('error', error => {
            if (settled) {
                return;
            }
            if (error.message === '__PATH_AGENT_STOP__') {
                finishReject(new AgentRunInterruptedError('stopped', 'PATH Agent run was stopped by the user.'));
                return;
            }
            if (error.message === '__PATH_AGENT_TIMEOUT__') {
                finishReject(new AgentRunInterruptedError('timeout', 'PATH Agent request timed out.'));
                return;
            }
            finishReject(error);
        });
        request.on('timeout', () => {
            request.destroy(new Error('__PATH_AGENT_TIMEOUT__'));
        });
        request.write(body);
        request.end();
    });
}

export function createToolContext(
    runState: AgentRunState,
    allowedToolNames: ReadonlySet<string>,
    logToolOutput: boolean
): AgentToolContext {
    return {
        runState,
        allowedToolNames,
        logToolOutput
    };
}

export function buildToolResultMessage(toolCall: ToolCall): string {
    if (toolCall.status === 'failed') {
        return `Tool ${toolCall.toolName} failed: ${toolCall.error || 'Unknown error'}`;
    }

    return JSON.stringify({
        tool: toolCall.toolName,
        summary: toolCall.summary,
        result: toolCall.result
    });
}
