import * as vscode from 'vscode';
import { insertTextAtCursor, openFileAtLine, addOperationToAtomicFile } from './commands';
import { createCase } from './createCase';
import { TreeItem } from './treeItem';
import { SecondaryViewProvider } from './secondaryViewProvider';
import { EleTreeWebviewProvider } from './eleTreeWebviewProvider';
import { MethodsTreeWebviewProvider } from './methodsTreeWebviewProvider';
import { checkAndAddLaunchConfig } from './launchConfig';

export function activate(context: vscode.ExtensionContext): void {
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

    const focusSecondaryViewCommand = vscode.commands.registerCommand('eleSecondaryView.focus', async () => {
        // 显示对应的view container，然后聚焦到specific view
        try {
            await vscode.commands.executeCommand('workbench.view.extension.eleSecondaryViewContainer');
        } catch (error) {
            // 命令可能不存在，忽略错误
            console.log('Secondary view container command not available');
        }
    });

    // 注册创建用例命令
    const createCaseCommand = vscode.commands.registerCommand('eleTreeViewer.createCase', async (uri: vscode.Uri) => {
        await createCase(uri);
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
        dragToEditorCommand,
        openFileCommand,
        addClickOperationCommand,
        addDoubleClickOperationCommand,
        methodsRefreshCommand,
        methodsDragToEditorCommand,
        methodsOpenFileCommand,
        jumpToMethodCommand,
        openSecondaryViewCommand,
        focusSecondaryViewCommand,
        createCaseCommand,
        statusBarItem,
        fileWatcher
    );
    // 初始加载数据（webview自动处理）
    try {
        checkAndAddLaunchConfig();
    } catch (e) {
        console.error('Error initializing launch configuration:', e);
    }

    // 注册Debug Markrunner命令
    const debugMarkrunnerCommand = vscode.commands.registerCommand('eleTreeViewer.debugMarkrunner', async (uri: vscode.Uri) => {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Requires a workspace to debug.');
            return;
        }

        const relativeFile = vscode.workspace.asRelativePath(uri);

        // 获取配置的Launch Config名称
        const config = vscode.workspace.getConfiguration('path.markrunner');
        const contextLaunchConfigName = config.get<string>('contextLaunchConfigName') || 'MarkRunner Context Debug';

        // 检查launch.json中是否存在该配置
        const launchConfig = vscode.workspace.getConfiguration('launch', workspaceFolder.uri);
        const configurations = launchConfig.get<any[]>('configurations') || [];
        const templateExists = configurations.some(c => c.name === contextLaunchConfigName);

        if (templateExists) {
            console.log(`Using custom launch configuration: ${contextLaunchConfigName}`);
            // 使用自定义配置名称启动调试，VS Code会自动替换变量
            // 注意：这里我们不能简单地传递相对路径给launch config，因为launch config是静态的
            // 但是通常自定义launch config会使用 ${file} 或 ${relativeFile}
            // 如果用户想要针对当前右键的文件运行，他们的launch config应该包含 ${file} 或类似变量
            // 我们只需要通过name启动即可
            vscode.debug.startDebugging(workspaceFolder, contextLaunchConfigName);
        } else {
            console.log('Using default internal launch configuration');
            vscode.debug.startDebugging(workspaceFolder, {
                name: "Debug Markrunner File",
                type: "debugpy",
                request: "launch",
                module: "markrunner.cli",
                args: ["run", "-w", "${workspaceFolder}", "-p", relativeFile, "--no-report", "--reruns", "0"],
                console: "integratedTerminal"
            });
        }
    });

    context.subscriptions.push(debugMarkrunnerCommand);

    // 自动显示辅助视图容器（静默处理，不报错）
    /*
    vscode.commands.executeCommand('workbench.view.extension.eleSecondaryViewContainer').then(
        () => { },
        () => console.log('Secondary view container not available at startup')
    );
    */

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