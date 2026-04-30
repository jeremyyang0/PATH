import * as vscode from 'vscode';
import { SniffWidgetTreeNode } from '../models/sniffModels';

export interface SniffDetailsState {
    serverName: string;
    status: string;
    selectedWidgetId: string;
    properties: Record<string, unknown>;
    widgetDef: Record<string, unknown>;
    matchCount: number;
    occurrence: number;
    logLines: string[];
}

export interface SniffTreeState {
    serverName: string;
    tree: SniffWidgetTreeNode[];
}

function createInitialDetailsState(): SniffDetailsState {
    return {
        serverName: 'common',
        status: '未连接',
        selectedWidgetId: '',
        properties: {},
        widgetDef: {},
        matchCount: 1,
        occurrence: 1,
        logLines: []
    };
}

export class SniffViewStateStore {
    private readonly detailsEmitter = new vscode.EventEmitter<SniffDetailsState>();
    private readonly treeEmitter = new vscode.EventEmitter<SniffTreeState>();
    private detailsState = createInitialDetailsState();
    private treeState: SniffTreeState = {
        serverName: 'common',
        tree: []
    };

    public readonly onDidChangeDetails = this.detailsEmitter.event;
    public readonly onDidChangeTree = this.treeEmitter.event;

    public dispose(): void {
        this.detailsEmitter.dispose();
        this.treeEmitter.dispose();
    }

    public getDetailsState(): SniffDetailsState {
        return {
            ...this.detailsState,
            properties: { ...this.detailsState.properties },
            widgetDef: { ...this.detailsState.widgetDef },
            logLines: [...this.detailsState.logLines]
        };
    }

    public getTreeState(): SniffTreeState {
        return {
            serverName: this.treeState.serverName,
            tree: this.treeState.tree
        };
    }

    public setServerName(serverName: string): void {
        this.detailsState = {
            ...this.detailsState,
            serverName
        };
        this.treeState = {
            ...this.treeState,
            serverName
        };
        this.emitDetails();
        this.emitTree();
    }

    public setStatus(status: string): void {
        this.detailsState = {
            ...this.detailsState,
            status
        };
        this.emitDetails();
    }

    public appendLog(message: string): void {
        const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`;
        this.detailsState = {
            ...this.detailsState,
            logLines: [...this.detailsState.logLines.slice(-199), line]
        };
        this.emitDetails();
    }

    public setTree(tree: SniffWidgetTreeNode[]): void {
        this.treeState = {
            serverName: this.treeState.serverName,
            tree
        };
        this.emitTree();
    }

    public setSelection(widgetId: string): void {
        this.detailsState = {
            ...this.detailsState,
            selectedWidgetId: widgetId
        };
        this.emitDetails();
    }

    public setWidgetInfo(widgetId: string, properties: Record<string, unknown>): void {
        this.detailsState = {
            ...this.detailsState,
            selectedWidgetId: widgetId,
            properties: { ...properties }
        };
        this.emitDetails();
    }

    public setWidgetDef(
        widgetId: string,
        widgetDef: Record<string, unknown>,
        matchCount: number,
        occurrence: number
    ): void {
        this.detailsState = {
            ...this.detailsState,
            selectedWidgetId: widgetId,
            widgetDef: { ...widgetDef },
            matchCount,
            occurrence
        };
        this.emitDetails();
    }

    public clearSelection(): void {
        this.detailsState = {
            ...this.detailsState,
            selectedWidgetId: '',
            properties: {},
            widgetDef: {},
            matchCount: 1,
            occurrence: 1
        };
        this.emitDetails();
    }

    private emitDetails(): void {
        this.detailsEmitter.fire(this.getDetailsState());
    }

    private emitTree(): void {
        this.treeEmitter.fire(this.getTreeState());
    }
}
