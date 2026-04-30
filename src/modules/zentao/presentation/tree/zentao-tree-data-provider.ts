import * as vscode from 'vscode';
import { ZentaoTreeController, ZentaoTreeItem } from './zentao-tree-controller';
import { ZentaoNode } from './zentao-node';

export class ZentaoTreeDataProvider implements vscode.TreeDataProvider<ZentaoTreeItem>, vscode.Disposable {
    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ZentaoTreeItem | undefined | null | void>();

    public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

    public constructor(private readonly controller: ZentaoTreeController) {
        this.controller.onDidChange(() => {
            this.onDidChangeTreeDataEmitter.fire();
        });
    }

    public dispose(): void {
        this.onDidChangeTreeDataEmitter.dispose();
    }

    public getTreeItem(element: ZentaoTreeItem): vscode.TreeItem {
        return element;
    }

    public getChildren(element?: ZentaoTreeItem): Thenable<ZentaoTreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        return Promise.resolve([...this.controller.getNodes()]);
    }
}
