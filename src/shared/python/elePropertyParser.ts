import * as path from 'path';

export interface EleOperationTarget {
    eleFilePath: string;
    eleVariableName: string;
    eleLineNumber?: number;
    label?: string;
}

export interface ParsedEleProperty extends EleOperationTarget {
    desc: string;
    propertyLine: number;
    propertyEndLine: number;
    className: string;
}

/**
 * 判断当前文件是否为 `_ele.py` 元素定义文件。
 */
export function isEleDefinitionFile(filePath: string): boolean {
    return path.basename(filePath).toLowerCase().endsWith('_ele.py');
}

/**
 * 从单个 `_ele.py` 文档中解析可生成操作的元素属性。
 * 这里直接按类、`@ele`、`return Ele(...)` 的结构扫描，保证编辑器内可即时响应。
 */
export function parseEleProperties(content: string, eleFilePath: string): ParsedEleProperty[] {
    if (!isEleDefinitionFile(eleFilePath)) {
        return [];
    }

    const lines = content.split(/\r?\n/);
    const results: ParsedEleProperty[] = [];
    const classDefRegex = /^class\s+(\w*Ele)\s*(?:\(([^)]*)\))?\s*:/;

    let currentClass: { name: string; indent: number } | null = null;

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (line === undefined) {
            continue;
        }

        const classMatch = line.match(classDefRegex);
        if (classMatch?.[1]) {
            currentClass = {
                name: classMatch[1],
                indent: getLineIndent(line)
            };
            continue;
        }

        if (!currentClass) {
            continue;
        }

        if (isDedentedOutOfScope(line, currentClass.indent)) {
            currentClass = null;
            continue;
        }

        if (!line.match(/^\s+@ele\s*$/)) {
            continue;
        }

        const propertyLine = index + 1;
        const defLineIndex = index + 1;
        const defLine = lines[defLineIndex];
        if (!defLine) {
            continue;
        }

        const defMatch = defLine.match(/^\s+def\s+(\w+)\s*\(\s*self\s*\)\s*:/);
        if (!defMatch?.[1]) {
            continue;
        }

        const eleVariableName = defMatch[1];
        const defIndent = getLineIndent(defLine);
        const propertyEndLine = findMethodEndLine(lines, defLineIndex + 1, defIndent);
        const returnStatement = findEleReturnStatement(lines, defLineIndex + 1, propertyEndLine);
        if (!returnStatement) {
            continue;
        }

        const desc = extractEleDesc(returnStatement);
        if (!desc) {
            continue;
        }

        results.push({
            eleFilePath,
            eleVariableName,
            eleLineNumber: defLineIndex + 1,
            label: desc,
            desc,
            propertyLine,
            propertyEndLine,
            className: currentClass.name
        });

        index = Math.max(index, propertyEndLine - 1);
    }

    return results;
}

/**
 * 根据光标所在行定位当前属性，供命令在没有显式参数时兜底使用。
 */
export function findElePropertyAtLine(
    properties: ParsedEleProperty[],
    lineNumber: number
): ParsedEleProperty | undefined {
    return properties.find(property => lineNumber >= property.propertyLine && lineNumber <= property.propertyEndLine);
}

function getLineIndent(line: string): number {
    const indent = line.search(/\S/);
    return indent === -1 ? Number.MAX_SAFE_INTEGER : indent;
}

function isDedentedOutOfScope(line: string, baseIndent: number): boolean {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
        return false;
    }

    const indent = line.search(/\S/);
    return indent !== -1 && indent <= baseIndent;
}

/**
 * 找出属性方法的结束行，便于 CodeLens 命令按光标位置回溯属性。
 */
function findMethodEndLine(lines: string[], bodyStartIndex: number, defIndent: number): number {
    for (let index = bodyStartIndex; index < lines.length; index++) {
        const line = lines[index];
        if (line === undefined) {
            break;
        }

        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }

        const indent = line.search(/\S/);
        if (indent !== -1 && indent <= defIndent && !trimmed.startsWith('#')) {
            return index;
        }
    }

    return lines.length;
}

/**
 * 在属性方法体内提取完整的 `return Ele(...)` 调用，支持跨多行参数。
 */
function findEleReturnStatement(lines: string[], bodyStartIndex: number, methodEndLine: number): string | null {
    for (let index = bodyStartIndex; index < methodEndLine; index++) {
        const line = lines[index];
        if (!line || !line.match(/^\s+return\s+Ele\s*\(/)) {
            continue;
        }

        let statement = line;
        let openParens = (statement.match(/\(/g) || []).length;
        let closeParens = (statement.match(/\)/g) || []).length;

        while (openParens > closeParens && index < methodEndLine - 1) {
            index++;
            const nextLine = lines[index] || '';
            statement += `\n${nextLine}`;
            openParens += (nextLine.match(/\(/g) || []).length;
            closeParens += (nextLine.match(/\)/g) || []).length;
        }

        return statement;
    }

    return null;
}

function extractEleDesc(returnStatement: string): string | null {
    const descMatch = returnStatement.match(/desc\s*=\s*["']([^"']+)["']/);
    return descMatch?.[1]?.trim() || null;
}
