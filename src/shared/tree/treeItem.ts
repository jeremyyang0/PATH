import * as vscode from 'vscode';

export type TreeNodeType = 'folder' | 'file' | 'method' | 'element';

export interface TreeItemMetadata {
    filePath?: string;
    entryName?: string;
    eleFilePath?: string;
    eleVariableName?: string;
    eleLineNumber?: number;
    methodName?: string;
    methodLine?: number;
    methodDoc?: string;
    methodFilePath?: string;
}

/**
 * Shared tree item model used across extension views.
 * The metadata bag keeps feature-specific fields in one place while
 * preserving the existing property-based API for compatibility.
 */
export class TreeItem extends vscode.TreeItem {
    public fullPath = '';
    public codePath = '';
    public isLeaf = false;
    public nodeType: TreeNodeType = 'folder';
    public children?: TreeItem[];
    public readonly metadata: TreeItemMetadata = {};

    public constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState, command?: vscode.Command) {
        super(label, collapsibleState);
        if (command) {
            this.command = command;
        }
        this.contextValue = 'eleTreeItem';
    }

    public get filePath(): string | undefined {
        return this.metadata.filePath;
    }

    public set filePath(value: string | undefined) {
        this.metadata.filePath = value;
    }

    public get entryName(): string | undefined {
        return this.metadata.entryName;
    }

    public set entryName(value: string | undefined) {
        this.metadata.entryName = value;
    }

    public get eleFilePath(): string | undefined {
        return this.metadata.eleFilePath;
    }

    public set eleFilePath(value: string | undefined) {
        this.metadata.eleFilePath = value;
    }

    public get eleVariableName(): string | undefined {
        return this.metadata.eleVariableName;
    }

    public set eleVariableName(value: string | undefined) {
        this.metadata.eleVariableName = value;
    }

    public get eleLineNumber(): number | undefined {
        return this.metadata.eleLineNumber;
    }

    public set eleLineNumber(value: number | undefined) {
        this.metadata.eleLineNumber = value;
    }

    public get methodName(): string | undefined {
        return this.metadata.methodName;
    }

    public set methodName(value: string | undefined) {
        this.metadata.methodName = value;
    }

    public get methodLine(): number | undefined {
        return this.metadata.methodLine;
    }

    public set methodLine(value: number | undefined) {
        this.metadata.methodLine = value;
    }

    public get methodDoc(): string | undefined {
        return this.metadata.methodDoc;
    }

    public set methodDoc(value: string | undefined) {
        this.metadata.methodDoc = value;
    }

    public get methodFilePath(): string | undefined {
        return this.metadata.methodFilePath;
    }

    public set methodFilePath(value: string | undefined) {
        this.metadata.methodFilePath = value;
    }
}

export interface TreeNode {
    item: TreeItem;
    children: Record<string, TreeNode>;
}
