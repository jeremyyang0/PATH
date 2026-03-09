import * as vscode from 'vscode';
import { insertTextAtCursor, openFileAtLine } from '../../../shared/editor/editorActions';
import { TreeItem } from '../../../shared/tree/treeItem';

export async function dragMethodToEditor(element: TreeItem): Promise<void> {
    if (element.isLeaf && element.codePath) {
        await insertTextAtCursor(element.codePath);
        return;
    }

    vscode.window.showInformationMessage('只能拖拽方法节点到编辑器。');
}

export async function openMethodFile(
    filePath: string,
    lineNumber: number,
    revealFileInPathTree: (filePath: string) => Promise<void>
): Promise<void> {
    await openFileAtLine(filePath, lineNumber);
    await revealFileInPathTree(filePath);
}

export async function jumpToMethod(
    element: TreeItem,
    revealFileInPathTree: (filePath: string) => Promise<void>
): Promise<void> {
    if (!element.methodFilePath || !element.methodLine) {
        vscode.window.showInformationMessage('无法获取方法定义位置。');
        return;
    }

    // 跳转方法时同时联动 PATH 文件树，保证用户能看到当前文件所在位置。
    await openFileAtLine(element.methodFilePath, element.methodLine);
    await revealFileInPathTree(element.methodFilePath);
}
