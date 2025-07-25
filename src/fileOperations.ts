import * as path from 'path';
import { toPascalCase, generateImportPath } from './utils';

/**
 * 获取原子方法文件路径
 */
export function getAtomicFilePath(eleFilePath: string): string | null {
    if (eleFilePath.endsWith('_ele.py')) {
        return eleFilePath.replace('_ele.py', '.py');
    }
    return null;
}

/**
 * 获取Ele类名
 */
export function getEleClassName(eleFilePath: string): string | null {
    const fileName = path.basename(eleFilePath, '.py');
    if (fileName.endsWith('_ele')) {
        const baseName = fileName.replace('_ele', '');
        return toPascalCase(baseName) + 'Ele';
    }
    return null;
}

/**
 * 生成Base类名
 */
export function generateBaseClassName(atomicFilePath: string): string {
    const fileName = path.basename(atomicFilePath, '.py');
    const pascalCase = toPascalCase(fileName);
    return `_Base${pascalCase}Method`;
}

/**
 * 添加方法到文件
 * 如果方法已存在，则不插入新方法，直接返回 { existed: true, position: number }
 * 否则正常添加并返回 { existed: false }
 */
export async function addMethodToFile(filePath: string, methodCode: string, eleFilePath: string, methodName: string): Promise<{ existed: boolean, position?: number }> {
    try {
        const fs = require('fs').promises;
        let fileContent = '';
        let fileExists = false;
        try {
            fileContent = await fs.readFile(filePath, 'utf8');
            fileExists = true;
        } catch (error) {
            const eleClassName = getEleClassName(eleFilePath);
            if (!eleClassName) {
                throw new Error('无法获取Ele类名');
            }
            const baseClassName = generateBaseClassName(filePath);
            const importPath = generateImportPath(eleFilePath);
            fileContent = `from ${importPath} import ${eleClassName}

class ${baseClassName}(${eleClassName}):
    """基础${path.basename(filePath, '.py')}方法"""
`;
        }
        // 检查方法是否已存在
        if (methodName) {
            const methodPattern = new RegExp(`def\\s+${methodName}\\s*\\(`);
            const match = methodPattern.exec(fileContent);
            if (match) {
                // 方法已存在，绝不插入新方法
                return { existed: true, position: match.index };
            }
        }
        // 只在方法不存在时插入
        const lines = fileContent.split('\n');
        let insertIndex = lines.length;
        if (fileExists) {
            let baseClassFound = false;
            let indentLevel = 0;
            const baseClassName = generateBaseClassName(filePath);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line && line.trim().startsWith(`class ${baseClassName}(`) && line.trim().endsWith(':')) {
                    baseClassFound = true;
                    indentLevel = line.length - line.trimStart().length;
                    continue;
                }
                if (baseClassFound && line) {
                    const currentIndent = line.length - line.trimStart().length;
                    if ((line.trim().startsWith('class ') && currentIndent <= indentLevel) || i === lines.length - 1) {
                        // 如果找到下一个class，需要检查是否有装饰器，从装饰器开始排除
                        let classStartIndex = i;
                        if (line.trim().startsWith('class ') && i > 0) {
                            // 向前查找可能的装饰器
                            for (let j = i - 1; j >= 0; j--) {
                                const prevLine = lines[j];
                                if (!prevLine || prevLine.trim() === '') {
                                    // 空行，继续向前查找
                                    continue;
                                } else if (prevLine.trim().startsWith('@')) {
                                    // 找到装饰器，继续向前查找更多装饰器
                                    classStartIndex = j;
                                } else {
                                    // 既不是空行也不是装饰器，停止查找
                                    break;
                                }
                            }
                        }
                        insertIndex = line.trim().startsWith('class ') ? classStartIndex : i + 1;
                        break;
                    }
                }
            }
        }
        lines.splice(insertIndex, 0, methodCode);
        await fs.writeFile(filePath, lines.join('\n'), 'utf8');
        return { existed: false };
    } catch (error) {
        throw new Error(`写入文件失败: ${error}`);
    }
} 