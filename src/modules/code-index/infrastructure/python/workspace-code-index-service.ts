import * as fs from 'fs';
import * as path from 'path';
import {
    ElementDescriptor,
    ElementFileIndex,
    MethodDescriptor,
    MethodFileIndex,
    WorkspaceCodeIndex
} from '../../domain/workspace-code-index';

function shouldIgnorePythonTreeDirectory(directoryName: string): boolean {
    return directoryName.startsWith('_');
}

function containsChinese(text: string): boolean {
    return /[\u4e00-\u9fff]/.test(text);
}

function extractPackageName(initFilePath: string): string | null {
    try {
        const content = fs.readFileSync(initFilePath, 'utf-8');
        const lines = content.split(/\r?\n/);
        const classDefRegex = /^class\s+([^\s(:]+)(?:\s*\([^)]*\))?\s*:/;

        for (let index = 0; index < lines.length; index++) {
            const line = lines[index];
            if (!line) {
                continue;
            }

            const classMatch = line.match(classDefRegex);
            if (!classMatch?.[1]) {
                continue;
            }

            const className = classMatch[1];
            if (containsChinese(className)) {
                return className;
            }

            const nextLine = lines[index + 1];
            if (nextLine) {
                const docMatch = nextLine.match(/^\s*['"]{3}([^'"]+)['"]{3}/);
                if (docMatch?.[1] && containsChinese(docMatch[1])) {
                    return docMatch[1].trim();
                }
            }

            for (let scanIndex = index + 1; scanIndex < Math.min(index + 20, lines.length); scanIndex++) {
                const attrLine = lines[scanIndex];
                if (!attrLine) {
                    continue;
                }

                if (attrLine.match(/^class\s+/) || (attrLine.match(/^\S/) && !attrLine.match(/^\s*#/))) {
                    break;
                }

                const attrMatch = attrLine.match(
                    /^\s*(name|display_name|title|chinese_name|desc|description)\s*=\s*['"](.*)['"]/
                );
                if (attrMatch?.[2] && containsChinese(attrMatch[2])) {
                    return attrMatch[2];
                }
            }
        }

        return null;
    } catch {
        return null;
    }
}

function parseElementDescriptor(name: string, argsStr: string, line: number, fullLine: string): ElementDescriptor | null {
    const descMatch = argsStr.match(/desc\s*=\s*["']([^"']+)["']/);
    const desc = descMatch?.[1] || '';
    if (!desc) {
        return null;
    }

    return {
        name,
        value: fullLine.trim(),
        line,
        arguments: [],
        desc,
        hierarchy: desc.includes(' -> ') ? desc.split(' -> ') : [desc]
    };
}

function parseElementFile(filePath: string): ElementFileIndex[] {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split(/\r?\n/);
        const results: ElementFileIndex[] = [];
        const classDefRegex = /^class\s+(\w*Ele)\s*(?:\(([^)]*)\))?\s*:/;

        let currentClass: { name: string; line: number; bases: string[] } | null = null;
        let classIndent = 0;
        let elements: ElementDescriptor[] = [];

        for (let index = 0; index < lines.length; index++) {
            const line = lines[index];
            if (line === undefined) {
                continue;
            }

            const lineNumber = index + 1;
            const classMatch = line.match(classDefRegex);
            if (classMatch?.[1]) {
                if (currentClass && elements.length > 0) {
                    results.push({
                        filePath,
                        className: currentClass.name,
                        classLine: currentClass.line,
                        baseClasses: currentClass.bases,
                        elements
                    });
                }

                currentClass = {
                    name: classMatch[1],
                    line: lineNumber,
                    bases: classMatch[2] ? classMatch[2].split(',').map(base => base.trim()) : []
                };
                classIndent = line.search(/\S/);
                elements = [];
                continue;
            }

            if (!currentClass) {
                continue;
            }

            const currentIndent = line.search(/\S/);
            if (currentIndent !== -1 && currentIndent <= classIndent && !line.match(/^\s*#/) && line.trim() !== '') {
                if (elements.length > 0) {
                    results.push({
                        filePath,
                        className: currentClass.name,
                        classLine: currentClass.line,
                        baseClasses: currentClass.bases,
                        elements
                    });
                }
                currentClass = null;
                elements = [];
                continue;
            }

            if (!line.match(/^\s+@ele\s*$/)) {
                continue;
            }

            const defLine = lines[index + 1];
            if (!defLine) {
                continue;
            }

            const defMatch = defLine.match(/^\s+def\s+(\w+)\s*\(\s*self\s*\)\s*:/);
            if (!defMatch?.[1]) {
                continue;
            }

            const variableName = defMatch[1];
            const defLineNumber = index + 2;
            let foundElement = false;
            let fullStatement = '';

            for (let scanIndex = index + 2; scanIndex < lines.length; scanIndex++) {
                const methodLine = lines[scanIndex];
                if (methodLine === undefined) {
                    break;
                }

                const methodIndent = methodLine.search(/\S/);
                if (methodIndent !== -1 && methodIndent <= defLine.search(/\S/) && methodLine.trim() !== '') {
                    break;
                }

                if (!methodLine.match(/^\s+return\s+Ele\s*\(/)) {
                    continue;
                }

                foundElement = true;
                fullStatement = methodLine;
                let openParens = (fullStatement.match(/\(/g) || []).length;
                let closeParens = (fullStatement.match(/\)/g) || []).length;

                while (openParens > closeParens && scanIndex < lines.length - 1) {
                    scanIndex++;
                    const nextLine = lines[scanIndex] || '';
                    fullStatement += `\n${nextLine}`;
                    openParens += (nextLine.match(/\(/g) || []).length;
                    closeParens += (nextLine.match(/\)/g) || []).length;
                }

                index = scanIndex;
                break;
            }

            if (!foundElement || !fullStatement) {
                continue;
            }

            const firstParenIndex = fullStatement.indexOf('Ele(') + 3;
            const lastParenIndex = fullStatement.lastIndexOf(')');
            if (firstParenIndex === -1 || lastParenIndex === -1 || lastParenIndex <= firstParenIndex) {
                continue;
            }

            const argsStr = fullStatement.substring(firstParenIndex + 1, lastParenIndex);
            const descriptor = parseElementDescriptor(variableName, argsStr, defLineNumber, fullStatement);
            if (descriptor) {
                elements.push(descriptor);
            }
        }

        if (currentClass && elements.length > 0) {
            results.push({
                filePath,
                className: currentClass.name,
                classLine: currentClass.line,
                baseClasses: currentClass.bases,
                elements
            });
        }

        return results;
    } catch {
        return [];
    }
}

function parseMethodFile(filePath: string): MethodFileIndex | null {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split(/\r?\n/);
        const methods: MethodDescriptor[] = [];
        const methodDefRegex = /^(\s*)def\s+([a-zA-Z][a-zA-Z0-9_]*)\s*\([^)]*\)\s*(?:->\s*[^:]+)?\s*:/;
        const classDefRegex = /^(\s*)class\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\([^)]*\))?\s*:/;
        const classStack: Array<{ indent: number; name: string }> = [];

        for (let index = 0; index < lines.length; index++) {
            const line = lines[index];
            if (line === undefined) {
                continue;
            }

            const classMatch = line.match(classDefRegex);
            if (classMatch?.[2]) {
                const indent = classMatch[1]?.length ?? 0;
                while (classStack.length > 0 && indent <= classStack[classStack.length - 1]!.indent) {
                    classStack.pop();
                }
                classStack.push({
                    indent,
                    name: classMatch[2]
                });
                continue;
            }

            const currentIndent = line.search(/\S/);
            if (currentIndent !== -1 && line.trim() !== '' && !line.trim().startsWith('#')) {
                while (classStack.length > 0 && currentIndent <= classStack[classStack.length - 1]!.indent) {
                    classStack.pop();
                }
            }

            const lineNumber = index + 1;
            const methodMatch = line.match(methodDefRegex);
            if (!methodMatch?.[2]) {
                continue;
            }

            const methodName = methodMatch[2];
            if (methodName.startsWith('_')) {
                continue;
            }

            let doc = methodName;
            const nextLine = lines[index + 1];
            if (nextLine) {
                const singleLineDocMatch = nextLine.match(/^\s*['"]{3}([^'"]*)['"]{3}/);
                if (singleLineDocMatch?.[1] !== undefined) {
                    doc = singleLineDocMatch[1].trim() || methodName;
                } else {
                    const docStartMatch = nextLine.match(/^\s*(['"]{3})(.*)$/);
                    if (docStartMatch) {
                        const delimiter = docStartMatch[1] || '';
                        let docContent = docStartMatch[2] || '';
                        if (delimiter && docContent.endsWith(delimiter)) {
                            doc = docContent.slice(0, -delimiter.length).trim() || methodName;
                        } else {
                            for (let docIndex = index + 2; docIndex < lines.length; docIndex++) {
                                const docLine = lines[docIndex];
                                if (docLine === undefined) {
                                    break;
                                }

                                const docEndMatch = docLine.match(/^(.*)['"]{3}/);
                                if (docEndMatch) {
                                    docContent += `\n${docEndMatch[1] || ''}`;
                                    break;
                                }

                                docContent += `\n${docLine}`;
                            }

                            const firstLine = docContent.trim().split('\n')[0];
                            doc = firstLine ? firstLine.trim() : methodName;
                        }
                    }
                }
            }

            methods.push({
                name: methodName,
                line: lineNumber,
                doc,
                className: classStack[classStack.length - 1]?.name
            });
        }

        return methods.length > 0 ? { filePath, methods } : null;
    } catch {
        return null;
    }
}

function scanPythonFiles(rootDir: string): string[] {
    const pythonFiles: string[] = [];
    const methodDir = path.join(rootDir, 'method');
    if (!fs.existsSync(methodDir)) {
        return pythonFiles;
    }

    const walkDir = (dir: string): void => {
        const items = fs.readdirSync(dir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = path.join(dir, item.name);
            if (item.isDirectory()) {
                if (shouldIgnorePythonTreeDirectory(item.name)) {
                    continue;
                }

                walkDir(fullPath);
            } else if (item.name.endsWith('.py')) {
                pythonFiles.push(fullPath);
            }
        }
    };

    walkDir(methodDir);
    return pythonFiles;
}

function scanPackageNames(rootDir: string): Record<string, string> {
    const packageNames: Record<string, string> = {};
    const methodDir = path.join(rootDir, 'method');
    if (!fs.existsSync(methodDir)) {
        return packageNames;
    }

    const walkDir = (dir: string): void => {
        const items = fs.readdirSync(dir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = path.join(dir, item.name);
            if (!item.isDirectory()) {
                continue;
            }

            if (shouldIgnorePythonTreeDirectory(item.name)) {
                continue;
            }

            const initFile = path.join(fullPath, '__init__.py');
            if (fs.existsSync(initFile)) {
                const relativePath = path.relative(methodDir, fullPath);
                const packageName = relativePath === '.'
                    ? 'method'
                    : `method.${relativePath.replace(/[\\/]/g, '.')}`;
                const chineseName = extractPackageName(initFile);
                if (chineseName) {
                    packageNames[packageName] = chineseName;
                }
            }

            walkDir(fullPath);
        }
    };

    walkDir(methodDir);
    return packageNames;
}

export class WorkspaceCodeIndexService {
    /**
     * 统一构建工作区的 Python 元素/方法索引，避免多个视图重复扫目录和解析文件。
     */
    public async build(rootDir: string): Promise<WorkspaceCodeIndex> {
        const packageNames = scanPackageNames(rootDir);
        const pythonFiles = scanPythonFiles(rootDir);
        const elementFiles: ElementFileIndex[] = [];
        const methodFiles: MethodFileIndex[] = [];

        for (const filePath of pythonFiles) {
            elementFiles.push(...parseElementFile(filePath));

            const fileName = path.basename(filePath).toLowerCase();
            if (!fileName.endsWith('ele.py') && !fileName.endsWith('_ele.py')) {
                const methodIndex = parseMethodFile(filePath);
                if (methodIndex) {
                    methodFiles.push(methodIndex);
                }
            }
        }

        return {
            generatedAt: new Date(),
            packageNames,
            elementFiles,
            methodFiles
        };
    }
}

export const workspaceCodeIndexService = new WorkspaceCodeIndexService();
