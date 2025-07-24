import * as vscode from 'vscode';
import { EleTreeDataProvider } from './eleTreeDataProvider';
import { insertTextAtCursor, openFileAtLine, addOperationToAtomicFile } from './commands';
import { TreeItem } from './treeItem';
import { MethodsDataProvider } from './methodsDataProvider';
import { SecondaryViewProvider } from './secondaryViewProvider';

export function activate(context: vscode.ExtensionContext): void {
    const provider = new EleTreeDataProvider();
    const methodsProvider = new MethodsDataProvider();
    const secondaryProvider = new SecondaryViewProvider(context.extensionUri);
    // 注册树形视图
    const treeView = vscode.window.createTreeView('eleTreeViewer', {
        treeDataProvider: provider,
        showCollapseAll: true,
        dragAndDropController: provider.dragAndDropController
    });
    const methodsView = vscode.window.createTreeView('methodsViewer', {
        treeDataProvider: methodsProvider,
        showCollapseAll: true,
        dragAndDropController: methodsProvider.dragAndDropController
    });

    // 注册webview视图提供者
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SecondaryViewProvider.viewType, secondaryProvider)
    );
    // 注册命令
    const refreshCommand = vscode.commands.registerCommand('eleTreeViewer.refresh', () => {
        provider.refresh();
    });
    const methodsRefreshCommand = vscode.commands.registerCommand('methodsViewer.refresh', () => {
        methodsProvider.refresh();
    });
    const expandAllCommand = vscode.commands.registerCommand('eleTreeViewer.expandAll', () => {
        provider.expandAll();
    });
    const methodsExpandAllCommand = vscode.commands.registerCommand('methodsViewer.expandAll', () => {
        methodsProvider.expandAll();
    });
    const collapseAllCommand = vscode.commands.registerCommand('eleTreeViewer.collapseAll', () => {
        provider.collapseAll();
    });
    const methodsCollapseAllCommand = vscode.commands.registerCommand('methodsViewer.collapseAll', () => {
        methodsProvider.collapseAll();
    });
    const dragToEditorCommand = vscode.commands.registerCommand('eleTreeViewer.dragToEditor', (element: TreeItem) => {
        if (element.isLeaf && element.codePath) {
            insertTextAtCursor(element.codePath);
        } else {
            vscode.window.showInformationMessage('只能拖拽Ele变量到编辑器');
        }
    });
    const methodsDragToEditorCommand = vscode.commands.registerCommand('methodsViewer.dragToEditor', (element: TreeItem) => {
        if (element.isLeaf && element.codePath) {
            insertTextAtCursor(element.codePath);
        } else {
            vscode.window.showInformationMessage('只能拖拽方法到编辑器');
        }
    });
    const searchCommand = vscode.commands.registerCommand('eleTreeViewer.search', () => {
        provider.search();
    });
    const methodsSearchCommand = vscode.commands.registerCommand('methodsViewer.search', () => {
        methodsProvider.search();
    });
    const clearSearchCommand = vscode.commands.registerCommand('eleTreeViewer.clearSearch', () => {
        provider.clearSearch();
    });
    const methodsClearSearchCommand = vscode.commands.registerCommand('methodsViewer.clearSearch', () => {
        methodsProvider.clearSearch();
    });
    const openFileCommand = vscode.commands.registerCommand('eleTreeViewer.openFile', async (filePath: string, lineNumber: number) => {
        await openFileAtLine(filePath, lineNumber);
    });
    const methodsOpenFileCommand = vscode.commands.registerCommand('methodsViewer.openFile', async (filePath: string, lineNumber: number) => {
        await openFileAtLine(filePath, lineNumber);
    });
    const addClickOperationCommand = vscode.commands.registerCommand('eleTreeViewer.addClickOperation', (element: TreeItem) => {
        addOperationToAtomicFile(element, 'click');
    });
    const addDoubleClickOperationCommand = vscode.commands.registerCommand('eleTreeViewer.addDoubleClickOperation', (element: TreeItem) => {
        addOperationToAtomicFile(element, 'double_click');
    });
    const jumpToMethodCommand = vscode.commands.registerCommand('methodsViewer.jumpToMethod', async (element: TreeItem) => {
        if (element.methodFilePath && element.methodLine) {
            await openFileAtLine(element.methodFilePath, element.methodLine);
        } else {
            vscode.window.showInformationMessage('无法获取方法信息');
        }
    });

    const openSecondaryViewCommand = vscode.commands.registerCommand('eleTreeViewer.openSecondaryView', () => {
        vscode.commands.executeCommand('eleSecondaryView.focus');
    });

    const focusSecondaryViewCommand = vscode.commands.registerCommand('eleSecondaryView.focus', () => {
        secondaryProvider.focus();
    });

    // 创建状态栏按钮
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(window) 辅助视图";
    statusBarItem.tooltip = "显示Ele Tree辅助视图";
    statusBarItem.command = 'eleTreeViewer.openSecondaryView';
    
    // 默认显示状态栏按钮
    statusBarItem.show();
    // 监听文件变化
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.py');
    fileWatcher.onDidChange(() => {
        provider.refresh();
        methodsProvider.refresh();
    });
    fileWatcher.onDidCreate(() => {
        provider.refresh();
        methodsProvider.refresh();
    });
    fileWatcher.onDidDelete(() => {
        provider.refresh();
        methodsProvider.refresh();
    });

    // 添加到订阅列表
    context.subscriptions.push(
        treeView,
        refreshCommand,
        expandAllCommand,
        collapseAllCommand,
        dragToEditorCommand,
        searchCommand,
        clearSearchCommand,
        openFileCommand,
        addClickOperationCommand,
        addDoubleClickOperationCommand,
        methodsView,
        methodsRefreshCommand,
        methodsExpandAllCommand,
        methodsCollapseAllCommand,
        methodsDragToEditorCommand,
        methodsSearchCommand,
        methodsClearSearchCommand,
        methodsOpenFileCommand,
        jumpToMethodCommand,
        openSecondaryViewCommand,
        focusSecondaryViewCommand,
        statusBarItem,
        fileWatcher
    );
    // 初始加载数据
    provider.loadData();
    methodsProvider.loadData();
    
    // 自动显示辅助视图容器
    vscode.commands.executeCommand('workbench.view.extension.eleSecondaryViewContainer');
    
    console.log('EasyTest插件已激活');
}

export function deactivate(): void {
    console.log('EasyTest插件已停用');
} 