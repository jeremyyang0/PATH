import * as path from 'path';
import { TextDecoder, TextEncoder } from 'util';
import * as vscode from 'vscode';
import { getWorkspaceRootUri } from '../../../shared/path/workspacePathUtils';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const SNIFF_BRANCH_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/;

export interface SniffBranchScaffold {
    branchUri: vscode.Uri;
    branchName: string;
    pascalName: string;
}

export function isValidSniffBranchName(branchName: string): boolean {
    return SNIFF_BRANCH_NAME_PATTERN.test(branchName);
}

export async function createSniffBranch(
    parentUri: vscode.Uri,
    branchName: string
): Promise<SniffBranchScaffold> {
    const normalizedBranchName = branchName.trim();
    const pascalName = toPascalCase(normalizedBranchName);
    const branchUri = vscode.Uri.file(path.join(parentUri.fsPath, normalizedBranchName));

    await vscode.workspace.fs.createDirectory(branchUri);
    await writeTextFile(vscode.Uri.file(path.join(branchUri.fsPath, '__init__.py')), buildLeafInitFile(pascalName));
    await writeTextFile(
        vscode.Uri.file(path.join(branchUri.fsPath, `${normalizedBranchName}_ele.py`)),
        buildEleFile(pascalName)
    );
    await writeTextFile(
        vscode.Uri.file(path.join(branchUri.fsPath, `${normalizedBranchName}.py`)),
        buildMethodFile(parentUri.fsPath, normalizedBranchName, pascalName)
    );

    const parentInitUri = vscode.Uri.file(path.join(parentUri.fsPath, '__init__.py'));
    if (await pathExists(parentInitUri)) {
        const originalContent = await readTextFile(parentInitUri);
        const nextContent = patchParentInitFile(originalContent, parentUri.fsPath, normalizedBranchName, pascalName);
        if (nextContent !== originalContent) {
            await writeTextFile(parentInitUri, nextContent);
        }
    }

    return {
        branchUri,
        branchName: normalizedBranchName,
        pascalName
    };
}

function buildLeafInitFile(pascalName: string): string {
    return [
        `class ${pascalName}:`,
        '    """..."""',
        ''
    ].join('\n');
}

function buildEleFile(pascalName: string): string {
    return [
        'from dancemonkey import Ele',
        '',
        '',
        `class ${pascalName}Ele:`,
        '    """..."""',
        ''
    ].join('\n');
}

function buildMethodFile(parentDirectoryPath: string, branchName: string, pascalName: string): string {
    // Sniff 分支方法模板直接继承对应 Ele，避免再生成一层 `_BaseXxxMethod`。
    return [
        `from ${buildMethodModulePath(path.join(parentDirectoryPath, branchName, `${branchName}_ele.py`))} import ${pascalName}Ele`,
        'from richlogger import auto_logger',
        '',
        '',
        '@auto_logger',
        `class ${pascalName}Method(${pascalName}Ele):`,
        '    """组合方法"""',
        ''
    ].join('\n');
}

function patchParentInitFile(content: string, parentDirectoryPath: string, branchName: string, pascalName: string): string {
    const eol = detectEol(content);
    const importLine = `from ${buildMethodModulePath(path.join(parentDirectoryPath, branchName, `${branchName}.py`))} import ${pascalName}Method`;
    const assignmentLine = `        self.${branchName} = ${pascalName}Method()`;
    const normalizedContent = normalizeContent(content);
    const lines = normalizedContent.split('\n');

    insertImportLine(lines, importLine);
    insertAssignment(lines, assignmentLine);

    return lines.join(eol);
}

function detectEol(content: string): string {
    return content.includes('\r\n') ? '\r\n' : '\n';
}

function normalizeContent(content: string): string {
    return content.replace(/\r\n/g, '\n');
}

function insertImportLine(lines: string[], importLine: string): void {
    if (lines.some(line => line.trim() === importLine)) {
        return;
    }

    const importInsertIndex = findImportInsertIndex(lines);
    if (importInsertIndex >= 0) {
        lines.splice(importInsertIndex, 0, importLine);
        return;
    }

    const firstContentIndex = lines.findIndex(line => line.trim().length > 0);
    if (firstContentIndex === -1) {
        lines.splice(0, lines.length, importLine, '');
        return;
    }

    lines.splice(firstContentIndex, 0, importLine, '');
}

function findImportInsertIndex(lines: string[]): number {
    let lastImportEndIndex = -1;
    let insideImportStatement = false;
    let parenthesisBalance = 0;

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        const trimmedLine = line.trim();

        if (!trimmedLine) {
            if (insideImportStatement) {
                continue;
            }
            if (lastImportEndIndex >= 0) {
                return lastImportEndIndex + 1;
            }
            continue;
        }

        if (trimmedLine.startsWith('#') && !insideImportStatement) {
            if (lastImportEndIndex >= 0) {
                return lastImportEndIndex + 1;
            }
            continue;
        }

        if (!insideImportStatement) {
            if (!/^(from|import)\s+/.test(trimmedLine)) {
                return lastImportEndIndex >= 0 ? lastImportEndIndex + 1 : -1;
            }

            insideImportStatement = true;
            parenthesisBalance = countParenthesisDelta(line);
            if (parenthesisBalance <= 0 && !trimmedLine.endsWith('\\')) {
                insideImportStatement = false;
                lastImportEndIndex = index;
            }
            continue;
        }

        parenthesisBalance += countParenthesisDelta(line);
        if (parenthesisBalance <= 0 && !trimmedLine.endsWith('\\')) {
            insideImportStatement = false;
            lastImportEndIndex = index;
        }
    }

    return lastImportEndIndex >= 0 ? lastImportEndIndex + 1 : -1;
}

function countParenthesisDelta(line: string): number {
    const openCount = (line.match(/\(/g) || []).length;
    const closeCount = (line.match(/\)/g) || []).length;
    return openCount - closeCount;
}

function insertAssignment(lines: string[], assignmentLine: string): void {
    if (lines.some(line => line.trim() === assignmentLine.trim())) {
        return;
    }

    const classIndex = lines.findIndex(line => /^class\s+[A-Za-z_][A-Za-z0-9_]*\s*(?:\([^)]*\))?\s*:/.test(line.trim()));
    if (classIndex === -1) {
        return;
    }

    const classEndIndex = findTopLevelBoundary(lines, classIndex + 1);
    const initIndex = findInitMethodIndex(lines, classIndex + 1, classEndIndex);
    if (initIndex >= 0) {
        insertIntoExistingInit(lines, initIndex, classEndIndex, assignmentLine);
        return;
    }

    insertNewInit(lines, classIndex, classEndIndex, assignmentLine);
}

function findTopLevelBoundary(lines: string[], startIndex: number): number {
    for (let index = startIndex; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        const trimmedLine = line.trim();
        if (!trimmedLine) {
            continue;
        }

        if (!line.startsWith(' ') && !line.startsWith('\t')) {
            return index;
        }
    }

    return lines.length;
}

function findInitMethodIndex(lines: string[], startIndex: number, endIndex: number): number {
    for (let index = startIndex; index < endIndex; index += 1) {
        if (/^\s{4}def __init__\s*\(\s*self[\w\s,:=]*\)\s*:/.test(lines[index] ?? '')) {
            return index;
        }
    }

    return -1;
}

function insertIntoExistingInit(
    lines: string[],
    initIndex: number,
    classEndIndex: number,
    assignmentLine: string
): void {
    const initEndIndex = findSiblingBoundary(lines, initIndex + 1, classEndIndex);
    let insertIndex = initEndIndex;

    while (insertIndex > initIndex + 1 && (lines[insertIndex - 1] ?? '').trim() === '') {
        insertIndex -= 1;
    }

    lines.splice(insertIndex, 0, assignmentLine);
}

function findSiblingBoundary(lines: string[], startIndex: number, endIndex: number): number {
    for (let index = startIndex; index < endIndex; index += 1) {
        const line = lines[index] ?? '';
        const trimmedLine = line.trim();
        if (!trimmedLine) {
            continue;
        }

        const indentLength = line.length - line.trimStart().length;
        if (indentLength <= 4) {
            return index;
        }
    }

    return endIndex;
}

function insertNewInit(
    lines: string[],
    classIndex: number,
    classEndIndex: number,
    assignmentLine: string
): void {
    const insertIndex = findNewInitInsertionIndex(lines, classIndex, classEndIndex);
    const snippet: string[] = [];
    if (insertIndex > classIndex + 1 && (lines[insertIndex - 1] ?? '').trim() !== '') {
        snippet.push('');
    }

    snippet.push('    def __init__(self):');
    snippet.push(assignmentLine);

    if (insertIndex < classEndIndex && (lines[insertIndex] ?? '').trim() !== '') {
        snippet.push('');
    }

    lines.splice(insertIndex, 0, ...snippet);
}

function findNewInitInsertionIndex(lines: string[], classIndex: number, classEndIndex: number): number {
    let index = classIndex + 1;

    while (index < classEndIndex && (lines[index] ?? '').trim() === '') {
        index += 1;
    }

    if (index >= classEndIndex) {
        return classEndIndex;
    }

    if (isTripleQuotedLine(lines[index] ?? '')) {
        const docstringEndIndex = findDocstringEndIndex(lines, index, classEndIndex);
        return docstringEndIndex + 1;
    }

    return index;
}

function isTripleQuotedLine(line: string): boolean {
    const trimmedLine = line.trim();
    return trimmedLine.startsWith('"""') || trimmedLine.startsWith("'''");
}

function findDocstringEndIndex(lines: string[], startIndex: number, classEndIndex: number): number {
    const firstLine = lines[startIndex] ?? '';
    const delimiter = firstLine.trim().startsWith('"""') ? '"""' : "'''";
    const delimiterCount = (firstLine.match(new RegExp(delimiter, 'g')) || []).length;
    if (delimiterCount >= 2) {
        return startIndex;
    }

    for (let index = startIndex + 1; index < classEndIndex; index += 1) {
        if ((lines[index] ?? '').includes(delimiter)) {
            return index;
        }
    }

    return startIndex;
}

function toPascalCase(value: string): string {
    return value.replace(/(^|_)([a-z0-9])/g, (_, __, letter: string) => letter.toUpperCase());
}

function buildMethodModulePath(absoluteFilePath: string): string {
    const workspaceRoot = getWorkspaceRootUri()?.fsPath;
    if (!workspaceRoot) {
        return absoluteFilePath.replace(/\\/g, '/').replace(/\.py$/, '').replace(/\//g, '.');
    }

    const methodRoot = path.join(workspaceRoot, 'method');
    const normalizedAbsolutePath = path.normalize(absoluteFilePath);
    const normalizedMethodRoot = path.normalize(methodRoot);
    const methodRelativePath = path.relative(normalizedMethodRoot, normalizedAbsolutePath);

    if (methodRelativePath.startsWith('..') || path.isAbsolute(methodRelativePath)) {
        return normalizedAbsolutePath.replace(/\\/g, '/').replace(/\.py$/, '').replace(/\//g, '.');
    }

    return `method.${methodRelativePath.replace(/\\/g, '.').replace(/\.py$/, '')}`;
}

async function readTextFile(targetUri: vscode.Uri): Promise<string> {
    const buffer = await vscode.workspace.fs.readFile(targetUri);
    return textDecoder.decode(buffer);
}

async function writeTextFile(targetUri: vscode.Uri, content: string): Promise<void> {
    await vscode.workspace.fs.writeFile(targetUri, textEncoder.encode(content));
}

async function pathExists(targetUri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(targetUri);
        return true;
    } catch {
        return false;
    }
}
