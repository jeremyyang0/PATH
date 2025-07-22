import * as vscode from 'vscode';

/**
 * 树形数据项
 */
export class TreeItem extends vscode.TreeItem {
    public fullPath: string = ''; // 存储完整路径（中文显示用）
    public codePath: string = ''; // 存储代码路径（英文变量名）
    public isLeaf: boolean = false; // 标记是否为叶子节点
    public children?: TreeItem[]; // 子项列表
    public eleFilePath?: string | ''; // Ele文件路径
    public eleVariableName?: string | ''; // Ele变量名
    public eleLineNumber?: number | ''; // Ele变量所在行号
    public methodName?: string | ''; // 方法名
    public methodLine?: number | ''; // 方法所在行号
    public methodDoc?: string | ''; // 方法文档
    public methodFilePath?: string | ''; // 方法文件路径

    constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState, command?: vscode.Command) {
        super(label, collapsibleState);
        if (command) {
            this.command = command;
        }
        // 默认contextValue，会在后面根据isLeaf属性更新
        this.contextValue = 'eleTreeItem';
    }
}

/**
 * 树节点数据结构
 */
export interface TreeNode {
    item: TreeItem;
    children: { [key: string]: TreeNode };
} 