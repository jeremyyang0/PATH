import * as vscode from 'vscode';

/**
 * 禅道树在未登录、无数据或请求失败时显示占位节点，避免整棵树看起来像“空白”。
 */
export class ZentaoStatusNode extends vscode.TreeItem {
    public constructor(label: string, description?: string, commandId?: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        this.contextValue = 'pathZentaoStatus';
        if (commandId) {
            this.command = {
                command: commandId,
                title: label
            };
        }
    }
}
