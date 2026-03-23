import * as vscode from 'vscode';
import { generateMethodCode } from './codegenUtils';
import { addMethodToFile, getAtomicFilePath } from './fileOperations';
import { EleOperationTarget } from './elePropertyParser';

export type EleOperationType = 'click' | 'double_click';

export interface GenerateOperationResult {
    target: EleOperationTarget;
    operationType: EleOperationType;
    atomicFilePath: string;
    methodName: string;
    existed: boolean;
    position?: number;
}

export interface BatchGenerateOperationResult {
    successCount: number;
    skipCount: number;
    errorCount: number;
    results: GenerateOperationResult[];
}

/**
 * 为单个元素生成点击/双击方法，统一树视图与编辑器入口的落盘行为。
 */
export async function generateOperationForElement(
    target: EleOperationTarget,
    operationType: EleOperationType
): Promise<GenerateOperationResult> {
    if (!target.eleFilePath || !target.eleVariableName) {
        throw new Error('无法获取元素文件或变量名。');
    }

    const atomicFilePath = getAtomicFilePath(target.eleFilePath);
    if (!atomicFilePath) {
        throw new Error('没有找到对应的原子方法文件。');
    }

    const eleDesc = target.label || target.eleVariableName || 'unknown';
    const { methodName, methodCode } = generateMethodCode(target.eleVariableName, operationType, eleDesc);
    const result = await addMethodToFile(atomicFilePath, methodCode, target.eleFilePath, methodName);

    return {
        target,
        operationType,
        atomicFilePath,
        methodName,
        existed: result.existed,
        position: result.position
    };
}

/**
 * 批量生成多个元素的方法，并汇总成功、跳过、失败数量。
 */
export async function generateOperationsForElements(
    targets: EleOperationTarget[],
    operationTypes: EleOperationType[]
): Promise<BatchGenerateOperationResult> {
    const results: GenerateOperationResult[] = [];
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const target of targets) {
        for (const operationType of operationTypes) {
            try {
                const result = await generateOperationForElement(target, operationType);
                results.push(result);
                if (result.existed) {
                    skipCount++;
                } else {
                    successCount++;
                }
            } catch (error) {
                console.error('Failed to generate operation:', error);
                errorCount++;
            }
        }
    }

    return {
        successCount,
        skipCount,
        errorCount,
        results
    };
}

/**
 * 打开目标方法文件，并尽量定位到生成或已存在的方法定义。
 */
export async function revealGeneratedMethod(result: GenerateOperationResult): Promise<void> {
    const document = await vscode.workspace.openTextDocument(result.atomicFilePath);
    const editor = await vscode.window.showTextDocument(document);

    let jumpTo = result.position || 0;
    if (!result.existed) {
        const methodIndex = document.getText().indexOf(`def ${result.methodName}`);
        if (methodIndex !== -1) {
            jumpTo = methodIndex;
        }
    }

    const position = document.positionAt(jumpTo);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position));
}

export function getOperationDisplayName(operationType: EleOperationType): string {
    return operationType === 'click' ? '点击' : '双击';
}
