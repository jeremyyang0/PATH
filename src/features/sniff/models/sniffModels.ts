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
