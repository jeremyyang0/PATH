import * as vscode from 'vscode';
import { TreeItem } from './treeItem';
import { getAtomicFilePath, getEleClassName, generateBaseClassName, addMethodToFile } from './fileOperations';
import { generateMethodCode } from './utils';

/**
 * 在当前编辑器的光标位置插入文本，自动继承上一行缩进，并在末尾换行
 */
export async function insertTextAtCursor(text: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('没有打开的编辑器');
        return;
    }

    const position = editor.selection.active;
    const currentLine = editor.document.lineAt(position.line);

    // 获取上一行的缩进（如果上一行存在且不为空）
    let indent = '';
    if (position.line > 0) {
        const prevLine = editor.document.lineAt(position.line - 1);
        const indentMatch = prevLine.text.match(/^\s*/);
        indent = indentMatch ? indentMatch[0] : '';
    }

    // 如果当前行有内容，获取当前行的缩进
    if (currentLine.text.trim().length > 0) {
        const currentIndentMatch = currentLine.text.match(/^\s*/);
        indent = currentIndentMatch ? currentIndentMatch[0] : indent;
    }

    // 构建插入文本：缩进 + 代码 + 换行
    const insertText = `${indent}${text}()\n`;

    // 插入文本
    const success = await editor.edit(editBuilder => {
        // 在当前行开始位置插入
        const insertPosition = new vscode.Position(position.line, 0);
        editBuilder.insert(insertPosition, insertText);
    });

    if (success) {
        // 移动光标到新插入的下一行，保持相同缩进位置
        const newPosition = new vscode.Position(position.line + 1, indent.length);
        editor.selection = new vscode.Selection(newPosition, newPosition);
        editor.revealRange(new vscode.Range(newPosition, newPosition));
    }
}

/**
 * 打开文件并跳转到指定行
 */
export async function openFileAtLine(filePath: string, lineNumber: number): Promise<void> {
    try {
        const document = await vscode.workspace.openTextDocument(filePath);
        const editor = await vscode.window.showTextDocument(document);
        const line = Math.max(0, lineNumber - 1);
        const position = new vscode.Position(line, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`打开文件失败: ${errorMessage}`);
    }
}

/**
 * 在原子方法文件中添加操作
 */
export async function addOperationToAtomicFile(element: TreeItem, operationType: 'click' | 'double_click'): Promise<void> {
    if (!element.eleFilePath || !element.eleVariableName) {
        vscode.window.showErrorMessage('无法获取Ele元素信息');
        return;
    }
    try {
        const atomicFilePath = getAtomicFilePath(element.eleFilePath);
        if (!atomicFilePath) {
            vscode.window.showErrorMessage('找不到对应的原子方法文件');
            return;
        }
        const eleDesc = typeof element.label === 'string' ? element.label : (element.label?.label || element.eleVariableName || 'unknown');

        const { methodName, methodCode } = generateMethodCode(element.eleVariableName, operationType, eleDesc);
        // 调用addMethodToFile，判断是否已存在
        const result = await addMethodToFile(atomicFilePath, methodCode, element.eleFilePath, methodName);
        const document = await vscode.workspace.openTextDocument(atomicFilePath);
        const editor = await vscode.window.showTextDocument(document);
        let jumpTo = 0;
        if (result.existed) {
            vscode.window.showInformationMessage(`方法 ${methodName} 已存在，已跳转到该方法`);
            jumpTo = result.position || 0;
        } else {
            vscode.window.showInformationMessage(`已为 ${element.label} 添加 ${operationType === 'click' ? '点击' : '双击'} 操作`);
            // 查找并跳转到新添加的方法
            const text = document.getText();
            const methodIndex = text.indexOf(`def ${methodName}`);
            if (methodIndex !== -1) {
                jumpTo = methodIndex;
            }
        }
        // 跳转到方法定义
        if (jumpTo >= 0) {
            const position = document.positionAt(jumpTo);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position));
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`添加操作失败: ${errorMessage}`);
    }
} 