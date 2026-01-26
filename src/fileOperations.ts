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
        console.log('addMethodToFile called:', { filePath, eleFilePath, methodName });
        try {
            fileContent = await fs.readFile(filePath, 'utf8');
            fileExists = true;
            console.log('File exists, read content length:', fileContent.length);
        } catch (error) {
            console.log('File does not exist, creating new file...');
            const eleClassName = getEleClassName(eleFilePath);
            console.log('eleClassName:', eleClassName);
            if (!eleClassName) {
                throw new Error('无法获取Ele类名');
            }
            const baseClassName = generateBaseClassName(filePath);
            const importPath = generateImportPath(eleFilePath);
            const realClassName = baseClassName.replace('_Base', '');
            console.log('baseClassName:', baseClassName, 'importPath:', importPath);
            fileContent = `from ${importPath} import ${eleClassName}\r
from richlogger import auto_logger
\r
class ${baseClassName}(${eleClassName}):\r
    """${toPascalCase(path.basename(filePath, '.py'))}原子方法"""\r
\r
@auto_logger
class ${realClassName}(${baseClassName}):\r
    """${toPascalCase(path.basename(filePath, '.py'))}组合方法"""\r
`;
            console.log('Generated initial file content:', fileContent);
        }
        // 检查方法是否已存在
        if (methodName) {
            const methodPattern = new RegExp(`def\\s+${methodName}\\s*\\(`);
            const match = methodPattern.exec(fileContent);
            if (match) {
                // 方法已存在，不插入新方法
                return { existed: true, position: match.index };
            }
        }
        // 只在方法不存在时插入
        const lines = fileContent.split('\n');
        let insertIndex = lines.length;
        // 查找 _BaseXxxMethod 类的结束位置（下一个 class 或 @装饰器之前）
        let baseClassFound = false;
        let indentLevel = 0;
        const baseClassName = generateBaseClassName(filePath);
        console.log('Looking for baseClassName:', baseClassName);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line && line.trim().startsWith(`class ${baseClassName}(`) && line.trim().endsWith(':')) {
                baseClassFound = true;
                indentLevel = line.length - line.trimStart().length;
                console.log('Found baseClass at line:', i, 'indentLevel:', indentLevel);
                continue;
            }
            if (baseClassFound && line) {
                const currentIndent = line.length - line.trimStart().length;
                // 如果找到下一个class或装饰器，需要在它之前插入
                if ((line.trim().startsWith('class ') && currentIndent <= indentLevel) ||
                    (line.trim().startsWith('@') && currentIndent <= indentLevel)) {
                    // 如果找到装饰器或class，向前查找跳过空行
                    let classStartIndex = i;
                    for (let j = i - 1; j >= 0; j--) {
                        const prevLine = lines[j];
                        if (!prevLine || prevLine.trim() === '') {
                            classStartIndex = j;
                        } else if (prevLine.trim().startsWith('@')) {
                            classStartIndex = j;
                        } else {
                            break;
                        }
                    }
                    insertIndex = classStartIndex;
                    console.log('Insert before next class/decorator at line:', insertIndex);
                    break;
                } else if (i === lines.length - 1) {
                    insertIndex = i + 1;
                    console.log('Insert at end of file, line:', insertIndex);
                    break;
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