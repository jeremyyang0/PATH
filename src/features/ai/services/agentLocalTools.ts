import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { parseStepsFromFile } from './stepParserService';
import { createProposalFromInput } from './agentProposalService';
import {
    ActiveTestFilePayload,
    AgentProposalInput,
    AgentRunState,
    AgentTool,
    AgentToolContext
} from '../models/agentModels';
import { agentMethodSearchService } from './agentMethodSearchService';
import { agentPanelStateStore } from '../../secondary-view/services/agentPanelStateStore';
import { treeSelectionStore } from '../../../shared/state/treeSelectionStore';
import { getSniffStateStore } from '../../sniff/services/sniffStateAccessor';

function toRelativeWorkspacePath(targetPath: string, workspacePath: string): string {
    const relativePath = path.relative(workspacePath, targetPath);
    return relativePath && !relativePath.startsWith('..') ? relativePath.replace(/\\/g, '/') : targetPath;
}

function isBinaryFile(filePath: string, contentBuffer: Buffer): boolean {
    const binaryExtensions = new Set([
        '.7z', '.bmp', '.class', '.dll', '.dylib', '.exe', '.gif', '.gz', '.ico', '.jpeg', '.jpg',
        '.o', '.obj', '.pdf', '.png', '.pyc', '.pyd', '.pyo', '.so', '.ttf', '.vsix', '.woff', '.woff2', '.zip'
    ]);
    if (binaryExtensions.has(path.extname(filePath).toLowerCase())) {
        return true;
    }

    const sample = contentBuffer.subarray(0, Math.min(contentBuffer.length, 8000));
    if (sample.includes(0)) {
        return true;
    }

    let suspiciousBytes = 0;
    for (const byte of sample) {
        const isControlChar = byte < 7 || (byte > 14 && byte < 32);
        if (isControlChar) {
            suspiciousBytes += 1;
        }
    }

    return sample.length > 0 && (suspiciousBytes / sample.length) > 0.15;
}

async function searchWorkspaceText(
    workspacePath: string,
    queryText: string,
    limit: number
): Promise<Array<{ filePath: string; relativePath: string; matches: string[] }>> {
    const results: Array<{ filePath: string; relativePath: string; matches: string[] }> = [];
    const lowerQuery = queryText.toLowerCase();
    const ignoredDirectories = new Set(['.git', '.pytest_cache', '.venv', '__pycache__', 'node_modules', 'out', 'venv']);

    const walk = (directoryPath: string): void => {
        if (results.length >= limit) {
            return;
        }

        for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
            if (ignoredDirectories.has(entry.name)) {
                continue;
            }

            const fullPath = path.join(directoryPath, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
                if (results.length >= limit) {
                    return;
                }
                continue;
            }

            if (!entry.isFile()) {
                continue;
            }

            if (fs.statSync(fullPath).size > 1024 * 1024) {
                continue;
            }

            const contentBuffer = fs.readFileSync(fullPath);
            if (isBinaryFile(fullPath, contentBuffer)) {
                continue;
            }

            const content = contentBuffer.toString('utf8');
            const matchedLines = content
                .split(/\r?\n/)
                .filter(line => line.toLowerCase().includes(lowerQuery))
                .slice(0, 5);

            if (matchedLines.length > 0) {
                results.push({
                    filePath: fullPath,
                    relativePath: toRelativeWorkspacePath(fullPath, workspacePath),
                    matches: matchedLines
                });
            }

            if (results.length >= limit) {
                return;
            }
        }
    };

    walk(workspacePath);
    return results;
}

function isCaseImplementationFile(filePath: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
    if (!normalizedPath.endsWith('.py')) {
        return false;
    }

    return normalizedPath.includes('/case/')
        || normalizedPath.includes('/cases/')
        || path.basename(normalizedPath).startsWith('test_');
}

function normalizeSearchText(value: string): string {
    return value.toLowerCase().trim();
}

function buildSearchTerms(queryText: string): string[] {
    const normalized = normalizeSearchText(queryText);
    if (!normalized) {
        return [];
    }

    const rawParts = normalized
        .split(/[\s,.;:!?()[\]{}<>/\\"'`~|+=*&^%$#@!-]+|->|=>|，|。|：|；|（|）|【|】|《|》|、/g)
        .map(part => part.trim())
        .filter(Boolean);

    const terms = new Set<string>();

    for (const part of rawParts) {
        if (part.length >= 2) {
            terms.add(part);
        }

        if (/^[\u4e00-\u9fff]+$/.test(part)) {
            if (part.length <= 4) {
                terms.add(part);
                continue;
            }

            for (let size = 2; size <= Math.min(4, part.length); size++) {
                for (let index = 0; index <= part.length - size; index++) {
                    terms.add(part.slice(index, index + size));
                }
            }
        }
    }

    if (terms.size === 0 && normalized.length >= 2) {
        terms.add(normalized);
    }

    return [...terms];
}

function scoreCaseLine(lineText: string, queryText: string, searchTerms: string[]): { score: number; matchedTerms: string[] } {
    const normalizedLine = normalizeSearchText(lineText);
    if (!normalizedLine) {
        return { score: 0, matchedTerms: [] };
    }

    const matchedTerms = searchTerms.filter(term => term.length > 0 && normalizedLine.includes(term));
    const isCommentLine = normalizedLine.startsWith('#') || normalizedLine.startsWith('"""') || normalizedLine.startsWith("'''");
    const baseWeight = isCommentLine ? 1.2 : 1;
    let score = 0;

    if (queryText && normalizedLine.includes(queryText)) {
        score += 12 * baseWeight;
    }

    if (matchedTerms.length > 0) {
        score += matchedTerms.length * 4 * baseWeight;
        score += matchedTerms.reduce((total, term) => total + Math.min(term.length, 6), 0) * 0.4 * baseWeight;
    }

    return {
        score,
        matchedTerms
    };
}

function collectSnippet(lines: string[], matchIndex: number, radius: number): string[] {
    const start = Math.max(0, matchIndex - radius);
    const end = Math.min(lines.length, matchIndex + radius + 1);
    return lines
        .slice(start, end)
        .map(line => line.trimRight())
        .filter(line => line.trim() !== '');
}

async function searchCaseImplementations(
    workspacePath: string,
    activeDocumentPath: string,
    queryText: string,
    limit: number
): Promise<Array<{ filePath: string; relativePath: string; snippets: string[] }>> {
    const results: Array<{
        filePath: string;
        relativePath: string;
        snippets: string[];
        score: number;
        matchedTermCount: number;
    }> = [];
    const normalizedQuery = normalizeSearchText(queryText);
    const searchTerms = buildSearchTerms(queryText);
    const ignoredDirectories = new Set(['.git', '.pytest_cache', '.venv', '__pycache__', 'node_modules', 'out', 'venv']);

    const walk = (directoryPath: string): void => {
        for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
            if (ignoredDirectories.has(entry.name)) {
                continue;
            }

            const fullPath = path.join(directoryPath, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
                continue;
            }

            if (!entry.isFile() || !isCaseImplementationFile(fullPath)) {
                continue;
            }

            if (path.normalize(fullPath) === path.normalize(activeDocumentPath)) {
                continue;
            }

            const contentBuffer = fs.readFileSync(fullPath);
            if (isBinaryFile(fullPath, contentBuffer)) {
                continue;
            }

            const content = contentBuffer.toString('utf8');
            const lines = content.split(/\r?\n/);
            const matchedLineScores: Array<{ index: number; score: number; matchedTerms: string[] }> = [];
            const fileMatchedTerms = new Set<string>();
            for (let index = 0; index < lines.length; index++) {
                const lineText = lines[index] || '';
                const lineScore = scoreCaseLine(lineText, normalizedQuery, searchTerms);
                if (lineScore.score <= 0) {
                    continue;
                }

                matchedLineScores.push({
                    index,
                    score: lineScore.score,
                    matchedTerms: lineScore.matchedTerms
                });

                for (const term of lineScore.matchedTerms) {
                    fileMatchedTerms.add(term);
                }
            }

            if (matchedLineScores.length > 0) {
                matchedLineScores.sort((left, right) => right.score - left.score || left.index - right.index);
                const snippets = matchedLineScores
                    .slice(0, 3)
                    .map(item => collectSnippet(lines, item.index, 3).join('\n'))
                    .filter(Boolean);
                const aggregateScore = matchedLineScores.reduce((total, item) => total + item.score, 0) + fileMatchedTerms.size * 6;

                results.push({
                    filePath: fullPath,
                    relativePath: toRelativeWorkspacePath(fullPath, workspacePath),
                    snippets,
                    score: aggregateScore,
                    matchedTermCount: fileMatchedTerms.size
                });
            }
        }
    };

    walk(workspacePath);
    return results
        .sort((left, right) =>
            right.matchedTermCount - left.matchedTermCount
            || right.score - left.score
            || left.relativePath.localeCompare(right.relativePath))
        .slice(0, limit)
        .map(({ filePath, relativePath, snippets }) => ({ filePath, relativePath, snippets }));
}

export async function createLocalTools(
    document: vscode.TextDocument,
    runStateAccessor: () => AgentRunState
): Promise<AgentTool[]> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return [];
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const ensureAllowed = (context: AgentToolContext, toolName: string): void => {
        if (!context.allowedToolNames.has(toolName)) {
            throw new Error(`Tool ${toolName} is not allowed for this skill.`);
        }
    };

    return [
        {
            definition: {
                name: 'readActiveTestFile',
                description: 'Read the active Python test file and parse step comments.',
                inputSchema: '{}'
            },
            execute: async (_args, context) => {
                ensureAllowed(context, 'readActiveTestFile');
                const appName = vscode.workspace.getConfiguration('path').get<string>('appName') || '';
                const payload: ActiveTestFilePayload = {
                    filePath: document.uri.fsPath,
                    content: document.getText(),
                    steps: parseStepsFromFile(document.getText(), { includePreconditions: true }),
                    appName
                };
                return {
                    ok: true,
                    summary: `Read active test file with ${payload.steps.length} parsed steps.`,
                    content: payload
                };
            }
        },
        {
            definition: {
                name: 'readWorkspaceFile',
                description: 'Read a workspace file by absolute or workspace-relative path.',
                inputSchema: '{"filePath":"string"}'
            },
            execute: async (args, context) => {
                ensureAllowed(context, 'readWorkspaceFile');
                const rawPath = typeof args['filePath'] === 'string' ? args['filePath'] : '';
                if (!rawPath) {
                    throw new Error('filePath is required.');
                }
                const targetPath = path.isAbsolute(rawPath) ? rawPath : path.join(workspacePath, rawPath);
                if (!fs.existsSync(targetPath)) {
                    throw new Error(`File does not exist: ${targetPath}`);
                }
                return {
                    ok: true,
                    summary: `Read file ${toRelativeWorkspacePath(targetPath, workspacePath)}`,
                    content: {
                        filePath: targetPath,
                        relativePath: toRelativeWorkspacePath(targetPath, workspacePath),
                        content: fs.readFileSync(targetPath, 'utf8')
                    }
                };
            }
        },
        {
            definition: {
                name: 'searchWorkspace',
                description: 'Search workspace text across source files.',
                inputSchema: '{"queryText":"string","limit":10}'
            },
            execute: async (args, context) => {
                ensureAllowed(context, 'searchWorkspace');
                const queryText = typeof args['queryText'] === 'string' ? args['queryText'] : '';
                const limit = typeof args['limit'] === 'number' ? args['limit'] : 10;
                const results = await searchWorkspaceText(workspacePath, queryText, limit);
                return {
                    ok: true,
                    summary: `Found ${results.length} files matching ${queryText}`,
                    content: results
                };
            }
        },
        {
            definition: {
                name: 'searchCaseImplementations',
                description: 'Search existing test case files and return nearby implementation snippets that match the query.',
                inputSchema: '{"queryText":"string","limit":5}'
            },
            execute: async (args, context) => {
                ensureAllowed(context, 'searchCaseImplementations');
                const queryText = typeof args['queryText'] === 'string' ? args['queryText'] : '';
                const limit = typeof args['limit'] === 'number' ? args['limit'] : 5;
                const results = await searchCaseImplementations(workspacePath, document.uri.fsPath, queryText, limit);
                return {
                    ok: true,
                    summary: `Found ${results.length} case implementation references for ${queryText}`,
                    content: results
                };
            }
        },
        {
            definition: {
                name: 'findMethodCandidates',
                description: 'Find ranked method candidates for a described action or expectation.',
                inputSchema: '{"queryText":"string","candidateType":"action|assert|any","limit":10}'
            },
            execute: async (args, context) => {
                ensureAllowed(context, 'findMethodCandidates');
                const queryText = typeof args['queryText'] === 'string' ? args['queryText'] : '';
                const candidateType = typeof args['candidateType'] === 'string' ? args['candidateType'] : 'any';
                const limit = typeof args['limit'] === 'number' ? args['limit'] : 10;
                const ranked = await agentMethodSearchService.findCandidates({
                    queryText,
                    candidateType: candidateType === 'action' || candidateType === 'assert' || candidateType === 'unknown'
                        ? candidateType
                        : 'any',
                    limit
                });
                return {
                    ok: true,
                    summary: `Ranked ${ranked.length} method candidates for ${queryText}`,
                    content: ranked.map(item => ({
                        id: item.candidate.id,
                        codePath: item.candidate.codePath,
                        label: item.candidate.label,
                        filePath: item.candidate.filePath,
                        line: item.candidate.line,
                        score: item.score,
                        kind: item.candidate.kind,
                        elementDescs: item.candidate.elementDescs,
                        matchedTokens: item.matchedTokens
                    }))
                };
            }
        },
        {
            definition: {
                name: 'readMethodSource',
                description: 'Read source for a method candidate by candidateId or codePath.',
                inputSchema: '{"candidateId":"string","codePath":"string"}'
            },
            execute: async (args, context) => {
                ensureAllowed(context, 'readMethodSource');
                const candidateId = typeof args['candidateId'] === 'string' ? args['candidateId'] : '';
                const codePath = typeof args['codePath'] === 'string' ? args['codePath'] : '';
                let candidate = candidateId ? await agentMethodSearchService.getCandidateById(candidateId) : undefined;
                if (!candidate && codePath) {
                    const candidates = await agentMethodSearchService.getCandidates();
                    candidate = candidates.find(item => item.codePath === codePath);
                }
                if (!candidate) {
                    throw new Error('Candidate not found.');
                }
                const source = await agentMethodSearchService.getSourceByCandidateId(candidate.id);
                return {
                    ok: true,
                    summary: `Read source for ${candidate.codePath}`,
                    content: {
                        candidate,
                        source
                    }
                };
            }
        },
        {
            definition: {
                name: 'readElementSource',
                description: 'Read the paired *_ele.py source for a method candidate.',
                inputSchema: '{"candidateId":"string","codePath":"string"}'
            },
            execute: async (args, context) => {
                ensureAllowed(context, 'readElementSource');
                const candidateId = typeof args['candidateId'] === 'string' ? args['candidateId'] : '';
                const codePath = typeof args['codePath'] === 'string' ? args['codePath'] : '';
                let candidate = candidateId ? await agentMethodSearchService.getCandidateById(candidateId) : undefined;
                if (!candidate && codePath) {
                    const candidates = await agentMethodSearchService.getCandidates();
                    candidate = candidates.find(item => item.codePath === codePath);
                }
                if (!candidate) {
                    throw new Error('Candidate not found.');
                }
                const elementSource = await agentMethodSearchService.getElementSourceForCandidate(candidate.id);
                if (!elementSource) {
                    throw new Error(`No paired element file for ${candidate.codePath}`);
                }
                return {
                    ok: true,
                    summary: `Read element source ${toRelativeWorkspacePath(elementSource.filePath, workspacePath)}`,
                    content: elementSource
                };
            }
        },
        {
            definition: {
                name: 'getSniffState',
                description: 'Read the current PATH Sniff tree/details state.',
                inputSchema: '{}'
            },
            execute: async (_args, context) => {
                ensureAllowed(context, 'getSniffState');
                const sniffStateStore = getSniffStateStore();
                if (!sniffStateStore) {
                    return {
                        ok: true,
                        summary: 'Sniff state is not available.',
                        content: {
                            details: null,
                            tree: null
                        }
                    };
                }
                return {
                    ok: true,
                    summary: 'Loaded current Sniff state.',
                    content: {
                        details: sniffStateStore.getDetailsState(),
                        tree: sniffStateStore.getTreeState()
                    }
                };
            }
        },
        {
            definition: {
                name: 'getEleTreeSelection',
                description: 'Read the current selected element tree item, if any.',
                inputSchema: '{}'
            },
            execute: async (_args, context) => {
                ensureAllowed(context, 'getEleTreeSelection');
                return {
                    ok: true,
                    summary: 'Loaded current element tree selection.',
                    content: treeSelectionStore.getEleTreeSelection() || null
                };
            }
        },
        {
            definition: {
                name: 'getMethodsTreeSelection',
                description: 'Read the current selected methods tree item, if any.',
                inputSchema: '{}'
            },
            execute: async (_args, context) => {
                ensureAllowed(context, 'getMethodsTreeSelection');
                return {
                    ok: true,
                    summary: 'Loaded current methods tree selection.',
                    content: treeSelectionStore.getMethodsTreeSelection() || null
                };
            }
        },
        {
            definition: {
                name: 'proposePatch',
                description: 'Create a proposal-only patch for the active test document. It never writes automatically.',
                inputSchema: '{"title":"string","reason":"string","summary":"string","stepMappings":[{"stepLine":1,"stepDesc":"...","actionCalls":[{"path":"logic.foo"}],"actionSuggestion":"找不到方法时的中文建议","expectLine":2,"expectDesc":"...","assertCalls":[],"assertSuggestion":"找不到断言时的中文建议"}]}'
            },
            execute: async (args, context) => {
                ensureAllowed(context, 'proposePatch');
                const runState = runStateAccessor();
                if (runState.request.permissionMode !== 'propose_only') {
                    throw new Error(`Unsupported permission mode: ${runState.request.permissionMode}`);
                }

                const proposalInput = args as unknown as AgentProposalInput;
                const proposal = await createProposalFromInput(document, proposalInput, runState);
                agentPanelStateStore.addProposal(proposal);

                return {
                    ok: true,
                    summary: `Created proposal ${proposal.id} with ${proposal.operations.length} edit operations. ${proposal.summary}`.trim(),
                    content: {
                        proposalId: proposal.id,
                        patch: proposal.patch,
                        targetFilePath: proposal.targetFilePath,
                        summary: proposal.summary,
                        operationCount: proposal.operations.length
                    }
                };
            }
        }
    ];
}
