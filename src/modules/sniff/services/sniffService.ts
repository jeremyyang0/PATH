/* eslint-disable @typescript-eslint/naming-convention */
import {
    SniffPickResult,
    SniffSearchResult,
    SniffSupportedProperty,
    SniffSupportedSignal,
    SniffSupportedSlot,
    SniffWidgetAtPointResult,
    SniffWidgetDefResult,
    SniffWidgetInfo,
    SniffWidgetTreeNode
} from '../models/sniffModels';
import { NeedleEndpoint } from './needleTcpTransport';
import { SniffClient, SniffTreeResponse } from './sniffClient';

export class SniffService {
    private readonly client: SniffClient;

    public constructor(endpoint: NeedleEndpoint) {
        this.client = new SniffClient(endpoint);
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

    public async activateApplicationWindow(): Promise<void> {
        await this.client.activateApplicationWindow();
    }

    public async searchWidgets(widgetDef: Record<string, unknown>): Promise<SniffSearchResult[]> {
        const response = await this.client.searchWidgets(widgetDef);
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

    public async findWidgetByPoint(
        x: number,
        y: number,
        refresh = false
    ): Promise<SniffWidgetAtPointResult> {
        const response = await this.client.findWidgetByPoint(x, y, refresh);
        return {
            found: Boolean(response.found),
            point: response.point || [x, y],
            widgetId: response.widget_id || '',
            type: response.type || '',
            name: response.name || '',
            text: response.text || '',
            widgetModel: response.widget_model || '',
            position: response.position || [-1, -1],
            size: response.size || [0, 0]
        };
    }

    public async pickWidgets(): Promise<SniffPickResult> {
        const response = await this.client.pickWidgets(true, true, 0);
        return {
            accepted: Boolean(response.accepted),
            widgetIds: Array.isArray(response.widget_ids) ? response.widget_ids.map(String).filter(Boolean) : [],
            widgets: Array.isArray(response.widgets) ? response.widgets : []
        };
    }

    public async getSupportedProperties(widgetId: string): Promise<SniffSupportedProperty[]> {
        const response = await this.client.getSupportedProperties(widgetId);
        return Array.isArray(response.properties) ? response.properties : [];
    }

    public async getSupportedSignals(widgetId: string): Promise<SniffSupportedSignal[]> {
        const response = await this.client.getSupportedSignals(widgetId);
        return Array.isArray(response.signals) ? response.signals : [];
    }

    public async getSupportedSlots(widgetId: string): Promise<SniffSupportedSlot[]> {
        const response = await this.client.getSupportedSlots(widgetId);
        return Array.isArray(response.slots) ? response.slots : [];
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
