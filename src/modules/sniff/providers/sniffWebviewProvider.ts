import * as vscode from 'vscode';
import * as path from 'path';
import { StructuredError } from '../../../shared/errors/structuredError';
import { loadWebviewHtml } from '../../../platform/vscode/webview/loadWebviewHtml';
import { SniffWidgetTreeNode } from '../models/sniffModels';
import {
    NeedleRuntimeService,
    SniffConnectionRequest,
    SniffConnectionState
} from '../services/needleRuntimeService';
import { SniffService } from '../services/sniffService';
import { SniffWidgetDefCopyService } from '../services/sniffWidgetDefCopyService';
import { SniffViewStateStore } from '../services/sniffViewStateStore';

interface LoadAppProfile {
    name: string;
    targetExe: string;
    targetArgs: string;
}

export class SniffWebviewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'pathSniffViewer';
    private static readonly defaultAutoRefreshIntervalSeconds = 5;
    private static readonly loadAppProfilesSettingName = 'loadappProfiles';

    private static readonly outputChannel = vscode.window.createOutputChannel('PATH Sniff');

    private view?: vscode.WebviewView;
    private readonly viewDisposables: vscode.Disposable[] = [];
    private currentConnection?: SniffConnectionState;
    private service?: SniffService;
    private hasInitializedAutoRefresh = false;
    private autoRefreshEnabled = false;
    private autoRefreshIntervalSeconds = SniffWebviewProvider.defaultAutoRefreshIntervalSeconds;
    private autoRefreshTimer?: NodeJS.Timeout;
    private refreshInProgress = false;
    private pickInProgress = false;
    private readonly copyService = new SniffWidgetDefCopyService();
    private readonly runtimeService = new NeedleRuntimeService();
    private currentResolveToken = 0;

    public constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly stateStore: SniffViewStateStore
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        const resolveToken = this.attachView(webviewView);
        this.log(`Resolve tree view. connection=${this.connectionLabel()}`);
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        this.viewDisposables.push(webviewView.webview.onDidReceiveMessage(data => {
            const command = String(data.command || 'unknown');
            this.log(`Received tree command: ${command}`);

            switch (data.command) {
                case 'ready':
                    if (!this.hasInitializedAutoRefresh) {
                        this.updateAutoRefreshState(
                            Boolean(data.autoRefreshEnabled),
                            Number(data.autoRefreshIntervalSeconds || 0)
                        );
                    }
                    this.pushConnectionState();
                    this.pushTreeState();
                    this.pushAutoRefreshState();
                    this.pushPickState();
                    this.pushLoadAppProfiles();
                    break;
                case 'connect':
                    void this.connect(data.connection as SniffConnectionRequest | undefined);
                    break;
                case 'getLoadAppProfiles':
                    this.pushLoadAppProfiles();
                    break;
                case 'upsertLoadAppProfile':
                    void this.upsertLoadAppProfileFromManager(
                        String(data.originalName || ''),
                        this.isRecord(data.profile) ? data.profile : {}
                    );
                    break;
                case 'removeLoadAppProfile':
                    void this.removeLoadAppProfileFromManager(String(data.name || ''));
                    break;
                case 'pickLoadAppExe':
                    void this.pickLoadAppExeForManager(String(data.currentPath || ''));
                    break;
                case 'refresh':
                    void this.refresh();
                    break;
                case 'setAutoRefresh':
                    this.updateAutoRefreshState(Boolean(data.enabled), Number(data.intervalSeconds || 0));
                    this.pushAutoRefreshState();
                    break;
                case 'pickWidget':
                    void this.pickWidget();
                    break;
                case 'selectWidget':
                    void this.selectWidget(String(data.widgetId || ''));
                    break;
                case 'clearSelection':
                    this.clearSelection();
                    break;
                case 'highlightWidget':
                    void this.highlightWidget(String(data.widgetId || ''));
                    break;
                case 'generateWidgetDef':
                    void this.generateWidgetDef(String(data.widgetId || ''));
                    break;
                case 'copyWidgetDefs':
                    void this.copyWidgetDefs(Array.isArray(data.widgetIds) ? data.widgetIds : []);
                    break;
                case 'findWidgets':
                    void this.findWidgets(String(data.widgetDef || ''));
                    break;
                case 'copyError':
                    void vscode.env.clipboard.writeText(String(data.text || ''));
                    break;
            }
        }));

        webviewView.webview.html = loadWebviewHtml(this.context.extensionUri, webviewView.webview, 'resources/sniff/sniffViewer.html', [
            {
                placeholder: '<script src="sniffViewer.js"></script>',
                relativePath: 'resources/sniff/sniffViewer.js',
                kind: 'inline-script'
            }
        ]);

        setTimeout(() => {
            if (this.view !== webviewView || resolveToken !== this.currentResolveToken) {
                return;
            }
            this.pushConnectionState();
            this.pushTreeState();
            this.pushPickState();
        }, 300);
        this.viewDisposables.push(webviewView.onDidDispose(() => {
            if (this.view === webviewView) {
                this.clearView();
            }
        }));
    }

    public dispose(): void {
        if (this.autoRefreshTimer) {
            clearInterval(this.autoRefreshTimer);
            this.autoRefreshTimer = undefined;
        }
        this.clearView();
    }

    public refresh(resetState = false): Promise<void> {
        if (this.refreshInProgress) {
            this.log(`Skip refresh because another refresh is running. connection=${this.connectionLabel()}`);
            return Promise.resolve();
        }

        this.refreshInProgress = true;
        return this.run(async () => {
            const service = this.requireService();
            this.setStatus(`正在刷新 ${this.connectionLabel()} 控件树...`);
            this.log(`Refreshing tree. connection=${this.connectionLabel()}, resetState=${String(resetState)}`);

            const tree = await service.refreshTree();
            this.log(`Tree refreshed. topLevelNodes=${tree.length}`);

            this.setStatus(
                tree.length > 0
                    ? `已连接 ${this.connectionLabel()}，收到 ${tree.length} 个顶层节点`
                    : `已连接 ${this.connectionLabel()}，但控件树为空`
            );

            this.syncTreeState(tree, resetState);
        }).finally(() => {
            this.refreshInProgress = false;
        });
    }

    public toggleAutoRefresh(): void {
        this.updateAutoRefreshState(!this.autoRefreshEnabled, this.autoRefreshIntervalSeconds);
        this.pushAutoRefreshState();
        this.setStatus(
            this.autoRefreshEnabled
                ? `已开启自动刷新 (${this.autoRefreshIntervalSeconds}s)`
                : '已关闭自动刷新'
        );
    }

    private async connect(request?: SniffConnectionRequest): Promise<void> {
        await this.run(async () => {
            const connection = await this.resolveConnection(request);
            this.currentConnection = connection;
            this.service = new SniffService(this.runtimeService.endpointFromState(connection));
            this.stateStore.setConnectionLabel(connection.label);
            this.stateStore.clearSelection();
            this.pushConnectionState();
            this.setStatus(`已连接 ${connection.label}`);
            this.log(`Connected. mode=${connection.mode}, label=${connection.label}`);
            await this.refresh(true);
        });
    }

    private async resolveConnection(request?: SniffConnectionRequest): Promise<SniffConnectionState> {
        const mode = request?.mode || 'remote';
        if (mode === 'attach') {
            return this.runtimeService.attach(Number(request?.pid || 0));
        }
        if (mode === 'loadapp') {
            return this.runtimeService.loadapp(String(request?.targetExe || ''), String(request?.targetArgs || ''));
        }
        return this.runtimeService.resolveRemoteConnection(String(request?.host || '127.0.0.1'), Number(request?.port || 0));
    }

    private async chooseLoadAppTarget(request?: SniffConnectionRequest): Promise<void> {
        const targetExe = await this.pickLoadAppTarget(String(request?.targetExe || ''));
        if (!targetExe) {
            return;
        }

        const nextRequest: SniffConnectionRequest = {
            ...(request || {}),
            mode: 'loadapp',
            targetExe
        };
        this.postMessage({
            command: 'setLoadAppProfile',
            connection: nextRequest,
            force: true
        });
    }

    /**
     * 将当前 LoadApp 表单保存到 VS Code 配置，供后续 QuickPick 直接复用。
     */
    private async createLoadAppProfile(request?: SniffConnectionRequest): Promise<void> {
        const current = this.normalizeLoadAppRequest(request);
        const targetExe = current.targetExe || await this.pickLoadAppTarget('');
        if (!targetExe) {
            return;
        }

        const name = await this.promptProfileName('新建 LoadApp 配置', this.profileNameFromTarget(targetExe));
        if (!name) {
            return;
        }

        const targetArgs = await vscode.window.showInputBox({
            title: 'LoadApp 启动参数',
            prompt: '填写启动参数，可留空。',
            value: current.targetArgs
        });
        if (targetArgs === undefined) {
            return;
        }

        const profiles = this.getLoadAppProfiles();
        const duplicateIndex = profiles.findIndex(profile => profile.name === name);
        if (duplicateIndex >= 0) {
            const overwrite = await vscode.window.showWarningMessage(
                `LoadApp 配置 "${name}" 已存在，是否覆盖？`,
                '覆盖',
                '取消'
            );
            if (overwrite !== '覆盖') {
                return;
            }
        }

        const nextProfile: LoadAppProfile = { name, targetExe, targetArgs };
        const nextProfiles = [...profiles];
        if (duplicateIndex >= 0) {
            nextProfiles[duplicateIndex] = nextProfile;
        } else {
            nextProfiles.push(nextProfile);
        }

        await this.updateLoadAppProfiles(nextProfiles);
        this.applyLoadAppProfile(nextProfile);
        void vscode.window.showInformationMessage(`已保存 LoadApp 配置 "${name}"`);
    }

    /**
     * 从 VS Code 配置中选择一条 LoadApp 配置并回填到连接面板。
     */
    private async loadLoadAppProfile(): Promise<void> {
        const profile = await this.pickLoadAppProfileFromSettings('选择要加载的 LoadApp 配置');
        if (!profile) {
            return;
        }

        this.applyLoadAppProfile(profile);
        void vscode.window.showInformationMessage(`已加载 LoadApp 配置 "${profile.name}"`);
    }

    /**
     * 编辑已有 LoadApp 配置；取消选择目标程序时保留原路径。
     */
    private async editLoadAppProfile(): Promise<void> {
        const profiles = this.getLoadAppProfiles();
        const profile = await this.pickLoadAppProfileFromSettings('选择要编辑的 LoadApp 配置', profiles);
        if (!profile) {
            return;
        }

        const name = await this.promptProfileName('编辑 LoadApp 配置名称', profile.name);
        if (!name) {
            return;
        }

        const pickedTargetExe = await this.pickLoadAppTarget(profile.targetExe, '选择新的 Needle LoadApp 目标程序（取消则保留原路径）');
        const targetArgs = await vscode.window.showInputBox({
            title: 'LoadApp 启动参数',
            prompt: '填写启动参数，可留空。',
            value: profile.targetArgs
        });
        if (targetArgs === undefined) {
            return;
        }

        const duplicateIndex = profiles.findIndex(candidate => candidate.name === name && candidate.name !== profile.name);
        if (duplicateIndex >= 0) {
            void vscode.window.showWarningMessage(`LoadApp 配置 "${name}" 已存在，请换一个名称。`);
            return;
        }

        const nextProfile: LoadAppProfile = {
            name,
            targetExe: pickedTargetExe || profile.targetExe,
            targetArgs
        };
        const nextProfiles = profiles.map(candidate => candidate.name === profile.name ? nextProfile : candidate);
        await this.updateLoadAppProfiles(nextProfiles);
        this.applyLoadAppProfile(nextProfile);
        void vscode.window.showInformationMessage(`已更新 LoadApp 配置 "${name}"`);
    }

    /**
     * 删除 VS Code 配置中的 LoadApp 配置项，避免误删时先二次确认。
     */
    private async deleteLoadAppProfile(): Promise<void> {
        const profiles = this.getLoadAppProfiles();
        const profile = await this.pickLoadAppProfileFromSettings('选择要删除的 LoadApp 配置', profiles);
        if (!profile) {
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `确定删除 LoadApp 配置 "${profile.name}"？`,
            '删除',
            '取消'
        );
        if (confirm !== '删除') {
            return;
        }

        await this.updateLoadAppProfiles(profiles.filter(candidate => candidate.name !== profile.name));
        void vscode.window.showInformationMessage(`已删除 LoadApp 配置 "${profile.name}"`);
    }

    private async selectWidget(widgetId: string): Promise<void> {
        if (!widgetId) {
            this.clearSelection();
            return;
        }

        await this.run(async () => {
            await this.loadWidgetDetails(widgetId);
        });
    }

    private clearSelection(): void {
        this.stateStore.clearSelection();
    }

    private async pickWidget(): Promise<void> {
        if (this.pickInProgress) {
            return;
        }

        this.pickInProgress = true;
        this.pushPickState();

        await this.run(async () => {
            const service = this.requireService();
            this.log(`Starting Needle server-side pick. connection=${this.connectionLabel()}`);
            this.setStatus(`正在目标进程内拾取 ${this.connectionLabel()}...`);

            const pickResult = await service.pickWidgets();
            if (!pickResult.accepted || pickResult.widgetIds.length === 0) {
                this.log('Widget picker cancelled by user.');
                this.setStatus('已取消拾取');
                return;
            }

            const primaryWidgetId = pickResult.widgetIds[pickResult.widgetIds.length - 1] || '';
            this.log(`Widget picked. count=${pickResult.widgetIds.length}, primaryWidgetId=${primaryWidgetId}`);

            const latestTree = await service.refreshTree();
            this.syncTreeState(latestTree, false);
            await this.loadWidgetDetails(primaryWidgetId);
            this.postMessage({
                command: 'applyExternalSelection',
                widgetIds: pickResult.widgetIds,
                primaryWidgetId
            });
            this.setStatus(
                pickResult.widgetIds.length > 1
                    ? `已拾取 ${pickResult.widgetIds.length} 个控件`
                    : `已拾取控件 ${primaryWidgetId}`
            );
        }).finally(() => {
            this.pickInProgress = false;
            this.pushPickState();
        });
    }

    private async highlightWidget(widgetId: string): Promise<void> {
        if (!widgetId) {
            return;
        }

        await this.run(async () => {
            this.stateStore.setStatus('正在高亮控件');
            await this.requireService().highlightWidget(widgetId);
            this.log(`Widget highlighted. widgetId=${widgetId}`);
            this.setStatus(`已高亮控件 ${widgetId}`);
            this.postMessage({
                command: 'highlightCompleted',
                widgetId
            });
        });
    }

    private async generateWidgetDef(widgetId: string): Promise<void> {
        if (!widgetId) {
            return;
        }

        await this.run(async () => {
            const widgetDef = await this.requireService().generateWidgetDef(widgetId);
            this.log(
                `widget_def generated. widgetId=${widgetId}, ` +
                `matchCount=${widgetDef.matchCount}, occurrence=${widgetDef.occurrence}`
            );
            this.stateStore.setWidgetDef(widgetId, widgetDef.widgetDef, widgetDef.matchCount, widgetDef.occurrence);
        });
    }

    private async copyWidgetDefs(widgetIds: unknown[]): Promise<void> {
        const normalizedWidgetIds = this.normalizeWidgetIds(widgetIds);
        if (normalizedWidgetIds.length === 0) {
            void vscode.window.showInformationMessage('请先选择要复制的控件。');
            return;
        }

        await this.run(async () => {
            const service = this.requireService();
            const copyTexts: string[] = [];
            for (const widgetId of normalizedWidgetIds) {
                const widgetDef = await service.generateWidgetDef(widgetId);
                const copyText = this.copyService.buildCopyText(widgetDef.widgetDef);
                if (!copyText) {
                    continue;
                }

                copyTexts.push(this.normalizeCopyBlock(copyText));
            }

            if (copyTexts.length === 0) {
                void vscode.window.showInformationMessage('当前选中控件没有可复制的 widget_def 代码块。');
                return;
            }

            await vscode.env.clipboard.writeText(copyTexts.join('\n\n'));
            this.log(`Copied widget_def template blocks for ${copyTexts.length} widget(s).`);
            this.setStatus(`已复制 ${copyTexts.length} 个控件的代码块`);
            void vscode.window.showInformationMessage(`已复制 ${copyTexts.length} 个控件的代码块`);
        });
    }

    private async findWidgets(widgetDefText: string): Promise<void> {
        await this.run(async () => {
            const widgetDef = JSON.parse(widgetDefText) as Record<string, unknown>;
            const results = await this.requireService().searchWidgets(widgetDef);
            this.log(`Search completed. resultCount=${results.length}`);
            this.postMessage({
                command: 'setSearchResults',
                results
            });
        });
    }

    private async run(action: () => Promise<void>): Promise<void> {
        try {
            await action();
        } catch (error) {
            const structuredError = error instanceof StructuredError
                ? error
                : new StructuredError({ error: error instanceof Error ? error.message : String(error) });
            this.log(
                `Request failed. errorType=${structuredError.errorType || 'Unknown'}, ` +
                `error=${structuredError.message || 'Unknown'}`
            );
            this.setStatus(`请求失败: ${structuredError.errorType || 'Unknown'}`);
            this.postMessage({
                command: 'showError',
                error: structuredError.toJSON()
            });
        }
    }

    private pushConnectionState(): void {
        this.postMessage({
            command: 'setConnectionState',
            connection: this.currentConnection || null
        });
    }

    private pushTreeState(): void {
        const treeState = this.stateStore.getTreeState();
        this.postMessage({
            command: 'setTree',
            tree: treeState.tree,
            connectionLabel: treeState.connectionLabel,
            resetState: false
        });
    }

    private pushAutoRefreshState(): void {
        this.postMessage({
            command: 'setAutoRefreshState',
            enabled: this.autoRefreshEnabled,
            intervalSeconds: this.autoRefreshIntervalSeconds
        });
    }

    private pushPickState(): void {
        this.postMessage({
            command: 'setPickState',
            inProgress: this.pickInProgress
        });
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

    /**
     * Webview 重新 resolve 时先释放旧监听和旧引用，避免自动刷新继续命中已销毁的视图。
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

    private setStatus(text: string): void {
        this.stateStore.setStatus(text);
        this.postMessage({
            command: 'setStatus',
            text
        });
    }

    private async loadWidgetDetails(widgetId: string): Promise<void> {
        this.stateStore.setSelection(widgetId);
        const service = this.requireService();
        const [widgetInfo, widgetDef, supportedProperties, supportedSignals, supportedSlots, supportedMethods] = await Promise.all([
            service.getWidgetInfo(widgetId),
            service.generateWidgetDef(widgetId),
            service.getSupportedProperties(widgetId),
            service.getSupportedSignals(widgetId),
            service.getSupportedSlots(widgetId),
            service.getSupportedMethods(widgetId)
        ]);
        this.log(
            `Widget selected. widgetId=${widgetId}, ` +
            `propertyCount=${Object.keys(widgetInfo.properties).length}, matchCount=${widgetDef.matchCount}`
        );
        this.stateStore.setWidgetInfo(widgetId, {
            ...widgetInfo.properties,
            supportedProperties,
            supportedSignals,
            supportedSlots,
            supportedMethods
        });
        this.stateStore.setWidgetDef(widgetId, widgetDef.widgetDef, widgetDef.matchCount, widgetDef.occurrence);
    }

    private syncTreeState(tree: SniffWidgetTreeNode[], resetState: boolean): void {
        this.stateStore.setTree(tree);

        const selectedWidgetId = this.stateStore.getDetailsState().selectedWidgetId;
        if (selectedWidgetId && !this.containsWidget(tree, selectedWidgetId)) {
            this.log(`Selected widget disappeared after refresh. widgetId=${selectedWidgetId}`);
            this.stateStore.clearSelection();
        }

        this.postMessage({
            command: 'setTree',
            tree,
            connectionLabel: this.connectionLabel(),
            resetState
        });
    }

    private updateAutoRefreshState(enabled: boolean, intervalSeconds: number): void {
        this.hasInitializedAutoRefresh = true;
        this.autoRefreshEnabled = enabled;
        this.autoRefreshIntervalSeconds = this.normalizeAutoRefreshInterval(intervalSeconds);
        this.resetAutoRefreshTimer();
        this.log(
            `Auto refresh ${this.autoRefreshEnabled ? 'enabled' : 'disabled'}. ` +
            `intervalSeconds=${this.autoRefreshIntervalSeconds}`
        );
    }

    private normalizeAutoRefreshInterval(intervalSeconds: number): number {
        if (!Number.isFinite(intervalSeconds)) {
            return SniffWebviewProvider.defaultAutoRefreshIntervalSeconds;
        }

        return Math.max(1, Math.min(3600, Math.floor(intervalSeconds)));
    }

    private resetAutoRefreshTimer(): void {
        if (this.autoRefreshTimer) {
            clearInterval(this.autoRefreshTimer);
            this.autoRefreshTimer = undefined;
        }

        if (!this.autoRefreshEnabled) {
            return;
        }

        this.autoRefreshTimer = setInterval(() => {
            if (!this.view?.visible || !this.service) {
                return;
            }

            void this.refresh(false);
        }, this.autoRefreshIntervalSeconds * 1000);
    }

    private normalizeWidgetIds(widgetIds: unknown[]): string[] {
        const normalizedWidgetIds: string[] = [];
        for (const widgetId of widgetIds) {
            if (typeof widgetId !== 'string' || !widgetId || normalizedWidgetIds.includes(widgetId)) {
                continue;
            }

            normalizedWidgetIds.push(widgetId);
        }

        return normalizedWidgetIds;
    }

    private normalizeCopyBlock(copyText: string): string {
        return copyText.startsWith('\n')
            ? copyText.slice(1)
            : copyText;
    }

    private containsWidget(tree: SniffWidgetTreeNode[], widgetId: string): boolean {
        return tree.some(node => node.widgetId === widgetId || this.containsWidget(node.children, widgetId));
    }

    private requireService(): SniffService {
        if (!this.service) {
            throw new StructuredError({
                error: '请先连接 Needle agent。',
                errorType: 'NeedleNotConnected'
            });
        }
        return this.service;
    }

    private async pickLoadAppTarget(defaultTargetExe: string, title = '选择 Needle LoadApp 目标程序'): Promise<string | undefined> {
        const filters: Record<string, string[]> = {};
        filters['Windows Executable'] = ['exe'];
        filters['All Files'] = ['*'];
        const selected = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            defaultUri: this.defaultLoadAppUri(defaultTargetExe),
            filters,
            title
        });
        return selected?.[0]?.fsPath;
    }

    private defaultLoadAppUri(targetExeValue: string): vscode.Uri | undefined {
        const targetExe = targetExeValue.trim();
        if (!targetExe) {
            return undefined;
        }
        return vscode.Uri.file(targetExe);
    }

    private getLoadAppProfiles(): LoadAppProfile[] {
        const rawProfiles = vscode.workspace
            .getConfiguration('path.sniff')
            .get<unknown[]>(SniffWebviewProvider.loadAppProfilesSettingName, []);
        if (!Array.isArray(rawProfiles)) {
            return [];
        }

        const profiles: LoadAppProfile[] = [];
        for (const rawProfile of rawProfiles) {
            if (!this.isRecord(rawProfile)) {
                continue;
            }

            const name = String(rawProfile['name'] || '').trim();
            const targetExe = String(rawProfile['targetExe'] || '').trim();
            const targetArgs = String(rawProfile['targetArgs'] || '');
            if (!name || !targetExe) {
                continue;
            }

            profiles.push({ name, targetExe, targetArgs });
        }

        return profiles;
    }

    private async updateLoadAppProfiles(profiles: LoadAppProfile[]): Promise<void> {
        await vscode.workspace
            .getConfiguration('path.sniff')
            .update(SniffWebviewProvider.loadAppProfilesSettingName, profiles, vscode.ConfigurationTarget.Global);
    }

    private async pickLoadAppProfileFromSettings(
        placeHolder: string,
        profiles = this.getLoadAppProfiles()
    ): Promise<LoadAppProfile | undefined> {
        if (profiles.length === 0) {
            void vscode.window.showInformationMessage('暂无 LoadApp 配置，请先新建。');
            return undefined;
        }

        const picked = await vscode.window.showQuickPick(
            profiles.map(profile => ({
                label: profile.name,
                description: profile.targetExe,
                detail: profile.targetArgs || undefined,
                profile
            })),
            {
                placeHolder,
                matchOnDescription: true,
                matchOnDetail: true
            }
        );
        return picked?.profile;
    }

    private async promptProfileName(title: string, value: string): Promise<string | undefined> {
        const name = await vscode.window.showInputBox({
            title,
            prompt: '配置名会保存到 path.sniff.loadappProfiles。',
            value,
            validateInput: input => input.trim() ? undefined : '请输入配置名'
        });
        return name?.trim();
    }

    private applyLoadAppProfile(profile: LoadAppProfile): void {
        this.postMessage({
            command: 'setLoadAppProfile',
            connection: {
                mode: 'loadapp',
                profileName: profile.name,
                targetExe: profile.targetExe,
                targetArgs: profile.targetArgs
            },
            force: true
        });
    }

    // 将持久化的 LoadApp 配置推送到 Webview，供下拉框和管理弹窗统一渲染。
    private pushLoadAppProfiles(selectedName?: string): void {
        const profiles = this.getLoadAppProfiles();
        this.postMessage({
            command: 'setLoadAppProfiles',
            profiles,
            selectedName: selectedName || undefined
        });
    }

    // 校验并新增或更新 LoadApp 配置，避免重名配置覆盖已有记录。
    private async upsertLoadAppProfileFromManager(
        originalName: string,
        rawProfile: Record<string, unknown>
    ): Promise<void> {
        const name = String(rawProfile['name'] || '').trim();
        const targetExe = String(rawProfile['targetExe'] || '').trim();
        const targetArgs = String(rawProfile['targetArgs'] || '');

        if (!name) {
            void vscode.window.showWarningMessage('请填写 LoadApp 配置名称。');
            return;
        }
        if (!targetExe) {
            void vscode.window.showWarningMessage('请选择或填写 target.exe 路径。');
            return;
        }

        const profiles = this.getLoadAppProfiles();
        const trimmedOriginal = originalName.trim();
        const conflict = profiles.find(profile => profile.name === name && profile.name !== trimmedOriginal);
        if (conflict) {
            void vscode.window.showWarningMessage(`LoadApp 配置 "${name}" 已存在，请换一个名称。`);
            return;
        }

        const nextProfile: LoadAppProfile = { name, targetExe, targetArgs };
        let nextProfiles: LoadAppProfile[];
        if (trimmedOriginal && profiles.some(profile => profile.name === trimmedOriginal)) {
            nextProfiles = profiles.map(profile => profile.name === trimmedOriginal ? nextProfile : profile);
        } else {
            nextProfiles = [...profiles, nextProfile];
        }

        await this.updateLoadAppProfiles(nextProfiles);
        this.pushLoadAppProfiles(name);
        this.setStatus(`已${trimmedOriginal ? '更新' : '保存'} LoadApp 配置 "${name}"`);
    }

    // 从持久化配置中删除指定 LoadApp 配置，并通知 Webview 刷新列表。
    private async removeLoadAppProfileFromManager(name: string): Promise<void> {
        if (!name) {
            return;
        }
        const profiles = this.getLoadAppProfiles();
        if (!profiles.some(profile => profile.name === name)) {
            return;
        }

        await this.updateLoadAppProfiles(profiles.filter(profile => profile.name !== name));
        this.pushLoadAppProfiles();
        this.setStatus(`已删除 LoadApp 配置 "${name}"`);
    }

    // 复用文件选择逻辑，将选中的 target.exe 回填到管理弹窗编辑表单。
    private async pickLoadAppExeForManager(currentPath: string): Promise<void> {
        const picked = await this.pickLoadAppTarget(currentPath, '选择 Needle LoadApp 目标程序');
        if (!picked) {
            return;
        }
        this.postMessage({
            command: 'setLoadAppPickedExe',
            path: picked
        });
    }

    private normalizeLoadAppRequest(request?: SniffConnectionRequest): { targetExe: string; targetArgs: string } {
        return {
            targetExe: String(request?.targetExe || '').trim(),
            targetArgs: String(request?.targetArgs || '')
        };
    }

    private profileNameFromTarget(targetExe: string): string {
        const baseName = path.basename(targetExe, path.extname(targetExe)).trim();
        return baseName || 'LoadApp';
    }

    private isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    private connectionLabel(): string {
        return this.currentConnection?.label || '未连接';
    }

    private log(message: string): void {
        const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`;
        SniffWebviewProvider.outputChannel.appendLine(line);
        this.stateStore.appendLog(message);
    }
}
