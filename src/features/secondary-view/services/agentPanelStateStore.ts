import * as vscode from 'vscode';
import { AgentEvent, AgentRequest, AgentRunState, AssistantResponse, ChangeProposal, ToolCall } from '../../ai/models/agentModels';

function createEvent(message: string, level: AgentEvent['level'] = 'info'): AgentEvent {
    return {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        level,
        message
    };
}

function createIdleState(): AgentRunState {
    return {
        runId: '',
        request: {
            documentUri: '',
            filePath: '',
            skillId: '',
            userGoal: '',
            permissionMode: 'propose_only'
        },
        status: 'idle',
        currentTurn: 0,
        maxTurns: 0,
        summary: 'Agent is idle.',
        canResume: false,
        canStop: false,
        assistantResponses: [],
        toolCalls: [],
        events: [],
        proposals: []
    };
}

export class AgentPanelStateStore {
    private readonly emitter = new vscode.EventEmitter<AgentRunState>();
    private state = createIdleState();
    private proposalApplyHandler?: (proposal: ChangeProposal) => Promise<void>;

    public readonly onDidChangeState = this.emitter.event;

    public dispose(): void {
        this.emitter.dispose();
    }

    public getState(): AgentRunState {
        return {
            ...this.state,
            request: { ...this.state.request },
            assistantResponses: this.state.assistantResponses.map(response => ({ ...response })),
            toolCalls: this.state.toolCalls.map(call => ({ ...call })),
            events: this.state.events.map(event => ({ ...event })),
            proposals: this.state.proposals.map(proposal => ({
                ...proposal,
                toolTrace: [...proposal.toolTrace],
                operations: proposal.operations.map(operation => ({ ...operation }))
            }))
        };
    }

    public clear(): void {
        this.state = createIdleState();
        this.emit();
    }

    public startRun(request: AgentRequest, maxTurns: number): void {
        this.state = {
            runId: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            request,
            status: 'running',
            currentTurn: 0,
            maxTurns,
            summary: 'Agent is preparing the run.',
            canResume: false,
            canStop: true,
            assistantResponses: [],
            toolCalls: [],
            events: [createEvent(`Started skill ${request.skillId} for ${request.filePath}`)],
            proposals: []
        };
        this.emit();
    }

    public setSummary(summary: string): void {
        this.state = {
            ...this.state,
            summary
        };
        this.emit();
    }

    public setTurn(turn: number): void {
        this.state = {
            ...this.state,
            currentTurn: turn
        };
        this.emit();
    }

    public resume(summary: string): void {
        this.state = {
            ...this.state,
            status: 'running',
            summary,
            error: undefined,
            canResume: false,
            canStop: true,
            events: [...this.state.events, createEvent(summary)]
        };
        this.emit();
    }

    public setStopping(summary: string): void {
        this.state = {
            ...this.state,
            status: 'stopping',
            summary,
            canResume: false,
            canStop: false
        };
        this.emit();
    }

    public pause(summary: string): void {
        this.state = {
            ...this.state,
            status: 'paused',
            summary,
            canResume: true,
            canStop: false,
            events: [...this.state.events, createEvent(summary, 'warning')]
        };
        this.emit();
    }

    public complete(summary: string): void {
        this.state = {
            ...this.state,
            status: 'completed',
            summary,
            canResume: false,
            canStop: false,
            events: [...this.state.events, createEvent(summary)]
        };
        this.emit();
    }

    public fail(error: string): void {
        this.state = {
            ...this.state,
            status: 'failed',
            error,
            summary: error,
            canResume: false,
            canStop: false,
            events: [...this.state.events, createEvent(error, 'error')]
        };
        this.emit();
    }

    public addEvent(message: string, level: AgentEvent['level'] = 'info'): void {
        this.state = {
            ...this.state,
            events: [...this.state.events, createEvent(message, level)]
        };
        this.emit();
    }

    public startAssistantResponse(turn: number): string {
        const response: AssistantResponse = {
            id: `assistant-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            turn,
            content: '',
            status: 'streaming',
            parsedType: 'unknown',
            timestamp: new Date().toISOString()
        };
        this.state = {
            ...this.state,
            assistantResponses: [...this.state.assistantResponses, response]
        };
        this.emit();
        return response.id;
    }

    public appendAssistantResponse(responseId: string, chunk: string): void {
        if (!chunk) {
            return;
        }

        this.state = {
            ...this.state,
            assistantResponses: this.state.assistantResponses.map(response =>
                response.id === responseId
                    ? { ...response, content: `${response.content}${chunk}` }
                    : response
            )
        };
        this.emit();
    }

    public finalizeAssistantResponse(
        responseId: string,
        options: {
            content?: string;
            status?: AssistantResponse['status'];
            parsedType?: AssistantResponse['parsedType'];
        } = {}
    ): void {
        this.state = {
            ...this.state,
            assistantResponses: this.state.assistantResponses.map(response =>
                response.id === responseId
                    ? {
                        ...response,
                        content: options.content ?? response.content,
                        status: options.status ?? 'completed',
                        parsedType: options.parsedType ?? response.parsedType
                    }
                    : response
            )
        };
        this.emit();
    }

    public upsertToolCall(toolCall: ToolCall): void {
        const existingIndex = this.state.toolCalls.findIndex(item => item.id === toolCall.id);
        const nextToolCalls = [...this.state.toolCalls];
        if (existingIndex === -1) {
            nextToolCalls.push({ ...toolCall });
        } else {
            nextToolCalls[existingIndex] = { ...toolCall };
        }
        this.state = {
            ...this.state,
            toolCalls: nextToolCalls
        };
        this.emit();
    }

    public addProposal(proposal: ChangeProposal): void {
        const existingIndex = this.state.proposals.findIndex(item => item.id === proposal.id);
        const nextProposals = [...this.state.proposals];
        if (existingIndex === -1) {
            nextProposals.push({ ...proposal });
        } else {
            nextProposals[existingIndex] = { ...proposal };
        }
        this.state = {
            ...this.state,
            proposals: nextProposals,
            events: [...this.state.events, createEvent(`Created proposal ${proposal.title}`)]
        };
        this.emit();
    }

    public registerProposalApplyHandler(handler: (proposal: ChangeProposal) => Promise<void>): void {
        this.proposalApplyHandler = handler;
    }

    public async applyProposal(proposalId: string): Promise<void> {
        const proposal = this.state.proposals.find(item => item.id === proposalId);
        if (!proposal) {
            throw new Error(`Unknown proposal: ${proposalId}`);
        }

        if (!this.proposalApplyHandler) {
            throw new Error('Proposal apply handler is not registered.');
        }

        await this.proposalApplyHandler(proposal);
        this.updateProposalStatus(proposalId, 'applied');
    }

    public rejectProposal(proposalId: string): void {
        this.updateProposalStatus(proposalId, 'rejected');
    }

    private updateProposalStatus(proposalId: string, status: ChangeProposal['status']): void {
        this.state = {
            ...this.state,
            proposals: this.state.proposals.map(proposal => proposal.id === proposalId ? { ...proposal, status } : proposal),
            events: [...this.state.events, createEvent(`Proposal ${proposalId} marked as ${status}`)]
        };
        this.emit();
    }

    private emit(): void {
        this.emitter.fire(this.getState());
    }
}

export const agentPanelStateStore = new AgentPanelStateStore();
