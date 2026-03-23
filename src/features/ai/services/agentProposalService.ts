import * as vscode from 'vscode';
import { parseStepsFromFile } from './stepParserService';
import { agentMethodSearchService } from './agentMethodSearchService';
import {
    AgentMethodCandidate,
    AgentProposalInput,
    AgentRunState,
    ChangeProposal,
    ProposalCall,
    StepMapping
} from '../models/agentModels';

interface SanitizedStepMappingsResult {
    stepMappings: StepMapping[];
    summaryNotes: string[];
}

interface StepCodeCoverage {
    hasActionCode: boolean;
    hasAssertCode: boolean;
}

interface ParsedMethodParameter {
    name: string;
    required: boolean;
}

function createProposalId(): string {
    return `proposal-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function buildToolTrace(runState: AgentRunState): string[] {
    return runState.toolCalls.map(toolCall => `${toolCall.toolName}: ${toolCall.summary || toolCall.status}`);
}

function toPythonLiteral(value: unknown): string {
    if (typeof value === 'number' || typeof value === 'bigint') {
        return String(value);
    }
    if (typeof value === 'boolean') {
        return value ? 'True' : 'False';
    }
    if (value === null || value === undefined) {
        return 'None';
    }

    const stringValue = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${stringValue}"`;
}

function formatProposalArgs(args: unknown): string {
    if (args === undefined || args === null) {
        return '';
    }

    if (typeof args === 'string' || typeof args === 'number' || typeof args === 'boolean') {
        return toPythonLiteral(args);
    }

    if (Array.isArray(args)) {
        return args.map(item => toPythonLiteral(item)).join(', ');
    }

    if (typeof args !== 'object') {
        return toPythonLiteral(args);
    }

    const entries = Object.entries(args as Record<string, unknown>);
    if (entries.length === 0) {
        return '';
    }

    return entries
        .map(([key, value]) => `${key}=${toPythonLiteral(value)}`)
        .join(', ');
}

function formatCall(call: ProposalCall): string {
    const formattedArgs = formatProposalArgs(call.args);
    return formattedArgs ? `${call.path}(${formattedArgs})` : `${call.path}()`;
}

function unique(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
}

function joinQuoted(values: string[]): string {
    return unique(values).map(value => `"${value}"`).join(', ');
}

function buildActionSuggestion(mapping: StepMapping): string {
    return mapping.actionSuggestion?.trim() || `暂未找到与"${mapping.stepDesc}"匹配的现有方法，建议补充方法后重试。`;
}

function clampLine(document: vscode.TextDocument, line: number): number {
    return Math.min(line, Math.max(0, document.lineCount - 1));
}

function appendPatchChunk(patchChunks: string[], header: string, content: string): void {
    patchChunks.push(`${header}\n+ ${content.replace(/\n/g, '\n+ ')}`);
}

function hasExecutableCode(lines: string[], start: number, end: number, allowFixtureYield: boolean): boolean {
    for (let index = start; index < end; index++) {
        const lineContent = lines[index]?.trim();
        const isFixtureYield = allowFixtureYield && !!lineContent && /^yield\b/.test(lineContent);
        if (isFixtureYield) {
            continue;
        }
        if (lineContent && !lineContent.startsWith('#')) {
            return true;
        }
    }
    return false;
}

function getStepCodeCoverageByLine(document: vscode.TextDocument): Map<number, StepCodeCoverage> {
    const content = document.getText();
    const lines = content.split(/\r?\n/);
    const steps = parseStepsFromFile(content, { includePreconditions: true });
    const coverageByLine = new Map<number, StepCodeCoverage>();

    for (let index = 0; index < steps.length; index++) {
        const step = steps[index]!;
        const nextStepLine = steps[index + 1]?.line ?? lines.length;
        const actionEndLine = step.expectLine ?? nextStepLine;
        coverageByLine.set(step.line, {
            hasActionCode: hasExecutableCode(lines, step.line + 1, actionEndLine, step.kind === 'precondition'),
            hasAssertCode: step.kind === 'step' && step.expectLine !== undefined
                ? hasExecutableCode(lines, step.expectLine + 1, nextStepLine, false)
                : false
        });
    }

    return coverageByLine;
}

function extractMethodParameters(methodSource: string): ParsedMethodParameter[] {
    const signatureMatch = methodSource.match(/def\s+\w+\s*\(([\s\S]*?)\)\s*:/);
    if (!signatureMatch?.[1]) {
        return [];
    }

    return signatureMatch[1]
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
        .filter(part => part !== 'self' && part !== 'cls')
        .filter(part => !part.startsWith('*'))
        .map(part => {
            const required = !part.includes('=');
            const name = part
                .split('=')[0]
                ?.replace(/:.+$/, '')
                .trim() || '';
            return { name, required };
        })
        .filter(parameter => Boolean(parameter.name));
}

function splitContextHints(text: string): string[] {
    return text
        .split(/[，,。；;：:\n]+/g)
        .map(part => part.trim())
        .filter(Boolean);
}

function splitParamTokens(paramName: string): string[] {
    return paramName
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
}

function buildParameterAliases(paramName: string): string[] {
    const lowerName = paramName.toLowerCase();
    const tokens = splitParamTokens(paramName);
    const aliases = new Set<string>([lowerName, ...tokens]);

    if (lowerName.includes('username') || (tokens.includes('user') && tokens.includes('name'))) {
        ['username', 'user', 'account', '用户名', '账号', '账户'].forEach(alias => aliases.add(alias));
    }
    if (lowerName.includes('password') || lowerName.includes('pwd')) {
        ['password', 'pwd', '密码', '口令'].forEach(alias => aliases.add(alias));
    }
    if (tokens.includes('name')) {
        ['name', '名称', '名字'].forEach(alias => aliases.add(alias));
    }
    if (tokens.includes('value')) {
        ['value', '值', '内容'].forEach(alias => aliases.add(alias));
    }
    if (tokens.includes('text')) {
        ['text', '文本', '文字', '内容'].forEach(alias => aliases.add(alias));
    }
    if (tokens.includes('title')) {
        ['title', '标题'].forEach(alias => aliases.add(alias));
    }
    if (tokens.includes('message') || tokens.includes('msg')) {
        ['message', 'msg', '消息', '提示'].forEach(alias => aliases.add(alias));
    }
    if (tokens.includes('keyword')) {
        ['keyword', '关键词'].forEach(alias => aliases.add(alias));
    }
    if (tokens.includes('content')) {
        ['content', '内容'].forEach(alias => aliases.add(alias));
    }
    if (tokens.includes('index')) {
        ['index', '索引', '序号'].forEach(alias => aliases.add(alias));
    }
    if (tokens.includes('row')) {
        ['row', '行'].forEach(alias => aliases.add(alias));
    }
    if (tokens.includes('column') || tokens.includes('col')) {
        ['column', 'col', '列'].forEach(alias => aliases.add(alias));
    }

    return [...aliases];
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractQuotedValues(text: string): string[] {
    return [...text.matchAll(/["'“”‘’「」『』]([^"'“”‘’「」『』]+)["'“”‘’「」『』]/g)]
        .map(match => match[1]?.trim() || '')
        .filter(Boolean);
}

function extractAsciiValues(text: string): string[] {
    return [...text.matchAll(/[A-Za-z0-9_.-]{2,}/g)]
        .map(match => match[0]?.trim() || '')
        .filter(Boolean);
}

function extractValueByAliases(text: string, aliases: string[]): string | undefined {
    for (const alias of aliases) {
        const escapedAlias = escapeRegExp(alias);
        const quotedPattern = new RegExp(`${escapedAlias}\\s*(?:为|是|:|：|=)?\\s*["'“”‘’]?([^"'“”‘’\\s,，。；;]+)["'“”‘’]?`, 'i');
        const quotedMatch = text.match(quotedPattern);
        if (quotedMatch?.[1]) {
            return quotedMatch[1].trim();
        }
    }
    return undefined;
}

function inferArgumentValue(paramName: string, contextText: string, unresolvedParamCount: number): string | undefined {
    const aliasValue = extractValueByAliases(contextText, buildParameterAliases(paramName));
    if (aliasValue) {
        return aliasValue;
    }

    const quotedValues = unique(extractQuotedValues(contextText));
    if (quotedValues.length === 1 && unresolvedParamCount === 1) {
        return quotedValues[0];
    }

    const matchingHint = splitContextHints(contextText).find(hint => {
        const normalizedHint = hint.toLowerCase();
        return buildParameterAliases(paramName).some(alias => normalizedHint.includes(alias.toLowerCase()));
    });
    if (matchingHint) {
        const hintQuotedValues = unique(extractQuotedValues(matchingHint));
        if (hintQuotedValues.length > 0) {
            return hintQuotedValues[0];
        }
    }

    if (unresolvedParamCount === 1) {
        const asciiValues = unique(extractAsciiValues(contextText));
        if (asciiValues.length === 1) {
            return asciiValues[0];
        }
    }

    return undefined;
}

async function resolveCallWithArguments(
    call: ProposalCall,
    contextText: string,
    candidateByPath: Map<string, AgentMethodCandidate>,
    sourceCache: Map<string, string>
): Promise<{ call?: ProposalCall; missingArgs: string[] }> {
    const candidate = candidateByPath.get(call.path);
    if (!candidate) {
        return { missingArgs: [] };
    }

    let methodSource = sourceCache.get(call.path);
    if (!methodSource) {
        methodSource = await agentMethodSearchService.getSourceByCandidateId(candidate.id);
        sourceCache.set(call.path, methodSource);
    }

    const parameters = extractMethodParameters(methodSource || '');
    if (parameters.length === 0) {
        return { call, missingArgs: [] };
    }

    const rawArgs = { ...(call.args || {}) };
    const existingArgs: Record<string, string> = {};
    const numericArgs = Object.entries(rawArgs)
        .filter(([key]) => /^\d+$/.test(key))
        .sort((left, right) => Number(left[0]) - Number(right[0]));

    for (const [indexKey, value] of numericArgs) {
        const parameter = parameters[Number(indexKey)];
        if (parameter) {
            existingArgs[parameter.name] = value;
        }
    }

    for (const [key, value] of Object.entries(rawArgs).filter(([key]) => !/^\d+$/.test(key))) {
        existingArgs[key] = value;
    }

    const unresolvedParameters = parameters.filter(parameter => !existingArgs[parameter.name]);
    for (const parameter of unresolvedParameters) {
        const inferredValue = inferArgumentValue(parameter.name, contextText, unresolvedParameters.length);
        if (inferredValue) {
            existingArgs[parameter.name] = inferredValue;
        }
    }

    const unresolvedArgs = parameters
        .filter(parameter => parameter.required && !existingArgs[parameter.name])
        .map(parameter => parameter.name);
    if (unresolvedArgs.length > 0) {
        return { missingArgs: unresolvedArgs };
    }

    const orderedArgs: Record<string, string> = {};
    for (const parameter of parameters) {
        const value = existingArgs[parameter.name];
        if (value !== undefined) {
            orderedArgs[parameter.name] = value;
        }
    }

    for (const [key, value] of Object.entries(existingArgs)) {
        if (!(key in orderedArgs)) {
            orderedArgs[key] = value;
        }
    }

    return {
        call: {
            ...call,
            args: Object.keys(orderedArgs).length > 0 ? orderedArgs : undefined
        },
        missingArgs: []
    };
}

async function sanitizeStepMappings(
    document: vscode.TextDocument,
    stepMappings: StepMapping[]
): Promise<SanitizedStepMappingsResult> {
    const coverageByStepLine = getStepCodeCoverageByLine(document);
    const candidates = await agentMethodSearchService.getCandidates();
    const candidateByPath = new Map(candidates.map(candidate => [candidate.codePath, candidate]));
    const sourceCache = new Map<string, string>();
    const invalidPaths: string[] = [];
    const missingExpectations: string[] = [];
    const missingArgumentNotes: string[] = [];
    const sanitizedMappings = await Promise.all(stepMappings.map(async mapping => {
        const coverage = coverageByStepLine.get(mapping.stepLine);
        const validActionCalls: ProposalCall[] = [];
        const validAssertCalls: ProposalCall[] = [];

        for (const call of mapping.actionCalls || []) {
            if (!call.path || !candidateByPath.has(call.path)) {
                invalidPaths.push(call.path || '<empty>');
                continue;
            }

            const resolved = await resolveCallWithArguments(call, mapping.stepDesc, candidateByPath, sourceCache);
            if (resolved.call) {
                validActionCalls.push(resolved.call);
                continue;
            }

            missingArgumentNotes.push(`步骤 "${mapping.stepDesc}" 的方法 ${call.path} 缺少参数: ${resolved.missingArgs.join(', ')}`);
        }

        for (const call of mapping.assertCalls || []) {
            if (!call.path || !candidateByPath.has(call.path)) {
                invalidPaths.push(call.path || '<empty>');
                continue;
            }

            const assertContext = mapping.expectDesc || mapping.stepDesc;
            const resolved = await resolveCallWithArguments(call, assertContext, candidateByPath, sourceCache);
            if (resolved.call) {
                validAssertCalls.push(resolved.call);
                continue;
            }

            missingArgumentNotes.push(`预期 "${assertContext}" 的断言方法 ${call.path} 缺少参数: ${resolved.missingArgs.join(', ')}`);
        }

        if (mapping.expectLine !== undefined && validAssertCalls.length === 0 && !coverage?.hasAssertCode) {
            missingExpectations.push(mapping.expectDesc || mapping.stepDesc);
        }

        return {
            ...mapping,
            actionCalls: validActionCalls,
            assertCalls: validAssertCalls
        };
    }));

    const summaryNotes: string[] = [];
    const uniqueInvalidPaths = unique(invalidPaths);
    if (uniqueInvalidPaths.length > 0) {
        summaryNotes.push(`已忽略未通过索引校验的方法: ${uniqueInvalidPaths.join(', ')}`);
    }

    const uniqueMissingArgs = unique(missingArgumentNotes);
    if (uniqueMissingArgs.length > 0) {
        summaryNotes.push(uniqueMissingArgs.join('；'));
    }

    const uniqueMissingExpectations = unique(missingExpectations);
    if (uniqueMissingExpectations.length > 0) {
        summaryNotes.push(`未找到断言的预期结果: ${joinQuoted(uniqueMissingExpectations)}`);
    }

    return {
        stepMappings: sanitizedMappings,
        summaryNotes
    };
}

function buildPatchFromMappings(
    document: vscode.TextDocument,
    stepMappings: StepMapping[]
): { operations: ChangeProposal['operations']; patch: string } {
    const coverageByStepLine = getStepCodeCoverageByLine(document);
    const operations: ChangeProposal['operations'] = [];
    const patchChunks: string[] = [];
    const sortedMappings = [...stepMappings].sort((left, right) => left.stepLine - right.stepLine);

    for (const mapping of sortedMappings) {
        const coverage = coverageByStepLine.get(mapping.stepLine);
        const actionLine = clampLine(document, mapping.stepLine);
        const indent = document.lineAt(actionLine).text.match(/^(\s*)/)?.[1] || '        ';
        const actionLines = (mapping.actionCalls || []).map(call => `${indent}${formatCall(call)}`);

        if (actionLines.length === 0 && !coverage?.hasActionCode) {
            actionLines.push(`${indent}# TODO(agent): ${buildActionSuggestion(mapping)}`);
        }

        if (actionLines.length > 0) {
            const actionContent = actionLines.join('\n');
            operations.push({
                type: 'insert',
                line: mapping.stepLine + 1,
                content: `${actionContent}\n`
            });
            appendPatchChunk(patchChunks, `@@ step:${mapping.stepLine + 1} @@`, actionContent);
        }

        if (mapping.expectLine === undefined) {
            continue;
        }

        const expectLine = clampLine(document, mapping.expectLine);
        const expectIndent = document.lineAt(expectLine).text.match(/^(\s*)/)?.[1] || indent;
        const assertLines = (mapping.assertCalls || []).map(call => `${expectIndent}${formatCall(call)}`);
        if (assertLines.length === 0) {
            continue;
        }

        const assertContent = assertLines.join('\n');
        operations.push({
            type: 'insert',
            line: mapping.expectLine + 1,
            content: `${assertContent}\n`
        });
        appendPatchChunk(patchChunks, `@@ expect:${mapping.expectLine + 1} @@`, assertContent);
    }

    return {
        operations,
        patch: patchChunks.join('\n\n')
    };
}

function buildProposalSummary(baseSummary: string, summaryNotes: string[]): string {
    const normalizedBase = (baseSummary || 'Generated test code proposal').trim();
    if (summaryNotes.length === 0) {
        return normalizedBase;
    }
    return `${normalizedBase} ${summaryNotes.join('; ')}`.trim();
}

export async function createProposalFromInput(
    document: vscode.TextDocument,
    proposalInput: AgentProposalInput,
    runState: AgentRunState
): Promise<ChangeProposal> {
    if (!proposalInput.title || !Array.isArray(proposalInput.stepMappings)) {
        throw new Error('title and stepMappings are required.');
    }

    const sanitized = await sanitizeStepMappings(document, proposalInput.stepMappings);
    const { operations, patch } = buildPatchFromMappings(document, sanitized.stepMappings);

    return {
        id: createProposalId(),
        title: proposalInput.title,
        reason: proposalInput.reason || 'PATH Agent proposal',
        summary: buildProposalSummary(proposalInput.summary || 'Generated test code proposal', sanitized.summaryNotes),
        targetFilePath: document.uri.fsPath,
        patch,
        toolTrace: buildToolTrace(runState),
        operations,
        status: 'pending',
        createdAt: new Date().toISOString()
    };
}

export function createTodoFallbackProposal(
    document: vscode.TextDocument,
    reason: string,
    runState: AgentRunState
): ChangeProposal | undefined {
    const content = document.getText();
    const lines = content.split(/\r?\n/);
    const steps = parseStepsFromFile(content, { includePreconditions: true });
    const operations: ChangeProposal['operations'] = [];
    const patchChunks: string[] = [];
    const missingExpectations: string[] = [];
    let lineOffset = 0;

    for (let index = 0; index < steps.length; index++) {
        const step = steps[index]!;
        const nextStepLine = steps[index + 1]?.line ?? lines.length;
        const baseIndent = document.lineAt(clampLine(document, step.line)).text.match(/^(\s*)/)?.[1] || '        ';
        const actionEndLine = step.expectLine ?? nextStepLine;
        const actionHasCode = hasExecutableCode(lines, step.line + 1, actionEndLine, step.kind === 'precondition');

        if (!actionHasCode) {
            const todoLines = [
                `${baseIndent}# TODO(agent): 暂未找到与"${step.desc}"匹配的现有方法。`,
                `${baseIndent}# 建议: 先补充对应动作方法，或把步骤描述写得更具体后重新生成。`
            ];
            operations.push({
                type: 'insert',
                line: step.line + 1 + lineOffset,
                content: `${todoLines.join('\n')}\n`
            });
            appendPatchChunk(patchChunks, `@@ step:${step.line + 1} @@`, todoLines.join('\n'));
            lineOffset += todoLines.length;
        }

        if (step.kind === 'step' && step.expectLine !== undefined) {
            const assertHasCode = hasExecutableCode(lines, step.expectLine + 1, nextStepLine, false);
            if (!assertHasCode) {
                missingExpectations.push(step.expect);
            }
        }
    }

    if (operations.length === 0 && missingExpectations.length === 0) {
        return undefined;
    }

    const summaryNotes = missingExpectations.length > 0
        ? [`未找到断言的预期结果: ${joinQuoted(missingExpectations)}`]
        : [];

    return {
        id: createProposalId(),
        title: 'TODO(agent) 建议',
        reason,
        summary: buildProposalSummary('未找到可直接复用的方法，已为步骤生成 TODO(agent) 建议。', summaryNotes),
        targetFilePath: document.uri.fsPath,
        patch: patchChunks.join('\n\n'),
        toolTrace: buildToolTrace(runState),
        operations,
        status: 'pending',
        createdAt: new Date().toISOString()
    };
}

export async function applyChangeProposal(proposal: ChangeProposal): Promise<void> {
    if (proposal.operations.length === 0) {
        return;
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    const targetUri = vscode.Uri.file(proposal.targetFilePath);
    const document = await vscode.workspace.openTextDocument(targetUri);
    const sortedOperations = [...proposal.operations].sort((left, right) => right.line - left.line);

    for (const operation of sortedOperations) {
        const position = new vscode.Position(Math.min(operation.line, document.lineCount), 0);
        workspaceEdit.insert(targetUri, position, operation.content);
    }

    const applied = await vscode.workspace.applyEdit(workspaceEdit);
    if (!applied) {
        throw new Error('VSCode rejected the workspace edit.');
    }

    const refreshedDocument = await vscode.workspace.openTextDocument(targetUri);
    await refreshedDocument.save();
    await vscode.window.showTextDocument(refreshedDocument, { preview: false });
}
