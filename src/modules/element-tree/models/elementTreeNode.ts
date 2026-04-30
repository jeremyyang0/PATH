import * as vscode from 'vscode';

export type ElementTreeNodeType = 'folder' | 'element';

/**
 * 元素树节点只承载元素树所需字段，避免再把其他视图元数据塞进同一个 DTO。
 */
export class ElementTreeNode extends vscode.TreeItem {
    public fullPath = '';
    public codePath = '';
    public isLeaf = false;
    public nodeType: ElementTreeNodeType = 'folder';
    public children?: ElementTreeNode[];
    public filePath?: string;
    public entryName?: string;
    public eleFilePath?: string;
    public eleVariableName?: string;
    public eleLineNumber?: number;

    public constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState, command?: vscode.Command) {
        super(label, collapsibleState);
        if (command) {
            this.command = command;
        }
        this.contextValue = 'eleTreeItem';
    }
}
