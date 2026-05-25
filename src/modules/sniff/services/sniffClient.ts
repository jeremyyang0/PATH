/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import { StructuredError } from '../../../shared/errors/structuredError';
import { NeedleEndpoint, NeedleTcpTransport } from './needleTcpTransport';

type ErrorResponse = {
    error?: string;
    error_type?: string;
    traceback?: string;
};

export type SniffTreeResponse = ErrorResponse & {
    widget_id?: string;
    type?: string;
    name?: string;
    text?: string;
    children?: SniffTreeResponse[];
};

export type SniffSearchResponse = Array<{
    widget_id: string;
    type: string;
    name: string;
    text: string;
}>;

export type SniffWidgetDefResponse = ErrorResponse & {
    widget_id?: string;
    widget_def?: Record<string, unknown>;
    match_count?: number;
    occurrence?: number;
};

export type SniffInfoResponse = Record<string, unknown> & ErrorResponse;

export type SniffWidgetAtPointResponse = ErrorResponse & {
    found?: boolean;
    point?: [number, number];
    widget_id?: string;
    type?: string;
    name?: string;
    text?: string;
    widget_model?: string;
    position?: [number, number];
    size?: [number, number];
};

export type SniffPickResponse = ErrorResponse & {
    accepted?: boolean;
    widget_ids?: string[];
    widgets?: Array<Record<string, unknown>>;
};

export type SniffSupportedPropertiesResponse = ErrorResponse & {
    widget_id?: string;
    properties?: Array<Record<string, unknown>>;
};

export type SniffSupportedSignalsResponse = ErrorResponse & {
    widget_id?: string;
    signals?: Array<Record<string, unknown>>;
};

export type SniffSupportedSlotsResponse = ErrorResponse & {
    widget_id?: string;
    slots?: Array<Record<string, unknown>>;
};

export type SniffSupportedMethodsResponse = ErrorResponse & {
    widget_id?: string;
    methods?: Array<Record<string, unknown>>;
};

function throwIfError(response: ErrorResponse): void {
    if (response.error) {
        throw new StructuredError({
            error: response.error,
            errorType: response.error_type,
            traceback: response.traceback
        });
    }
}

function requestTimeoutMs(settingName: string, fallback: number): number {
    const configuredTimeout = vscode.workspace
        .getConfiguration('path.sniff')
        .get<number>(settingName, fallback);

    if (!Number.isFinite(configuredTimeout) || configuredTimeout <= 0) {
        return fallback;
    }

    return Math.floor(configuredTimeout);
}

export class SniffClient {
    private static readonly defaultRequestTimeoutMs = 5000;
    private static readonly defaultPickRequestTimeoutMs = 3600000;
    private readonly transport = new NeedleTcpTransport();

    public constructor(private readonly endpoint: NeedleEndpoint) {}

    private getRequestOptions(): { timeoutMs: number } {
        return {
            timeoutMs: requestTimeoutMs('clientRequestTimeoutMs', SniffClient.defaultRequestTimeoutMs)
        };
    }

    private getPickRequestOptions(): { timeoutMs: number } {
        return {
            timeoutMs: requestTimeoutMs('pickRequestTimeoutMs', SniffClient.defaultPickRequestTimeoutMs)
        };
    }

    /**
     * 所有 Sniff API 都经由 Needle TCP route，确保 PATH 不再依赖 Python sidecar 或命名管道。
     */
    private async post<TResponse extends ErrorResponse>(
        route: string,
        payload?: Record<string, unknown>,
        timeoutMs = this.getRequestOptions().timeoutMs
    ): Promise<TResponse> {
        const response = await this.transport.post<TResponse>(this.endpoint, route, payload, { timeoutMs });
        throwIfError(response);
        return response;
    }

    public async hello(): Promise<Record<string, unknown>> {
        return this.post<Record<string, unknown> & ErrorResponse>('hello', {});
    }

    public async getWidgetTree(): Promise<SniffTreeResponse> {
        return this.post<SniffTreeResponse>('get_widget_tree', {});
    }

    public async refreshWidgetTree(): Promise<SniffTreeResponse> {
        return this.post<SniffTreeResponse>('refresh_widget_tree', {});
    }

    public async getWidgetInfo(widgetId: string): Promise<SniffInfoResponse> {
        return this.post<SniffInfoResponse>('get_widget_info', { widget_id: widgetId });
    }

    public async highlightWidget(widgetId: string): Promise<void> {
        await this.post<ErrorResponse & { success?: boolean }>('highlight_widget', { widget_id: widgetId });
    }

    public async searchWidgets(widgetDef: Record<string, unknown>): Promise<SniffSearchResponse> {
        const response = await this.transport.post<SniffSearchResponse | ErrorResponse>(
            this.endpoint,
            'search_widgets',
            { widget_def: widgetDef },
            this.getRequestOptions()
        );

        if (!Array.isArray(response)) {
            throwIfError(response);
            return [];
        }

        return response;
    }

    public async generateWidgetDef(widgetId: string): Promise<SniffWidgetDefResponse> {
        return this.post<SniffWidgetDefResponse>('generate_widget_def', { widget_id: widgetId });
    }

    public async activateApplicationWindow(): Promise<void> {
        await this.post<ErrorResponse & { success?: boolean }>('activate_application_window', {});
    }

    public async findWidgetByPoint(
        x: number,
        y: number,
        refresh = false
    ): Promise<SniffWidgetAtPointResponse> {
        return this.post<SniffWidgetAtPointResponse>('find_widget_by_point', { x, y, refresh });
    }

    public async pickWidgets(multiSelect = true, refresh = true, timeoutMs = 0): Promise<SniffPickResponse> {
        return this.post<SniffPickResponse>(
            'pick_widgets',
            {
                multi_select: multiSelect,
                refresh,
                timeout_ms: timeoutMs
            },
            this.getPickRequestOptions().timeoutMs
        );
    }

    public async getSupportedProperties(widgetId: string): Promise<SniffSupportedPropertiesResponse> {
        return this.post<SniffSupportedPropertiesResponse>('get_supported_properties', {
            widget_id: widgetId,
            refresh: false
        });
    }

    public async getSupportedSignals(widgetId: string): Promise<SniffSupportedSignalsResponse> {
        return this.post<SniffSupportedSignalsResponse>('get_supported_signals', {
            widget_id: widgetId,
            refresh: false
        });
    }

    public async getSupportedSlots(widgetId: string): Promise<SniffSupportedSlotsResponse> {
        return this.post<SniffSupportedSlotsResponse>('get_supported_slots', {
            widget_id: widgetId,
            refresh: false
        });
    }

    public async getSupportedMethods(widgetId: string): Promise<SniffSupportedMethodsResponse> {
        return this.post<SniffSupportedMethodsResponse>('get_supported_methods', {
            widget_id: widgetId,
            refresh: false
        });
    }
}
