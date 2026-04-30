import * as vscode from 'vscode';

export type WorkspaceTreeNodeType = 'folder' | 'file';

/**
 * PATH 文件树节点只表达工作区文件树结构，不再承担元素树或方法树的附加语义。
 */
export class WorkspaceTreeNode extends vscode.TreeItem {
    public fullPath = '';
    public isLeaf = false;
    public nodeType: WorkspaceTreeNodeType = 'folder';
    public filePath?: string;
    public entryName?: string;

    public constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState, command?: vscode.Command) {
        super(label, collapsibleState);
        if (command) {
            this.command = command;
        }
        this.contextValue = 'pathFileTreeItem';
    }
}
