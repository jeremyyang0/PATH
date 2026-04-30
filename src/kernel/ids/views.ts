export const VIEWS = {
    eleTreeViewer: 'eleTreeViewer',
    methodsViewer: 'methodsViewer',
    pathFileTree: 'pathFileTree',
    pathZentaoTree: 'pathZentaoTree',
    pathSniffViewer: 'pathSniffViewer',
    pathSniffOverviewViewer: 'pathSniffOverviewViewer',
    pathSniffLogsViewer: 'pathSniffLogsViewer',
    eleSecondaryView: 'eleSecondaryView'
} as const;

export type ViewId = (typeof VIEWS)[keyof typeof VIEWS];
