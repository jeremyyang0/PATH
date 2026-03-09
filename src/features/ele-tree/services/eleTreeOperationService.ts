import * as vscode from 'vscode';
import { addMethodToFile, getAtomicFilePath } from '../../../shared/python/fileOperations';
import { generateMethodCode } from '../../../shared/python/codegenUtils';
import { TreeItem } from '../../../shared/tree/treeItem';

export async function addOperationToAtomicFile(
    element: TreeItem,
    operationType: 'click' | 'double_click'
): Promise<void> {
    if (!element.eleFilePath || !element.eleVariableName) {
        vscode.window.showErrorMessage('无法获取元素文件或变量名。');
        return;
    }

    try {
        const atomicFilePath = getAtomicFilePath(element.eleFilePath);
        if (!atomicFilePath) {
            vscode.window.showErrorMessage('没有找到对应的原子方法文件。');
            return;
        }

        // 方法名和方法体统一由共享代码生成器产出，避免多个入口生成不一致的模板。
        const eleDesc = typeof element.label === 'string'
            ? element.label
            : (element.label?.label || element.eleVariableName || 'unknown');
        const { methodName, methodCode } = generateMethodCode(element.eleVariableName, operationType, eleDesc);
        const result = await addMethodToFile(atomicFilePath, methodCode, element.eleFilePath, methodName);
        const document = await vscode.workspace.openTextDocument(atomicFilePath);
        const editor = await vscode.window.showTextDocument(document);

        let jumpTo = 0;
        if (result.existed) {
            vscode.window.showInformationMessage(`方法 ${methodName} 已存在，已为你定位到该方法。`);
            jumpTo = result.position || 0;
        } else {
            const operationLabel = operationType === 'click' ? '点击' : '双击';
            vscode.window.showInformationMessage(`已为 ${eleDesc} 生成${operationLabel}操作。`);
            const methodIndex = document.getText().indexOf(`def ${methodName}`);
            if (methodIndex !== -1) {
                jumpTo = methodIndex;
            }
        }

        const position = document.positionAt(jumpTo);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`生成原子方法失败: ${message}`);
    }
}
