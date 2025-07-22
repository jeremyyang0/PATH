import * as vscode from 'vscode';
import { EleTreeDataProvider } from './eleTreeDataProvider';
import { insertTextAtCursor, openFileAtLine, addOperationToAtomicFile } from './commands';
import { TreeItem } from './treeItem';

export function activate(context: vscode.ExtensionContext): void {
    const provider = new EleTreeDataProvider();
    // 注册树形视图
    const treeView = vscode.window.createTreeView('eleTreeViewer', {
        treeDataProvider: provider,
        showCollapseAll: true,
        dragAndDropController: provider.dragAndDropController
    });
    // 注册命令
    const refreshCommand = vscode.commands.registerCommand('eleTreeViewer.refresh', () => {
        provider.refresh();
    });
    const expandAllCommand = vscode.commands.registerCommand('eleTreeViewer.expandAll', () => {
        provider.expandAll();
    });
    const collapseAllCommand = vscode.commands.registerCommand('eleTreeViewer.collapseAll', () => {
        provider.collapseAll();
    });
    const dragToEditorCommand = vscode.commands.registerCommand('eleTreeViewer.dragToEditor', (element: TreeItem) => {
        if (element.isLeaf && element.codePath) {
            insertTextAtCursor(element.codePath);
        } else {
            vscode.window.showInformationMessage('只能拖拽Ele变量到编辑器');
        }
    });
    const searchCommand = vscode.commands.registerCommand('eleTreeViewer.search', () => {
        provider.search();
    });
    const clearSearchCommand = vscode.commands.registerCommand('eleTreeViewer.clearSearch', () => {
        provider.clearSearch();
    });
    const openFileCommand = vscode.commands.registerCommand('eleTreeViewer.openFile', async (filePath: string, lineNumber: number) => {
        await openFileAtLine(filePath, lineNumber);
    });
    const addClickOperationCommand = vscode.commands.registerCommand('eleTreeViewer.addClickOperation', (element: TreeItem) => {
        addOperationToAtomicFile(element, 'click');
    });
    const addDoubleClickOperationCommand = vscode.commands.registerCommand('eleTreeViewer.addDoubleClickOperation', (element: TreeItem) => {
        addOperationToAtomicFile(element, 'double_click');
    });
    // 监听文件变化
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.py');
    fileWatcher.onDidChange(() => provider.refresh());
    fileWatcher.onDidCreate(() => provider.refresh());
    fileWatcher.onDidDelete(() => provider.refresh());
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
        fileWatcher
    );
    // 初始加载数据
    provider.loadData();
    console.log('Ele Tree Viewer插件已激活');
}

export function deactivate(): void {
    console.log('Ele Tree Viewer插件已停用');
} 