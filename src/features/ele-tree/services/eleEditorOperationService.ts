import * as vscode from 'vscode';
import {
    generateOperationForElement,
    generateOperationsForElements,
    getOperationDisplayName,
    revealGeneratedMethod
} from '../../../shared/python/eleOperationService';
import {
    findElePropertyAtLine,
    isEleDefinitionFile,
    ParsedEleProperty,
    parseEleProperties
} from '../../../shared/python/elePropertyParser';

/**
 * 基于活动编辑器或传入 URI 获取 `_ele.py` 文档。
 */
async function resolveEleDocument(uri?: vscode.Uri): Promise<vscode.TextDocument | undefined> {
    if (uri?.scheme === 'file') {
        const document = await vscode.workspace.openTextDocument(uri);
        return isEleDefinitionFile(document.uri.fsPath) ? document : undefined;
    }

    const activeDocument = vscode.window.activeTextEditor?.document;
    if (activeDocument && activeDocument.uri.scheme === 'file' && isEleDefinitionFile(activeDocument.uri.fsPath)) {
        return activeDocument;
    }

    return undefined;
}

/**
 * 重新解析当前文档，并优先按行号回定位到最新的属性定义，避免 CodeLens 参数过期。
 */
function resolvePropertyFromDocument(document: vscode.TextDocument, hint?: ParsedEleProperty): ParsedEleProperty | undefined {
    const properties = parseEleProperties(document.getText(), document.uri.fsPath);
    if (!hint) {
        const activeLine = vscode.window.activeTextEditor?.selection.active.line ?? -1;
        return findElePropertyAtLine(properties, activeLine + 1);
    }

    return properties.find(property => {
        if (hint.eleLineNumber && property.eleLineNumber === hint.eleLineNumber) {
            return true;
        }
        return property.eleVariableName === hint.eleVariableName && property.propertyLine === hint.propertyLine;
    }) || findElePropertyAtLine(properties, hint.propertyLine);
}

/**
 * 为当前属性生成点击或双击方法。
 */
export async function generateOperationForEleProperty(
    operationType: 'click' | 'double_click',
    hint?: ParsedEleProperty
): Promise<void> {
    const document = await resolveEleDocument(hint ? vscode.Uri.file(hint.eleFilePath) : undefined);
    if (!document) {
        vscode.window.showWarningMessage('请先打开 `_ele.py` 元素定义文件。');
        return;
    }

    const property = resolvePropertyFromDocument(document, hint);
    if (!property) {
        vscode.window.showWarningMessage('当前属性无法识别为可生成方法的元素定义。');
        return;
    }

    try {
        const result = await generateOperationForElement(property, operationType);
        await revealGeneratedMethod(result);

        if (result.existed) {
            vscode.window.showInformationMessage(`方法 ${result.methodName} 已存在，已为你定位到该方法。`);
            return;
        }

        vscode.window.showInformationMessage(`已为 ${property.desc} 生成${getOperationDisplayName(operationType)}操作。`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`生成方法失败: ${message}`);
    }
}

/**
 * 为当前 `_ele.py` 文件中的全部属性批量生成点击方法。
 */
export async function generateClickMethodsForEleFile(uri?: vscode.Uri): Promise<void> {
    const document = await resolveEleDocument(uri);
    if (!document) {
        vscode.window.showWarningMessage('请先打开 `_ele.py` 元素定义文件。');
        return;
    }

    const properties = parseEleProperties(document.getText(), document.uri.fsPath);
    if (properties.length === 0) {
        vscode.window.showWarningMessage('当前文件没有找到可生成点击方法的元素。');
        return;
    }

    const result = await generateOperationsForElements(properties, ['click']);
    const lastResult = result.results[result.results.length - 1];
    if (lastResult) {
        await revealGeneratedMethod(lastResult);
    }

    let message = `批量生成完成: ${result.successCount} 个${getOperationDisplayName('click')}方法已生成`;
    if (result.skipCount > 0) {
        message += `, ${result.skipCount} 个已存在`;
    }
    if (result.errorCount > 0) {
        message += `, ${result.errorCount} 个失败`;
    }

    vscode.window.showInformationMessage(message);
}
