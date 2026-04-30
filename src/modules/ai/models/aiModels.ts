export interface AIConfig {
    url: string;
    apiKey: string;
    model: string;
}

export interface MethodCandidate {
    label: string;
    codePath: string;
    methodDoc: string;
    isAssert?: boolean;
}

export interface StepInfo {
    line: number;
    kind: 'precondition' | 'step';
    desc: string;
    expect: string;
    expectLine?: number;
    hasCode?: boolean;
    existingCode?: string[];
}

export interface ParseStepOptions {
    includePreconditions?: boolean;
}

export interface ConversationLog {
    prompt: string;
    response: string;
}

export interface MethodCallResult {
    path: string;
    args?: Record<string, string>;
}

export interface ReportItem {
    step: string;
    result: 'Skipped' | 'Success' | 'Failed';
    details: string;
    conversationLogs?: ConversationLog[];
}
