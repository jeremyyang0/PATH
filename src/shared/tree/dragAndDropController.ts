import * as vscode from 'vscode';
import { CodePathDraggableNode } from './codePathDraggableNode';

/**
 * 拖拽控制器
 */
export class DragAndDropController<T extends CodePathDraggableNode> implements vscode.TreeDragAndDropController<T> {
    public readonly dropMimeTypes = ['text/plain'];
    public readonly dragMimeTypes = ['text/plain'];

    public async handleDrag(
        source: readonly T[],
        dataTransfer: vscode.DataTransfer,
        _token: vscode.CancellationToken
    ): Promise<void> {
        const dragTexts: string[] = [];
        
        for (const item of source) {
            // 只允许拖拽叶子节点（对应Ele类的元素）
            if (item.codePath && item.isLeaf) {
                dragTexts.push(item.codePath);
            }
        }
        const dragText = dragTexts.join('()\n');
        if (dragText.length > 0) {
            dataTransfer.set('text/plain', new vscode.DataTransferItem(dragText));
        }
    }

    public async handleDrop(
        _target: T | undefined,
        _dataTransfer: vscode.DataTransfer,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // 这里可以处理拖拽到树视图的逻辑，暂时不需要
        return;
    }
} 
