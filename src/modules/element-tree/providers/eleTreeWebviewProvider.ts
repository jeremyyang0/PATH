import * as vscode from 'vscode';
import {
    generateOperationsForElements,
    getOperationDisplayName,
    revealGeneratedMethod
} from '../../../shared/python/eleOperationService';
import { treeSelectionStore } from '../../../shared/state/treeSelectionStore';
import { loadWebviewHtml } from '../../../platform/vscode/webview/loadWebviewHtml';
import { EleTreeRevealTarget, WebviewElementPayload } from '../models/contracts';
import { ElementTreeNode as TreeItem } from '../models/elementTreeNode';
import { EleTreeDataProvider } from './eleTreeDataProvider';

export class EleTreeWebviewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'eleTreeViewer';

    private view?: vscode.WebviewView;
    private readonly dataProvider = new EleTreeDataProvider();
    private readonly viewDisposables: vscode.Disposable[] = [];
    private isFirstLaunch = true;
    private hasReceivedReady = false;
    private pendingRevealTarget?: EleTreeRevealTarget;

    public constructor(private readonly extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        const resolveToken = this.attachView(webviewView);
        this.hasReceivedReady = false;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };
        webviewView.webview.html = loadWebviewHtml(this.extensionUri, webviewView.webview, 'resources/eleTreeViewer.html', [
            {
                placeholder: '<script src="eleTreeViewer.js"></script>',
                relativePath: 'resources/eleTreeViewer.js',
                kind: 'inline-script'
            }
        ]);

        this.viewDisposables.push(webviewView.webview.onDidReceiveMessage(data => {
            switch (data.command) {
                case 'ready':
                    this.hasReceivedReady = true;
                    this.postMessage({ command: 'debugStatus', text: '扩展已收到 Ele Tree ready 消息' });
                    void this.loadData();
                    break;
                case 'search':
                    void this.handleSearch(data.keyword);
                    break;
                case 'clearSearch':
                    void this.handleClearSearch();
                    break;
                case 'refresh':
                    void this.handleRefresh();
                    break;
                case 'expandAll':
                    this.handleExpandAll();
                    break;
                case 'collapseAll':
                    this.handleCollapseAll();
                    break;
                case 'openFile':
                    void this.handleOpenFile(data.filePath, data.lineNumber);
                    break;
                case 'dragToEditor':
                    this.handleDragToEditor(data.codePath);
                    break;
                case 'addOperation':
                    this.handleAddOperation(data.element, data.operationType);
                    break;
                case 'batchAddOperation':
                    void this.handleBatchAddOperation(data.elements, data.operationType);
                    break;
                case 'saveState':
                    this.postMessage({ command: 'setState', state: data.state });
                    break;
                case 'getState':
                    this.postMessage({ command: 'requestState' });
                    break;
                case 'selectItem':
                    treeSelectionStore.setEleTreeSelection({
                        view: 'eleTree',
                        path: String(data.item?.fullPath || ''),
                        label: String(data.item?.label || ''),
                        codePath: data.item?.codePath ? String(data.item.codePath) : undefined,
                        filePath: data.item?.eleFilePath ? String(data.item.eleFilePath) : undefined,
                        lineNumber: typeof data.item?.eleLineNumber === 'number' ? data.item.eleLineNumber : undefined,
                        eleVariableName: data.item?.eleVariableName ? String(data.item.eleVariableName) : undefined
                    });
                    break;
            }
        }));

        setTimeout(() => {
            if (this.view !== webviewView || resolveToken !== this.currentResolveToken) {
                return;
            }
            this.postMessage({ command: 'debugStatus', text: '扩展正在主动推送 Ele Tree 数据' });
            void this.loadData().then(() => this.revealPendingTargetIfPossible());
        }, 300);

        setTimeout(() => {
            if (this.view !== webviewView || resolveToken !== this.currentResolveToken) {
                return;
            }
            if (this.hasReceivedReady) {
                return;
            }

            void vscode.window.showWarningMessage(
                'Ele Tree Webview 前端脚本未启动，请结束当前 F5 会话后重新启动调试宿主。'
            );
        }, 1500);

        this.viewDisposables.push(webviewView.onDidChangeVisibility(() => {
            if (!webviewView.visible) {
                return;
            }

            void this.handleRefresh().then(() => this.revealPendingTargetIfPossible());
            this.postMessage({ command: 'restoreState' });
        }));
        this.viewDisposables.push(webviewView.onDidDispose(() => {
            if (this.view === webviewView) {
                this.clearView();
            }
        }));
    }

    public dispose(): void {
        this.clearView();
    }

    public refresh(): void {
        void this.handleRefresh();
    }

    /**
     * 聚焦元素树视图并把指定元素展开、选中到前端树中。
     */
    public async revealElementInTree(target: EleTreeRevealTarget): Promise<void> {
        this.pendingRevealTarget = {
            eleFilePath: target.eleFilePath,
            eleVariableName: target.eleVariableName,
            eleLineNumber: target.eleLineNumber
        };

        await this.focusView();
        if (!this.view || !this.hasReceivedReady) {
            return;
        }

        await this.loadData();
        await this.revealPendingTargetIfPossible();
    }

    private postMessage(message: Record<string, unknown>): void {
        if (this.view) {
            try {
                void this.view.webview.postMessage(message);
            } catch {
                this.clearView();
            }
        }
    }

    private currentResolveToken = 0;

    /**
     * resolve 新视图前先释放旧订阅，避免重建 webview 后仍对旧实例发消息。
     */
    private attachView(view: vscode.WebviewView): number {
        this.clearView();
        this.view = view;
        this.currentResolveToken += 1;
        return this.currentResolveToken;
    }

    private clearView(): void {
        this.view = undefined;
        while (this.viewDisposables.length > 0) {
            this.viewDisposables.pop()?.dispose();
        }
    }

    private async loadData(): Promise<void> {
        try {
            this.postMessage({ command: 'debugStatus', text: 'Ele Tree 开始加载数据' });
            await this.dataProvider.loadData();
            const data = await this.getTreeData();
            this.postMessage({
                command: 'updateData',
                data,
                resetState: this.isFirstLaunch
            });
            this.postMessage({ command: 'debugStatus', text: `Ele Tree 数据已推送，顶层节点 ${data.length}` });
            this.isFirstLaunch = false;
        } catch (error) {
            console.error('Failed to load ele tree data:', error);
            this.postMessage({
                command: 'debugStatus',
                text: `Ele Tree 加载失败: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    private async getTreeData(): Promise<Record<string, unknown>[]> {
        const items = await this.dataProvider.getChildren();
        return this.convertTreeItems(items);
    }

    private convertTreeItems(items: TreeItem[]): Record<string, unknown>[] {
        return items.map(item => ({
            label: typeof item.label === 'string' ? item.label : item.label?.label || '',
            fullPath: item.fullPath,
            codePath: item.codePath,
            isLeaf: item.isLeaf,
            nodeType: item.nodeType,
            tooltip: item.tooltip,
            filePath: item.filePath,
            eleFilePath: item.eleFilePath,
            eleVariableName: item.eleVariableName,
            eleLineNumber: item.eleLineNumber,
            children: item.children ? this.convertTreeItems(item.children) : []
        }));
    }

    private async handleSearch(keyword: string): Promise<void> {
        if (keyword) {
            this.dataProvider.applySearchKeyword(keyword);
        } else {
            this.dataProvider.clearSearch();
        }

        await this.pushCurrentData();
    }

    private async handleClearSearch(): Promise<void> {
        this.dataProvider.clearSearch();
        await this.pushCurrentData();
    }

    private async handleRefresh(): Promise<void> {
        await this.loadData();
    }

    /**
     * 如果搜索把目标元素过滤掉，则先恢复完整树，再下发前端展开消息。
     */
    private async revealPendingTargetIfPossible(): Promise<void> {
        if (!this.pendingRevealTarget || !this.view || !this.hasReceivedReady) {
            return;
        }

        const revealTarget = this.pendingRevealTarget;
        const visibleItem = this.dataProvider.findElementItem(revealTarget, 'current');
        const fullItem = visibleItem ?? this.dataProvider.findElementItem(revealTarget, 'original');

        if (!visibleItem && fullItem && this.dataProvider.hasActiveSearch()) {
            this.dataProvider.clearSearch();
            this.postMessage({ command: 'clearSearchState' });
            await this.pushCurrentData();
        }

        const finalItem = this.dataProvider.findElementItem(revealTarget, 'current');
        if (!finalItem) {
            this.pendingRevealTarget = undefined;
            void vscode.window.showWarningMessage('元素树中未找到对应元素。');
            return;
        }

        this.postMessage({
            command: 'revealElement',
            target: {
                eleFilePath: finalItem.eleFilePath,
                eleVariableName: finalItem.eleVariableName,
                eleLineNumber: finalItem.eleLineNumber
            }
        });
        this.pendingRevealTarget = undefined;
    }

    private async pushCurrentData(): Promise<void> {
        const data = await this.getTreeData();
        this.postMessage({
            command: 'updateData',
            data,
            resetState: false
        });
    }

    private handleExpandAll(): void {
        this.dataProvider.expandAll();
        this.postMessage({ command: 'expandAll' });
    }

    private handleCollapseAll(): void {
        this.dataProvider.collapseAll();
    }

    /**
     * 优先聚焦具体元素树视图，失败时退回到 PATH 容器，保证后续 reveal 消息有承载目标。
     */
    private async focusView(): Promise<void> {
        try {
            await vscode.commands.executeCommand(`${EleTreeWebviewProvider.viewType}.focus`);
            return;
        } catch {
            // ignore and fall through
        }

        try {
            await vscode.commands.executeCommand('workbench.view.extension.eleTreeViewerContainer');
        } catch {
            // ignore
        }
    }

    private async handleOpenFile(filePath: string, lineNumber: number): Promise<void> {
        const normalizedPath = filePath.replace(/[\\/]+/g, '\\');
        await vscode.commands.executeCommand('eleTreeViewer.openFile', normalizedPath, lineNumber);
    }

    private handleDragToEditor(codePath: string): void {
        void vscode.commands.executeCommand('eleTreeViewer.dragToEditor', { codePath, isLeaf: true });
    }

    private handleAddOperation(element: WebviewElementPayload, operationType: string): void {
        const treeItem = new TreeItem(String(element.label || element.fullPath || ''), vscode.TreeItemCollapsibleState.None);
        treeItem.eleFilePath = element.eleFilePath;
        treeItem.eleVariableName = element.eleVariableName;
        treeItem.fullPath = element.fullPath || '';
        treeItem.label = String(element.label || '');
        treeItem.isLeaf = true;

        if (operationType === 'click') {
            void vscode.commands.executeCommand('eleTreeViewer.addClickOperation', treeItem);
        } else if (operationType === 'double_click') {
            void vscode.commands.executeCommand('eleTreeViewer.addDoubleClickOperation', treeItem);
        }
    }

    private async handleBatchAddOperation(elements: WebviewElementPayload[], operationType: string): Promise<void> {
        if (!elements || elements.length === 0) {
            vscode.window.showWarningMessage('没有找到可生成方法的元素');
            return;
        }

        const operationTypes: Array<'click' | 'double_click'> = [];
        if (operationType === 'all') {
            operationTypes.push('click', 'double_click');
        } else if (operationType === 'click' || operationType === 'double_click') {
            operationTypes.push(operationType);
        } else {
            console.error('Unknown operation type:', operationType);
            return;
        }

        const targets = elements
            .filter(element => element.eleFilePath && element.eleVariableName)
            .map(element => ({
                eleFilePath: String(element.eleFilePath),
                eleVariableName: String(element.eleVariableName),
                label: String(element.label || element.eleVariableName || 'unknown')
            }));

        const result = await generateOperationsForElements(targets, operationTypes);
        const lastResult = result.results[result.results.length - 1];
        if (lastResult) {
            await revealGeneratedMethod(lastResult);
        }

        const opName = operationType === 'all'
            ? `${getOperationDisplayName('click')}和${getOperationDisplayName('double_click')}`
            : getOperationDisplayName(operationType as 'click' | 'double_click');
        let message = `批量生成完成: ${result.successCount} 个${opName}方法已生成`;
        if (result.skipCount > 0) {
            message += `, ${result.skipCount} 个已存在`;
        }
        if (result.errorCount > 0) {
            message += `, ${result.errorCount} 个失败`;
        }
        vscode.window.showInformationMessage(message);
    }
}
