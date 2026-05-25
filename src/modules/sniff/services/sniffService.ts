/* eslint-disable @typescript-eslint/naming-convention */
import { StructuredError } from '../../../shared/errors/structuredError';
import {
    SniffPickResult,
    SniffSearchResult,
    SniffSupportedMethod,
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
        return Array.isArray(response.signals)
            ? response.signals.map(item => this.normalizeSupportedCallable(item))
            : [];
    }

    public async getSupportedSlots(widgetId: string): Promise<SniffSupportedSlot[]> {
        const response = await this.client.getSupportedSlots(widgetId);
        return Array.isArray(response.slots)
            ? response.slots.map(item => this.normalizeSupportedCallable(item))
            : [];
    }

    public async getSupportedMethods(widgetId: string): Promise<SniffSupportedMethod[]> {
        try {
            const response = await this.client.getSupportedMethods(widgetId);
            return Array.isArray(response.methods)
                ? response.methods.map(item => this.normalizeSupportedCallable(item))
                : [];
        } catch (error) {
            // 旧版 Needle runtime 没有 get_supported_methods route，普通方法页签降级为空列表。
            if (error instanceof StructuredError && error.errorType === 'RouteNotFound') {
                return [];
            }
            throw error;
        }
    }

    private normalizeSupportedCallable(record: Record<string, unknown>): SniffSupportedSignal {
        return {
            ...record,
            name: String(record['name'] || record['method'] || ''),
            signature: String(record['signature'] || ''),
            returnType: String(record['returnType'] || record['return_type'] || record['returns'] || ''),
            // Needle 返回 parameter_types/parameter_names；这里提前拼成带类型的参数文本，避免 Webview 丢失类型。
            arguments: this.formatCallableParameters(record)
        };
    }

    private formatCallableParameters(record: Record<string, unknown>): string {
        const parameterTypes = this.stringArrayFrom(record['parameter_types'] || record['parameterTypes']);
        const parameterNames = this.stringArrayFrom(record['parameter_names'] || record['parameterNames']);
        if (parameterTypes.length === 0 && parameterNames.length === 0) {
            return this.formatLegacyArguments(record['arguments'] || record['args'] || record['parameters']);
        }

        const parameterCount = Math.max(parameterTypes.length, parameterNames.length);
        const parameters: string[] = [];
        for (let index = 0; index < parameterCount; index += 1) {
            const parameterType = parameterTypes[index] || '';
            const parameterName = parameterNames[index] || '';
            const parameter = [parameterType, parameterName].filter(Boolean).join(' ');
            if (parameter) {
                parameters.push(parameter);
            }
        }
        return parameters.join(', ');
    }

    private formatLegacyArguments(value: unknown): string {
        if (!Array.isArray(value)) {
            return value ? String(value) : '';
        }

        return value.map(item => {
            if (typeof item === 'string') {
                return item;
            }
            if (item && typeof item === 'object') {
                const argument = item as Record<string, unknown>;
                const name = String(argument['name'] || argument['arg_name'] || '');
                const type = String(argument['type'] || argument['arg_type'] || '');
                return [type, name].filter(Boolean).join(' ');
            }
            return String(item || '');
        }).filter(Boolean).join(', ');
    }

    private stringArrayFrom(value: unknown): string[] {
        return Array.isArray(value)
            ? value.map(item => String(item || '')).filter(Boolean)
            : [];
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
