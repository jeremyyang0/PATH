import * as fs from 'fs';
import * as path from 'path';

/**
 * 解析结果接口
 */
export interface ParseResult {
    results: FileResult[];
    package_names: { [key: string]: string };
    method_results: MethodResult[];
}

/**
 * 文件解析结果接口
 */
export interface FileResult {
    file_path: string;
    class_name: string;
    class_line: number;
    base_classes: string[];
    ele_variables: EleVariable[];
}

/**
 * Ele变量接口
 */
export interface EleVariable {
    name: string;
    value: string;
    line: number;
    arguments: string[];
    desc: string;
    hierarchy: string[];
}

/**
 * 方法解析结果接口
 */
export interface MethodResult {
    file_path: string;
    methods: MethodInfo[];
}

/**
 * 方法信息接口
 */
export interface MethodInfo {
    name: string;
    line: number;
    doc: string;
}

/**
 * Ele 解析器类
 * 使用正则表达式解析 Python 文件，提取 Ele 变量和方法信息
 */
export class EleParser {
    private rootDir: string;
    private packageNames: { [key: string]: string } = {};

    constructor(rootDir: string) {
        this.rootDir = rootDir;
    }

    /**
     * 检查字符串是否包含中文字符
     */
    private containsChinese(str: string): boolean {
        return /[\u4e00-\u9fff]/.test(str);
    }

    /**
     * 从 __init__.py 文件中提取包的中文名称
     */
    private extractPackageName(initFilePath: string): string | null {
        try {
            const content = fs.readFileSync(initFilePath, 'utf-8');
            const lines = content.split('\n');

            // 正则匹配类定义
            const classDefRegex = /^class\s+(\w+)(?:\s*\([^)]*\))?\s*:/;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (!line) continue;

                const classMatch = line.match(classDefRegex);

                if (classMatch) {
                    const className = classMatch[1];
                    if (!className) continue;

                    // 如果类名包含中文，直接使用
                    if (this.containsChinese(className)) {
                        return className;
                    }

                    // 查找类的文档字符串（紧跟在类定义后的三引号字符串）
                    const nextLine = lines[i + 1];
                    if (nextLine) {
                        const docMatch = nextLine.match(/^\s*['\"]{3}([^'\"]+)['\"]{3}/);
                        if (docMatch && docMatch[1] && this.containsChinese(docMatch[1])) {
                            return docMatch[1].trim();
                        }
                    }

                    // 查找类中的属性赋值（name, desc 等）
                    for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
                        const attrLine = lines[j];
                        if (!attrLine) continue;

                        // 检查是否离开了类定义
                        if (attrLine.match(/^class\s+/) || (attrLine.match(/^\S/) && !attrLine.match(/^\s*#/))) {
                            break;
                        }

                        const attrMatch = attrLine.match(/^\s*(name|display_name|title|chinese_name|desc|description)\s*=\s*['\"](.*)['\"]/);
                        if (attrMatch && attrMatch[2] && this.containsChinese(attrMatch[2])) {
                            return attrMatch[2];
                        }
                    }
                }
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * 扫描所有包并提取中文名称
     */
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
                    // 检查目录中是否有 __init__.py
                    const initFile = path.join(fullPath, '__init__.py');
                    if (fs.existsSync(initFile)) {
                        // 获取相对于 method 目录的路径
                        const relPath = path.relative(methodDir, fullPath);

                        // 构建包名
                        let packageName = relPath.replace(/[\\/]/g, '.');
                        if (packageName === '.') {
                            packageName = 'method';
                        } else {
                            packageName = 'method.' + packageName;
                        }

                        // 提取中文名称
                        const chineseName = this.extractPackageName(initFile);
                        if (chineseName) {
                            this.packageNames[packageName] = chineseName;
                            // 也为目录名存储映射
                            const dirName = path.basename(fullPath);
                            if (dirName) {
                                this.packageNames[dirName] = chineseName;
                            }
                        }
                    }

                    // 递归扫描子目录
                    walkDir(fullPath);
                }
            }
        };

        walkDir(methodDir);
    }

    /**
     * 解析单个 Python 文件，提取 Ele 类和变量
     */
    private parseFile(filePath: string): FileResult[] {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');
            const results: FileResult[] = [];

            // 正则匹配以 Ele 结尾的类定义
            const classDefRegex = /^class\s+(\w*Ele)\s*(?:\(([^)]*)\))?\s*:/;
            // 正则匹配 Ele 变量赋值
            const eleVarRegex = /^\s+(\w+)\s*=\s*Ele\s*\((.+)\)\s*$/;

            let currentClass: { name: string; line: number; bases: string[] } | null = null;
            let classIndent = 0;
            let eleVariables: EleVariable[] = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line === undefined) continue;

                const lineNumber = i + 1;

                // 检查类定义
                const classMatch = line.match(classDefRegex);
                if (classMatch && classMatch[1]) {
                    // 如果之前有类，保存它
                    if (currentClass && eleVariables.length > 0) {
                        results.push({
                            file_path: filePath,
                            class_name: currentClass.name,
                            class_line: currentClass.line,
                            base_classes: currentClass.bases,
                            ele_variables: eleVariables
                        });
                    }

                    currentClass = {
                        name: classMatch[1],
                        line: lineNumber,
                        bases: classMatch[2] ? classMatch[2].split(',').map(b => b.trim()) : []
                    };
                    classIndent = line.search(/\S/);
                    eleVariables = [];
                    continue;
                }

                // 如果在类内部，检查 Ele 变量
                if (currentClass) {
                    const currentIndent = line.search(/\S/);

                    // 如果遇到同级或更低缩进的非空非注释行，说明类定义结束
                    if (currentIndent !== -1 && currentIndent <= classIndent && !line.match(/^\s*#/) && line.trim() !== '') {
                        if (eleVariables.length > 0) {
                            results.push({
                                file_path: filePath,
                                class_name: currentClass.name,
                                class_line: currentClass.line,
                                base_classes: currentClass.bases,
                                ele_variables: eleVariables
                            });
                        }
                        currentClass = null;
                        eleVariables = [];
                    }

                    // Check Ele variable definition
                    // Supports both single-line and multi-line definitions
                    // Match "name = Ele(" start
                    const eleStartRegex = /^\s+(\w+)\s*=\s*Ele\s*\(/;
                    const eleStartMatch = line.match(eleStartRegex);

                    if (eleStartMatch && eleStartMatch[1] && currentClass) {
                        const varName = eleStartMatch[1];
                        let fullStatement = line;
                        let currentLineIdx = i;

                        // Check if parentheses are balanced
                        let openParens = (fullStatement.match(/\(/g) || []).length;
                        let closeParens = (fullStatement.match(/\)/g) || []).length;

                        // If not balanced, read subsequent lines
                        while (openParens > closeParens && currentLineIdx < lines.length - 1) {
                            currentLineIdx++;
                            const nextLine = lines[currentLineIdx];
                            fullStatement += '\n' + nextLine;

                            if (nextLine !== undefined) {
                                openParens += (nextLine.match(/\(/g) || []).length;
                                closeParens += (nextLine.match(/\)/g) || []).length;
                            }
                        }

                        // Advance the main loop index to skip processed lines
                        i = currentLineIdx;

                        // Extract arguments content from "Ele(...)"
                        // Match the first "Ele(" and the last ")"
                        const firstParenIndex = fullStatement.indexOf('Ele(') + 3; // Index of '(', which is Ele( index + 3
                        const lastParenIndex = fullStatement.lastIndexOf(')');

                        if (firstParenIndex !== -1 && lastParenIndex !== -1 && lastParenIndex > firstParenIndex) {
                            const argsStr = fullStatement.substring(firstParenIndex + 1, lastParenIndex);

                            // Parse arguments using existing logic
                            const eleVar = this.parseEleVariable(varName, argsStr, lineNumber, fullStatement);
                            if (eleVar && eleVar.desc) {
                                eleVariables.push(eleVar);
                            }
                        }
                    }
                }
            }

            // 处理最后一个类
            if (currentClass && eleVariables.length > 0) {
                results.push({
                    file_path: filePath,
                    class_name: currentClass.name,
                    class_line: currentClass.line,
                    base_classes: currentClass.bases,
                    ele_variables: eleVariables
                });
            }

            return results;
        } catch (error) {
            return [];
        }
    }

    /**
     * 解析 Ele 变量的参数
     */
    private parseEleVariable(name: string, argsStr: string, line: number, fullLine: string): EleVariable | null {
        const eleVar: EleVariable = {
            name: name,
            value: fullLine.trim(),
            line: line,
            arguments: [],
            desc: '',
            hierarchy: []
        };

        // 解析 desc 参数
        // 匹配 desc="..." 或 desc='...'
        const descMatch = argsStr.match(/desc\s*=\s*[\"']([^\"']+)[\"']/);
        if (descMatch && descMatch[1]) {
            eleVar.desc = descMatch[1];

            // 解析层级结构
            if (eleVar.desc.includes(' -> ')) {
                eleVar.hierarchy = eleVar.desc.split(' -> ');
            } else {
                eleVar.hierarchy = [eleVar.desc];
            }
        }

        // 解析其他参数
        const argParts = this.splitArguments(argsStr);
        eleVar.arguments = argParts;

        return eleVar.desc ? eleVar : null;
    }

    /**
     * 分割函数参数（处理嵌套括号和字符串）
     */
    private splitArguments(argsStr: string): string[] {
        const args: string[] = [];
        let current = '';
        let depth = 0;
        let inString = false;
        let stringChar = '';

        for (let i = 0; i < argsStr.length; i++) {
            const char = argsStr[i];

            if (inString) {
                current += char;
                if (char === stringChar && argsStr[i - 1] !== '\\') {
                    inString = false;
                }
            } else {
                if (char === '"' || char === "'") {
                    inString = true;
                    stringChar = char;
                    current += char;
                } else if (char === '(' || char === '[' || char === '{') {
                    depth++;
                    current += char;
                } else if (char === ')' || char === ']' || char === '}') {
                    depth--;
                    current += char;
                } else if (char === ',' && depth === 0) {
                    if (current.trim()) {
                        args.push(current.trim());
                    }
                    current = '';
                } else {
                    current += char;
                }
            }
        }

        if (current.trim()) {
            args.push(current.trim());
        }

        return args;
    }

    /**
     * 解析 Python 文件中的方法
     */
    private parseMethodFile(filePath: string): MethodResult | null {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');
            const methods: MethodInfo[] = [];

            // 正则匹配方法定义（不以 _ 开头）
            const methodDefRegex = /^(\s*)def\s+([a-zA-Z][a-zA-Z0-9_]*)\s*\([^)]*\)\s*(?:->\s*[^:]+)?\s*:/;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line === undefined) continue;

                const lineNumber = i + 1;

                const methodMatch = line.match(methodDefRegex);
                if (methodMatch && methodMatch[2]) {
                    const methodName = methodMatch[2];

                    // 跳过以 _ 开头的私有方法
                    if (methodName.startsWith('_')) {
                        continue;
                    }

                    // 查找文档字符串
                    let doc = methodName;
                    const nextLine = lines[i + 1];
                    if (nextLine) {
                        const docMatch = nextLine.match(/^\s*['\"]{3}([^'\"]*)['\"]{3}/);
                        if (docMatch && docMatch[1] !== undefined) {
                            doc = docMatch[1].trim() || methodName;
                        } else {
                            // 检查多行文档字符串
                            const docStartMatch = nextLine.match(/^\s*['\"]{3}(.*)$/);
                            if (docStartMatch) {
                                let docContent = docStartMatch[1] || '';
                                for (let j = i + 2; j < lines.length; j++) {
                                    const docLine = lines[j];
                                    if (docLine === undefined) break;

                                    const docEndMatch = docLine.match(/^(.*)['\"]{3}/);
                                    if (docEndMatch) {
                                        docContent += ' ' + (docEndMatch[1] || '');
                                        break;
                                    } else {
                                        docContent += ' ' + docLine.trim();
                                    }
                                }
                                doc = docContent.trim() || methodName;
                            }
                        }
                    }

                    methods.push({
                        name: methodName,
                        line: lineNumber,
                        doc: doc
                    });
                }
            }

            if (methods.length > 0) {
                return {
                    file_path: filePath,
                    methods: methods
                };
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * 扫描目录中的所有 Python 文件
     */
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

    /**
     * 解析所有 Python 文件
     */
    public async parseAllFiles(): Promise<ParseResult> {
        // 先扫描所有包的中文名称
        this.scanPackages();

        const pythonFiles = this.scanDirectory();
        const eleResults: FileResult[] = [];
        const methodResults: MethodResult[] = [];

        for (const filePath of pythonFiles) {
            const fileResults = this.parseFile(filePath);
            eleResults.push(...fileResults);

            const methodResult = this.parseMethodFile(filePath);
            if (methodResult) {
                methodResults.push(methodResult);
            }
        }

        return {
            results: eleResults,
            package_names: this.packageNames,
            method_results: methodResults
        };
    }
}
