/* eslint-disable @typescript-eslint/naming-convention */
import { SniffSearchResult, SniffWidgetDefResult, SniffWidgetInfo, SniffWidgetTreeNode } from '../models/sniffModels';
import { SniffClient } from './sniffClient';

type SniffTreeResponse = {
    widget_id?: string;
    type?: string;
    name?: string;
    text?: string;
    children?: SniffTreeResponse[];
};

export class SniffService {
    private readonly client: SniffClient;

    public constructor(serverName: string) {
        this.client = new SniffClient(serverName);
    }

    public async getTree(): Promise<SniffWidgetTreeNode[]> {
        const response = await this.client.getWidgetTree();
        return this.extractActualTopNodes(response);
    }

    public async refreshTree(): Promise<SniffWidgetTreeNode[]> {
        const response = await this.client.refreshWidgetTree();
        return this.extractActualTopNodes(response);
    }

    public async getWidgetInfo(widgetId: string): Promise<SniffWidgetInfo> {
        const response = await this.client.getWidgetInfo(widgetId);
        return {
            properties: response
        };
    }

    public async highlightWidget(widgetId: string): Promise<void> {
        await this.client.highlightWidget(widgetId);
    }

    public async searchWidgets(widgetDef: Record<string, unknown>): Promise<SniffSearchResult[]> {
        const response = await this.client.searchWidget(widgetDef);
        return response.map(item => ({
            widgetId: item.widget_id,
            type: item.type,
            name: item.name,
            text: item.text
        }));
    }

    public async generateWidgetDef(widgetId: string): Promise<SniffWidgetDefResult> {
        const response = await this.client.generateWidgetDef(widgetId);
        return {
            widgetDef: response.widget_def || {},
            matchCount: response.match_count || 1,
            occurrence: response.occurrence || 1
        };
    }

    private extractActualTopNodes(root: SniffTreeResponse): SniffWidgetTreeNode[] {
        const mappedRoot = this.mapTreeNode(root);
        return mappedRoot.children.filter(child => child.type !== 'VirtualRoot');
    }

    private mapTreeNode(node: SniffTreeResponse): SniffWidgetTreeNode {
        return {
            widgetId: node.widget_id || '',
            type: node.type || '',
            name: node.name || '',
            text: node.text || '',
            children: (node.children || []).map(child => this.mapTreeNode(child))
        };
    }
}
