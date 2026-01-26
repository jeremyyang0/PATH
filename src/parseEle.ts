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

                    // 检查 @property 装饰器
                    // 新格式: @property + def name(self): + return Ele(...)
                    const propertyDecoratorRegex = /^\s+@property\s*$/;
                    const propertyMatch = line.match(propertyDecoratorRegex);

                    if (propertyMatch && currentClass) {
                        // 检查下一行是否为 def name(self):
                        const nextLineIdx = i + 1;
                        if (nextLineIdx < lines.length) {
                            const defLine = lines[nextLineIdx];
                            if (defLine === undefined) continue;

                            const defRegex = /^\s+def\s+(\w+)\s*\(\s*self\s*\)\s*:/;
                            const defMatch = defLine.match(defRegex);

                            if (defMatch && defMatch[1]) {
                                const varName = defMatch[1];
                                const defLineNumber = nextLineIdx + 1;

                                // 查找方法体中的 return Ele(...) 语句
                                let foundEle = false;
                                let fullStatement = '';
                                let eleStartLineIdx = -1;

                                for (let j = nextLineIdx + 1; j < lines.length; j++) {
                                    const methodLine = lines[j];
                                    if (methodLine === undefined) break;

                                    const methodIndent = methodLine.search(/\S/);
                                    // 如果遇到同级或更低缩进的非空行，说明方法结束
                                    if (methodIndent !== -1 && methodIndent <= defLine.search(/\S/) && methodLine.trim() !== '') {
                                        break;
                                    }

                                    // 匹配 return Ele(
                                    const returnEleRegex = /^\s+return\s+Ele\s*\(/;
                                    if (methodLine.match(returnEleRegex)) {
                                        foundEle = true;
                                        fullStatement = methodLine;
                                        eleStartLineIdx = j;

                                        // 检查括号是否平衡
                                        let openParens = (fullStatement.match(/\(/g) || []).length;
                                        let closeParens = (fullStatement.match(/\)/g) || []).length;

                                        // 如果括号不平衡，继续读取后续行
                                        while (openParens > closeParens && j < lines.length - 1) {
                                            j++;
                                            const nextLine = lines[j];
                                            fullStatement += '\n' + nextLine;

                                            if (nextLine !== undefined) {
                                                openParens += (nextLine.match(/\(/g) || []).length;
                                                closeParens += (nextLine.match(/\)/g) || []).length;
                                            }
                                        }

                                        // 更新主循环索引以跳过已处理的行
                                        i = j;
                                        break;
                                    }
                                }

                                if (foundEle && fullStatement) {
                                    // 提取 Ele(...) 中的参数
                                    const firstParenIndex = fullStatement.indexOf('Ele(') + 3;
                                    const lastParenIndex = fullStatement.lastIndexOf(')');

                                    if (firstParenIndex !== -1 && lastParenIndex !== -1 && lastParenIndex > firstParenIndex) {
                                        const argsStr = fullStatement.substring(firstParenIndex + 1, lastParenIndex);

                                        // 使用现有逻辑解析参数
                                        const eleVar = this.parseEleVariable(varName, argsStr, defLineNumber, fullStatement);
                                        if (eleVar && eleVar.desc) {
                                            eleVariables.push(eleVar);
                                        }
                                    }
                                }
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

            // 跳过以 ele.py 结尾的文件，不解析其方法
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
            package_names: this.packageNames,
            method_results: methodResults
        };
    }
}
