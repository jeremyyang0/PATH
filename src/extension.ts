import * as vscode from 'vscode';
import { EleTreeDataProvider } from './eleTreeDataProvider';
import { insertTextAtCursor, openFileAtLine, addOperationToAtomicFile } from './commands';
import { TreeItem } from './treeItem';
import { MethodsDataProvider } from './methodsDataProvider';
import { SecondaryViewProvider } from './secondaryViewProvider';
import { EleTreeWebviewProvider } from './eleTreeWebviewProvider';
import { MethodsTreeWebviewProvider } from './methodsTreeWebviewProvider';

export function activate(context: vscode.ExtensionContext): void {
    const provider = new EleTreeDataProvider();
    const methodsProvider = new MethodsDataProvider();
    const secondaryProvider = new SecondaryViewProvider(context.extensionUri);
    const eleTreeWebviewProvider = new EleTreeWebviewProvider(context.extensionUri);
    const methodsTreeWebviewProvider = new MethodsTreeWebviewProvider(context.extensionUri);

    // 注册webview视图提供者
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SecondaryViewProvider.viewType, secondaryProvider),
        vscode.window.registerWebviewViewProvider(EleTreeWebviewProvider.viewType, eleTreeWebviewProvider),
        vscode.window.registerWebviewViewProvider(MethodsTreeWebviewProvider.viewType, methodsTreeWebviewProvider)
    );


    // 注册命令
    const refreshCommand = vscode.commands.registerCommand('eleTreeViewer.refresh', () => {
        eleTreeWebviewProvider.refresh();
    });
    const methodsRefreshCommand = vscode.commands.registerCommand('methodsViewer.refresh', () => {
        methodsTreeWebviewProvider.refresh();
    });
    const expandAllCommand = vscode.commands.registerCommand('eleTreeViewer.expandAll', () => {
        // Webview处理展开逻辑
    });
    const methodsExpandAllCommand = vscode.commands.registerCommand('methodsViewer.expandAll', () => {
        // Webview处理展开逻辑
    });
    const collapseAllCommand = vscode.commands.registerCommand('eleTreeViewer.collapseAll', () => {
        // Webview处理收起逻辑
    });
    const methodsCollapseAllCommand = vscode.commands.registerCommand('methodsViewer.collapseAll', () => {
        // Webview处理收起逻辑
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
        // Webview内部处理搜索
    });
    const methodsSearchCommand = vscode.commands.registerCommand('methodsViewer.search', () => {
        // Webview内部处理搜索
    });
    const clearSearchCommand = vscode.commands.registerCommand('eleTreeViewer.clearSearch', () => {
        // Webview内部处理清除搜索
    });
    const methodsClearSearchCommand = vscode.commands.registerCommand('methodsViewer.clearSearch', () => {
        // Webview内部处理清除搜索
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
        // 显示对应的view container，然后聚焦到specific view
        vscode.commands.executeCommand('workbench.view.extension.eleSecondaryViewContainer');
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
        eleTreeWebviewProvider.refresh();
        methodsTreeWebviewProvider.refresh();
    });
    fileWatcher.onDidCreate(() => {
        eleTreeWebviewProvider.refresh();
        methodsTreeWebviewProvider.refresh();
    });
    fileWatcher.onDidDelete(() => {
        eleTreeWebviewProvider.refresh();
        methodsTreeWebviewProvider.refresh();
    });

    // 添加到订阅列表
    context.subscriptions.push(
        refreshCommand,
        expandAllCommand,
        collapseAllCommand,
        dragToEditorCommand,
        searchCommand,
        clearSearchCommand,
        openFileCommand,
        addClickOperationCommand,
        addDoubleClickOperationCommand,
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
    // 初始加载数据（webview自动处理）
    
    // 自动显示辅助视图容器
    vscode.commands.executeCommand('workbench.view.extension.eleSecondaryViewContainer');
    
    // 插件激活时进行一次初始刷新
    setTimeout(() => {
        console.log('Initial refresh on plugin activation...');
        eleTreeWebviewProvider.refresh();
        methodsTreeWebviewProvider.refresh();
    }, 500);
    
    console.log('EasyTest插件已激活');
}

export function deactivate(): void {
    console.log('EasyTest插件已停用');
} 