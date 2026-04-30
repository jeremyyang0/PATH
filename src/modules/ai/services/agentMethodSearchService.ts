import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { workspaceCodeIndexService } from '../../code-index';
import { AgentMethodCandidate, MethodCandidateKind } from '../models/agentModels';

function normalizeText(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function splitTokens(value: string): string[] {
    const normalized = normalizeText(value);
    return normalized ? normalized.split(' ').filter(Boolean) : [];
}

function splitIdentifier(value: string): string[] {
    return splitTokens(value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_./\\-]+/g, ' '));
}

function buildAliases(codePath: string, doc: string, elementDescs: string[]): string[] {
    const aliases = new Set<string>();
    splitIdentifier(codePath).forEach(token => aliases.add(token));
    splitTokens(doc).forEach(token => aliases.add(token));
    elementDescs.forEach(desc => splitTokens(desc).forEach(token => aliases.add(token)));

    const semanticAliases: Array<[RegExp, string[]]> = [
        [/btn|button/, ['button', 'click', 'press']],
        [/dialog|window/, ['dialog', 'window', 'popup']],
        [/delete|remove/, ['delete', 'remove']],
        [/add|create/, ['add', 'create']],
        [/ok|confirm/, ['ok', 'confirm']],
        [/cancel/, ['cancel', 'close']]
    ];

    for (const [pattern, extraTokens] of semanticAliases) {
        if (pattern.test(codePath) || pattern.test(doc)) {
            extraTokens.forEach(token => aliases.add(token));
        }
    }

    return [...aliases];
}

function inferCandidateKind(codePath: string, doc: string): MethodCandidateKind {
    const sample = `${codePath} ${doc}`.toLowerCase();
    if (sample.includes('.assert') || sample.includes('assert_') || sample.includes('verify') || sample.includes('check')) {
        return 'assert';
    }
    if (sample.includes('click') || sample.includes('open') || sample.includes('close') || sample.includes('select')) {
        return 'action';
    }
    return 'unknown';
}

function findMethodBlock(content: string, methodLine: number): string {
    const lines = content.split(/\r?\n/);
    const startIndex = Math.max(0, methodLine - 1);
    if (startIndex >= lines.length) {
        return '';
    }

    const startLine = lines[startIndex] ?? '';
    const startIndent = startLine.search(/\S/);
    const block = [startLine];

    for (let index = startIndex + 1; index < lines.length; index++) {
        const line = lines[index] ?? '';
        const currentIndent = line.search(/\S/);
        if (line.trim() !== '' && currentIndent !== -1 && currentIndent <= startIndent && !line.trim().startsWith('#')) {
            break;
        }
        block.push(line);
    }

    return block.join('\n').trim();
}

function resolveElementFilePath(methodFilePath: string): string | undefined {
    const ext = path.extname(methodFilePath);
    const baseName = path.basename(methodFilePath, ext);
    const eleFilePath = path.join(path.dirname(methodFilePath), `${baseName}_ele${ext}`);
    return fs.existsSync(eleFilePath) ? eleFilePath : undefined;
}

function computeAppName(packagePath: string): string {
    return packagePath.split('.')[0] || '';
}

function buildPackagePath(methodFilePath: string, workspacePath: string): string {
    const methodRootPath = path.join(workspacePath, 'method');
    const relativePath = path.relative(methodRootPath, methodFilePath).replace(/\\/g, '/');
    const withoutExtension = relativePath.replace(/\.py$/, '');
    const segments = withoutExtension.split('/').filter(Boolean);

    if (segments.length >= 2) {
        const fileStem = segments[segments.length - 1];
        const parentStem = segments[segments.length - 2];
        if (fileStem === parentStem) {
            segments.pop();
        }
    }

    return segments.join('.');
}

export interface FindMethodCandidatesOptions {
    queryText: string;
    candidateType?: MethodCandidateKind | 'any';
    limit?: number;
}

export interface RankedMethodCandidate {
    candidate: AgentMethodCandidate;
    score: number;
    matchedTokens: string[];
}

export class AgentMethodSearchService {
    private cacheKey = '';
    private candidates: AgentMethodCandidate[] = [];
    private sourceByCandidateId = new Map<string, string>();

    public async getCandidates(): Promise<AgentMethodCandidate[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        const workspacePath = workspaceFolder.uri.fsPath;
        if (workspacePath === this.cacheKey && this.candidates.length > 0) {
            return this.candidates.map(candidate => ({
                ...candidate,
                aliases: [...candidate.aliases],
                tokens: [...candidate.tokens],
                elementDescs: [...candidate.elementDescs]
            }));
        }

        const parsed = await workspaceCodeIndexService.build(workspacePath);
        const eleVariablesByFile = new Map<string, Map<string, string>>();
        for (const file of parsed.elementFiles) {
            eleVariablesByFile.set(path.normalize(file.filePath), new Map(file.elements.map(variable => [variable.name, variable.desc])));
        }

        const nextCandidates: AgentMethodCandidate[] = [];
        const nextSources = new Map<string, string>();

        for (const result of parsed.methodFiles) {
            const methodFilePath = path.normalize(result.filePath);
            const fileContent = fs.existsSync(methodFilePath) ? fs.readFileSync(methodFilePath, 'utf8') : '';
            const packagePath = buildPackagePath(methodFilePath, workspacePath);
            const eleFilePath = resolveElementFilePath(methodFilePath);
            const eleDescsByName = eleFilePath ? eleVariablesByFile.get(path.normalize(eleFilePath)) : undefined;

            for (const method of result.methods) {
                const methodSource = findMethodBlock(fileContent, method.line);
                const referencedElementNames = [...new Set(Array.from(methodSource.matchAll(/self\.([A-Za-z_][A-Za-z0-9_]*)/g)).map(match => match[1] || '').filter(Boolean))];
                const elementDescs = referencedElementNames
                    .map(name => eleDescsByName?.get(name))
                    .filter((value): value is string => Boolean(value));
                const codePath = `${packagePath}.${method.name}`.replace(/^method\./, '');
                const aliases = buildAliases(codePath, method.doc || '', elementDescs);
                const className = method.className || path.basename(methodFilePath, '.py');
                const searchText = [codePath, method.doc || '', className, packagePath, ...elementDescs, ...aliases].join(' ');
                const id = `${codePath}:${method.line}`;

                const candidate: AgentMethodCandidate = {
                    id,
                    codePath,
                    label: method.doc || method.name,
                    methodDoc: method.doc || '',
                    filePath: methodFilePath,
                    packagePath,
                    className,
                    kind: inferCandidateKind(codePath, method.doc || ''),
                    aliases,
                    tokens: [...new Set(splitIdentifier(searchText))],
                    searchText: normalizeText(searchText),
                    elementDescs,
                    appName: computeAppName(packagePath),
                    line: method.line
                };

                nextCandidates.push(candidate);
                nextSources.set(id, methodSource);
            }
        }

        this.cacheKey = workspacePath;
        this.candidates = nextCandidates;
        this.sourceByCandidateId = nextSources;
        return this.getCandidates();
    }

    public async findCandidates(options: FindMethodCandidatesOptions): Promise<RankedMethodCandidate[]> {
        const allCandidates = await this.getCandidates();
        const queryTokens = [...new Set(splitIdentifier(options.queryText))];
        const normalizedQuery = normalizeText(options.queryText);
        const limit = options.limit ?? 10;
        const requestedType = options.candidateType ?? 'any';

        return allCandidates
            .filter(candidate => requestedType === 'any' || candidate.kind === requestedType || (requestedType === 'action' && candidate.kind === 'unknown'))
            .map(candidate => {
                let score = 0;
                const matchedTokens: string[] = [];

                for (const token of queryTokens) {
                    if (candidate.tokens.includes(token)) {
                        score += 20;
                        matchedTokens.push(token);
                    } else if (candidate.codePath.toLowerCase().includes(token)) {
                        score += 12;
                        matchedTokens.push(token);
                    } else if (candidate.searchText.includes(token)) {
                        score += 8;
                        matchedTokens.push(token);
                    }
                }

                if (normalizedQuery && candidate.searchText.includes(normalizedQuery)) {
                    score += 30;
                }

                if (candidate.appName && normalizedQuery.includes(candidate.appName.toLowerCase())) {
                    score += 6;
                }

                if (candidate.kind === 'action' && /(click|open|close|select|choose|add|delete)/.test(normalizedQuery)) {
                    score += 4;
                }

                if (candidate.kind === 'assert' && /(assert|verify|check|expect|show|exist|success)/.test(normalizedQuery)) {
                    score += 4;
                }

                return {
                    candidate,
                    score,
                    matchedTokens: [...new Set(matchedTokens)]
                };
            })
            .filter(item => item.score > 0)
            .sort((left, right) => right.score - left.score)
            .slice(0, limit);
    }

    public async getCandidateById(candidateId: string): Promise<AgentMethodCandidate | undefined> {
        const candidates = await this.getCandidates();
        return candidates.find(candidate => candidate.id === candidateId);
    }

    public async getSourceByCandidateId(candidateId: string): Promise<string> {
        if (!this.sourceByCandidateId.has(candidateId)) {
            await this.getCandidates();
        }
        return this.sourceByCandidateId.get(candidateId) || '';
    }

    public async getElementSourceForCandidate(candidateId: string): Promise<{ filePath: string; content: string } | undefined> {
        const candidate = await this.getCandidateById(candidateId);
        if (!candidate) {
            return undefined;
        }

        const eleFilePath = resolveElementFilePath(candidate.filePath);
        if (!eleFilePath || !fs.existsSync(eleFilePath)) {
            return undefined;
        }

        return {
            filePath: eleFilePath,
            content: fs.readFileSync(eleFilePath, 'utf8')
        };
    }
}

export const agentMethodSearchService = new AgentMethodSearchService();
