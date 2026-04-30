export type PermissionMode = 'read_only' | 'propose_only';

export type AgentRunStatus = 'idle' | 'running' | 'paused' | 'stopping' | 'completed' | 'failed' | 'cancelled';

export type MethodCandidateKind = 'action' | 'assert' | 'unknown';

export interface AgentRequest {
    documentUri: string;
    filePath: string;
    skillId: string;
    userGoal: string;
    permissionMode: PermissionMode;
}

export interface AgentMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ToolCall {
    id: string;
    turn?: number;
    toolName: string;
    args: Record<string, unknown>;
    status: 'pending' | 'running' | 'completed' | 'failed';
    summary?: string;
    result?: unknown;
    error?: string;
}

export interface ToolResult {
    ok: boolean;
    content: unknown;
    summary: string;
}

export interface AssistantResponse {
    id: string;
    turn: number;
    content: string;
    status: 'streaming' | 'completed' | 'failed';
    parsedType?: AgentModelResponse['type'] | 'unknown';
    timestamp: string;
}

export interface AgentRunState {
    runId: string;
    request: AgentRequest;
    status: AgentRunStatus;
    currentTurn: number;
    maxTurns: number;
    summary: string;
    error?: string;
    canResume: boolean;
    canStop: boolean;
    assistantResponses: AssistantResponse[];
    toolCalls: ToolCall[];
    events: AgentEvent[];
    proposals: ChangeProposal[];
}

export interface AgentEvent {
    id: string;
    timestamp: string;
    level: 'info' | 'warning' | 'error';
    message: string;
}

export interface AgentToolDefinition {
    name: string;
    description: string;
    inputSchema: string;
}

export interface AgentTool {
    definition: AgentToolDefinition;
    execute(args: Record<string, unknown>, context: AgentToolContext): Promise<ToolResult>;
}

export interface SkillDefinition {
    id: string;
    label: string;
    description: string;
    systemPrompt: string;
    allowedTools: string[];
    outputFormat: string;
    stopCondition: string;
}

export interface ProposalCall {
    path: string;
    args?: Record<string, string>;
}

export interface StepMapping {
    stepLine: number;
    stepDesc: string;
    actionCalls: ProposalCall[];
    actionSuggestion?: string;
    expectLine?: number;
    expectDesc?: string;
    assertCalls?: ProposalCall[];
    assertSuggestion?: string;
}

export interface ProposalEditOperation {
    type: 'insert';
    line: number;
    content: string;
}

export interface ChangeProposal {
    id: string;
    title: string;
    reason: string;
    summary: string;
    targetFilePath: string;
    patch: string;
    toolTrace: string[];
    operations: ProposalEditOperation[];
    status: 'pending' | 'applied' | 'rejected' | 'failed';
    createdAt: string;
}

export interface AgentFinalResponse {
    type: 'final';
    summary: string;
    proposalId?: string;
    proposal?: AgentProposalInput;
}

export interface AgentToolCallResponse {
    type: 'tool_call';
    rationale: string;
    toolCalls: Array<{
        id: string;
        tool: string;
        args: Record<string, unknown>;
    }>;
}

export interface AgentProposalInput {
    title: string;
    reason: string;
    summary: string;
    stepMappings: StepMapping[];
}

export type AgentModelResponse = AgentFinalResponse | AgentToolCallResponse;

export interface ActiveTestFilePayload {
    filePath: string;
    content: string;
    steps: Array<{
        line: number;
        kind: 'precondition' | 'step';
        desc: string;
        expect: string;
        expectLine?: number;
        hasCode?: boolean;
        existingCode?: string[];
    }>;
    appName: string;
}

export interface AgentMethodCandidate {
    id: string;
    codePath: string;
    label: string;
    methodDoc: string;
    filePath: string;
    packagePath: string;
    className: string;
    kind: MethodCandidateKind;
    aliases: string[];
    tokens: string[];
    searchText: string;
    elementDescs: string[];
    appName: string;
    line: number;
}

export interface AgentToolContext {
    readonly runState: AgentRunState;
    readonly allowedToolNames: ReadonlySet<string>;
    readonly logToolOutput: boolean;
}
