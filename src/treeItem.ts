import * as vscode from 'vscode';

export type TreeNodeType = 'folder' | 'file' | 'method' | 'element';

/**
 * Tree item model shared by the custom views in this extension.
 */
export class TreeItem extends vscode.TreeItem {
    public fullPath: string = '';
    public codePath: string = '';
    public isLeaf: boolean = false;
    public nodeType: TreeNodeType = 'folder';
    public filePath?: string | '';
    public entryName?: string | '';
    public children?: TreeItem[];
    public eleFilePath?: string | '';
    public eleVariableName?: string | '';
    public eleLineNumber?: number | '';
    public methodName?: string | '';
    public methodLine?: number | '';
    public methodDoc?: string | '';
    public methodFilePath?: string | '';

    constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState, command?: vscode.Command) {
        super(label, collapsibleState);
        if (command) {
            this.command = command;
        }
        this.contextValue = 'eleTreeItem';
    }
}

export interface TreeNode {
    item: TreeItem;
    children: { [key: string]: TreeNode };
}
