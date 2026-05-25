export interface SniffWidgetTreeNode {
    widgetId: string;
    type: string;
    name: string;
    text: string;
    children: SniffWidgetTreeNode[];
}

export interface SniffWidgetInfo {
    properties: Record<string, unknown>;
}

export interface SniffSearchResult {
    widgetId: string;
    type: string;
    name: string;
    text: string;
}

export interface SniffWidgetDefResult {
    widgetDef: Record<string, unknown>;
    matchCount: number;
    occurrence: number;
}

export interface SniffWidgetAtPointResult {
    found: boolean;
    point: [number, number];
    widgetId: string;
    type: string;
    name: string;
    text: string;
    widgetModel: string;
    position: [number, number];
    size: [number, number];
}

export interface SniffPickResult {
    accepted: boolean;
    widgetIds: string[];
    widgets: Array<Record<string, unknown>>;
}

export interface SniffSupportedProperty {
    name?: string;
    type?: string;
    value?: unknown;
}

export interface SniffSupportedSignal {
    name?: string;
    signature?: string;
    returnType?: string;
    arguments?: string[] | string;
}

export interface SniffSupportedSlot {
    name?: string;
    signature?: string;
    returnType?: string;
    arguments?: string[] | string;
}

export interface SniffSupportedMethod {
    name?: string;
    signature?: string;
    returnType?: string;
    arguments?: string[] | string;
}
