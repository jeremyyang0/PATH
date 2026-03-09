import * as fs from 'fs';
import * as path from 'path';

export interface ParseResult {
    results: FileResult[];
    packageNames: Record<string, string>;
    methodResults: MethodResult[];
}

export interface FileResult {
    filePath: string;
    className: string;
    classLine: number;
    baseClasses: string[];
    eleVariables: EleVariable[];
}

export interface EleVariable {
    name: string;
    value: string;
    line: number;
    arguments: string[];
    desc: string;
    hierarchy: string[];
}

export interface MethodResult {
    filePath: string;
    methods: MethodInfo[];
}

export interface MethodInfo {
    name: string;
    line: number;
    doc: string;
}

/**
 * Python index builder used by the tree views and AI features.
 */
export class PythonIndexService {
    private packageNames: Record<string, string> = {};

    public constructor(private readonly rootDir: string) {}

    private containsChinese(text: string): boolean {
        return /[\u4e00-\u9fff]/.test(text);
    }

    private extractPackageName(initFilePath: string): string | null {
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
                if (!classMatch) {
                    continue;
                }

                const className = classMatch[1];
                if (!className) {
                    continue;
                }

                if (this.containsChinese(className)) {
                    return className;
                }

                const nextLine = lines[index + 1];
                if (nextLine) {
                    const docMatch = nextLine.match(/^\s*['"]{3}([^'"]+)['"]{3}/);
                    if (docMatch?.[1] && this.containsChinese(docMatch[1])) {
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
                    if (attrMatch?.[2] && this.containsChinese(attrMatch[2])) {
                        return attrMatch[2];
                    }
                }
            }

            return null;
        } catch {
            return null;
        }
    }

    private scanPackages(): void {
        const methodDir = path.join(this.rootDir, 'method');
        if (!fs.existsSync(methodDir)) {
            return;
        }

        const walkDir = (dir: string): void => {
            const items = fs.readdirSync(dir, { withFileTypes: true });

            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory()) {
                    const initFile = path.join(fullPath, '__init__.py');
                    if (fs.existsSync(initFile)) {
                        const relativePath = path.relative(methodDir, fullPath);
                        const packageName = relativePath === '.'
                            ? 'method'
                            : `method.${relativePath.replace(/[\\/]/g, '.')}`;
                        const chineseName = this.extractPackageName(initFile);
                        if (chineseName) {
                            this.packageNames[packageName] = chineseName;
                        }
                    }

                    walkDir(fullPath);
                }
            }
        };

        walkDir(methodDir);
    }

    private parseFile(filePath: string): FileResult[] {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split(/\r?\n/);
            const results: FileResult[] = [];
            const classDefRegex = /^class\s+(\w*Ele)\s*(?:\(([^)]*)\))?\s*:/;

            let currentClass: { name: string; line: number; bases: string[] } | null = null;
            let classIndent = 0;
            let eleVariables: EleVariable[] = [];

            for (let index = 0; index < lines.length; index++) {
                const line = lines[index];
                if (line === undefined) {
                    continue;
                }

                const lineNumber = index + 1;
                const classMatch = line.match(classDefRegex);
                if (classMatch?.[1]) {
                    if (currentClass && eleVariables.length > 0) {
                        results.push({
                            filePath,
                            className: currentClass.name,
                            classLine: currentClass.line,
                            baseClasses: currentClass.bases,
                            eleVariables
                        });
                    }

                    currentClass = {
                        name: classMatch[1],
                        line: lineNumber,
                        bases: classMatch[2] ? classMatch[2].split(',').map(base => base.trim()) : []
                    };
                    classIndent = line.search(/\S/);
                    eleVariables = [];
                    continue;
                }

                if (!currentClass) {
                    continue;
                }

                const currentIndent = line.search(/\S/);
                if (currentIndent !== -1 && currentIndent <= classIndent && !line.match(/^\s*#/) && line.trim() !== '') {
                    if (eleVariables.length > 0) {
                        results.push({
                            filePath,
                            className: currentClass.name,
                            classLine: currentClass.line,
                            baseClasses: currentClass.bases,
                            eleVariables
                        });
                    }
                    currentClass = null;
                    eleVariables = [];
                    continue;
                }

                const propertyMatch = line.match(/^\s+@property\s*$/);
                if (!propertyMatch) {
                    continue;
                }

                const nextLineIndex = index + 1;
                if (nextLineIndex >= lines.length) {
                    continue;
                }

                const defLine = lines[nextLineIndex];
                if (defLine === undefined) {
                    continue;
                }

                const defMatch = defLine.match(/^\s+def\s+(\w+)\s*\(\s*self\s*\)\s*:/);
                if (!defMatch?.[1]) {
                    continue;
                }

                const variableName = defMatch[1];
                const defLineNumber = nextLineIndex + 1;
                let foundEle = false;
                let fullStatement = '';

                for (let scanIndex = nextLineIndex + 1; scanIndex < lines.length; scanIndex++) {
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

                    foundEle = true;
                    fullStatement = methodLine;
                    let openParens = (fullStatement.match(/\(/g) || []).length;
                    let closeParens = (fullStatement.match(/\)/g) || []).length;

                    while (openParens > closeParens && scanIndex < lines.length - 1) {
                        scanIndex++;
                        const nextLine = lines[scanIndex];
                        fullStatement += `\n${nextLine}`;

                        if (nextLine !== undefined) {
                            openParens += (nextLine.match(/\(/g) || []).length;
                            closeParens += (nextLine.match(/\)/g) || []).length;
                        }
                    }

                    index = scanIndex;
                    break;
                }

                if (!foundEle || !fullStatement) {
                    continue;
                }

                const firstParenIndex = fullStatement.indexOf('Ele(') + 3;
                const lastParenIndex = fullStatement.lastIndexOf(')');
                if (firstParenIndex === -1 || lastParenIndex === -1 || lastParenIndex <= firstParenIndex) {
                    continue;
                }

                const argsStr = fullStatement.substring(firstParenIndex + 1, lastParenIndex);
                const eleVar = this.parseEleVariable(variableName, argsStr, defLineNumber, fullStatement);
                if (eleVar?.desc) {
                    eleVariables.push(eleVar);
                }
            }

            if (currentClass && eleVariables.length > 0) {
                results.push({
                    filePath,
                    className: currentClass.name,
                    classLine: currentClass.line,
                    baseClasses: currentClass.bases,
                    eleVariables
                });
            }

            return results;
        } catch {
            return [];
        }
    }

    private parseEleVariable(name: string, argsStr: string, line: number, fullLine: string): EleVariable | null {
        const eleVar: EleVariable = {
            name,
            value: fullLine.trim(),
            line,
            arguments: [],
            desc: '',
            hierarchy: []
        };

        const descMatch = argsStr.match(/desc\s*=\s*["']([^"']+)["']/);
        if (descMatch?.[1]) {
            eleVar.desc = descMatch[1];
            eleVar.hierarchy = eleVar.desc.includes(' -> ')
                ? eleVar.desc.split(' -> ')
                : [eleVar.desc];
        }

        return eleVar.desc ? eleVar : null;
    }

    private parseMethodFile(filePath: string): MethodResult | null {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split(/\r?\n/);
            const methods: MethodInfo[] = [];
            const methodDefRegex = /^(\s*)def\s+([a-zA-Z][a-zA-Z0-9_]*)\s*\([^)]*\)\s*(?:->\s*[^:]+)?\s*:/;

            for (let index = 0; index < lines.length; index++) {
                const line = lines[index];
                if (line === undefined) {
                    continue;
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
                    doc
                });
            }

            return methods.length > 0
                ? {
                    filePath,
                    methods
                }
                : null;
        } catch {
            return null;
        }
    }

    private scanDirectory(): string[] {
        const pythonFiles: string[] = [];
        const methodDir = path.join(this.rootDir, 'method');
        if (!fs.existsSync(methodDir)) {
            return pythonFiles;
        }

        const walkDir = (dir: string): void => {
            const items = fs.readdirSync(dir, { withFileTypes: true });

            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory()) {
                    walkDir(fullPath);
                } else if (item.name.endsWith('.py')) {
                    pythonFiles.push(fullPath);
                }
            }
        };

        walkDir(methodDir);
        return pythonFiles;
    }

    public async parseAllFiles(): Promise<ParseResult> {
        this.packageNames = {};
        this.scanPackages();

        const pythonFiles = this.scanDirectory();
        const eleResults: FileResult[] = [];
        const methodResults: MethodResult[] = [];

        for (const filePath of pythonFiles) {
            eleResults.push(...this.parseFile(filePath));

            const fileName = path.basename(filePath).toLowerCase();
            if (!fileName.endsWith('ele.py') && !fileName.endsWith('_ele.py')) {
                const methodResult = this.parseMethodFile(filePath);
                if (methodResult) {
                    methodResults.push(methodResult);
                }
            }
        }

        return {
            results: eleResults,
            packageNames: this.packageNames,
            methodResults
        };
    }
}
