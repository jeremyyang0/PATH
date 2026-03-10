/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import { StructuredError } from '../../../shared/errors/structuredError';
import { LocalSocketTransport } from '../../../shared/ipc/localSocketTransport';

type SniffTreeResponse = {
    widget_id?: string;
    type?: string;
    name?: string;
    text?: string;
    children?: SniffTreeResponse[];
    error?: string;
    error_type?: string;
    traceback?: string;
};

type SniffSearchResponse = Array<{
    widget_id: string;
    type: string;
    name: string;
    text: string;
}>;

type SniffWidgetDefResponse = {
    widget_def?: Record<string, unknown>;
    match_count?: number;
    occurrence?: number;
    error?: string;
    error_type?: string;
    traceback?: string;
};

type SniffInfoResponse = Record<string, unknown> & {
    error?: string;
    error_type?: string;
    traceback?: string;
};

function throwIfError(response: { error?: string; error_type?: string; traceback?: string }): void {
    if (response.error) {
        throw new StructuredError({
            error: response.error,
            errorType: response.error_type,
            traceback: response.traceback
        });
    }
}

export class SniffClient {
    private static readonly defaultRequestTimeoutMs = 5000;
    private readonly transport = new LocalSocketTransport();

    public constructor(private readonly serverName: string) {}

    private getRoutePath(route: string): string {
        return route.trim().replace(/^\/+/, '');
    }

    private getRequestOptions(): { timeoutMs: number } {
        const configuredTimeout = vscode.workspace
            .getConfiguration('path.sniff')
            .get<number>('clientRequestTimeoutMs', SniffClient.defaultRequestTimeoutMs);

        if (!Number.isFinite(configuredTimeout) || configuredTimeout <= 0) {
            return { timeoutMs: SniffClient.defaultRequestTimeoutMs };
        }

        return { timeoutMs: Math.floor(configuredTimeout) };
    }

    public async getWidgetTree(): Promise<SniffTreeResponse> {
        const response = await this.transport.post<SniffTreeResponse>(
            this.serverName,
            this.getRoutePath('get_widget_tree'),
            undefined,
            this.getRequestOptions()
        );
        throwIfError(response);
        return response;
    }

    public async refreshWidgetTree(): Promise<SniffTreeResponse> {
        const response = await this.transport.post<SniffTreeResponse>(
            this.serverName,
            this.getRoutePath('refresh_widget_tree'),
            undefined,
            this.getRequestOptions()
        );
        throwIfError(response);
        return response;
    }

    public async getWidgetInfo(widgetId: string): Promise<SniffInfoResponse> {
        const response = await this.transport.post<SniffInfoResponse>(this.serverName, this.getRoutePath('get_widget_info'), {
            widget_id: widgetId
        }, this.getRequestOptions());
        throwIfError(response);
        return response;
    }

    public async highlightWidget(widgetId: string): Promise<void> {
        const response = await this.transport.post<{ success?: boolean; error?: string; error_type?: string; traceback?: string }>(
            this.serverName,
            this.getRoutePath('highlight_widget'),
            { widget_id: widgetId },
            this.getRequestOptions()
        );
        throwIfError(response);
    }

    public async searchWidget(widgetDef: Record<string, unknown>): Promise<SniffSearchResponse> {
        const response = await this.transport.post<SniffSearchResponse | { error?: string; error_type?: string; traceback?: string }>(
            this.serverName,
            this.getRoutePath('search_widget'),
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
        const response = await this.transport.post<SniffWidgetDefResponse>(this.serverName, this.getRoutePath('generate_widget_def'), {
            widget_id: widgetId
        }, this.getRequestOptions());
        throwIfError(response);
        return response;
    }
}
