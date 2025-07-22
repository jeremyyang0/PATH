import * as vscode from 'vscode';
import { TreeItem } from './treeItem';

/**
 * 拖拽控制器
 */
export class DragAndDropController implements vscode.TreeDragAndDropController<TreeItem> {
    public readonly dropMimeTypes = ['text/plain'];
    public readonly dragMimeTypes = ['text/plain'];

    public async handleDrag(
        source: readonly TreeItem[], 
        dataTransfer: vscode.DataTransfer, 
        token: vscode.CancellationToken
    ): Promise<void> {
        const dragTexts: string[] = [];
        
        for (const item of source) {
            // 只允许拖拽叶子节点（对应Ele类的元素）
            if (item.codePath && item.isLeaf) {
                dragTexts.push(item.codePath);
            }
        }
        
        if (dragTexts.length > 0) {
            dataTransfer.set('text/plain', new vscode.DataTransferItem(dragTexts.join('\n')));
        }
    }

    public async handleDrop(
        target: TreeItem | undefined, 
        dataTransfer: vscode.DataTransfer, 
        token: vscode.CancellationToken
    ): Promise<void> {
        // 这里可以处理拖拽到树视图的逻辑，暂时不需要
        return;
    }
} 