import * as vscode from 'vscode';

export type MethodTreeNodeType = 'folder' | 'method';

/**
 * 方法树节点保留方法树专属字段，避免和元素树、文件树共用弱类型 metadata。
 */
export class MethodTreeNode extends vscode.TreeItem {
    public fullPath = '';
    public codePath = '';
    public isLeaf = false;
    public nodeType: MethodTreeNodeType = 'folder';
    public children?: MethodTreeNode[];
    public filePath?: string;
    public entryName?: string;
    public methodName?: string;
    public methodLine?: number;
    public methodDoc?: string;
    public methodFilePath?: string;

    public constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState, command?: vscode.Command) {
        super(label, collapsibleState);
        if (command) {
            this.command = command;
        }
        this.contextValue = 'methodTreeItem';
    }
}
