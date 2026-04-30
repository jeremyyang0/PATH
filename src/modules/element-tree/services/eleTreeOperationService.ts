import * as vscode from 'vscode';
import {
    generateOperationForElement,
    getOperationDisplayName,
    revealGeneratedMethod
} from '../../../shared/python/eleOperationService';
import { ElementTreeNode as TreeItem } from '../models/elementTreeNode';

export async function addOperationToAtomicFile(
    element: TreeItem,
    operationType: 'click' | 'double_click'
): Promise<void> {
    if (!element.eleFilePath || !element.eleVariableName) {
        vscode.window.showErrorMessage('无法获取元素文件或变量名。');
        return;
    }

    try {
        const eleDesc = typeof element.label === 'string'
            ? element.label
            : (element.label?.label || element.eleVariableName || 'unknown');
        const result = await generateOperationForElement({
            eleFilePath: element.eleFilePath,
            eleVariableName: element.eleVariableName,
            eleLineNumber: element.eleLineNumber,
            label: eleDesc
        }, operationType);
        await revealGeneratedMethod(result);

        if (result.existed) {
            vscode.window.showInformationMessage(`方法 ${result.methodName} 已存在，已为你定位到该方法。`);
        } else {
            vscode.window.showInformationMessage(`已为 ${eleDesc} 生成${getOperationDisplayName(operationType)}操作。`);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`生成原子方法失败: ${message}`);
    }
}
