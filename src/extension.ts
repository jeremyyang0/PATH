import * as path from 'path';
import * as vscode from 'vscode';
import { addOperationToAtomicFile, insertTextAtCursor, openFileAtLine } from './commands';
import { createCase } from './createCase';
import { EleTreeWebviewProvider } from './eleTreeWebviewProvider';
import { checkAndAddLaunchConfig } from './launchConfig';
import { MethodsTreeWebviewProvider } from './methodsTreeWebviewProvider';
import { PathFileTreeDataProvider } from './pathFileTreeDataProvider';
import { SecondaryViewProvider } from './secondaryViewProvider';
import { TreeItem } from './treeItem';
import { processFileWithAI } from './aiService';
import { checkAndSyncZentao } from './zentaoSync';

const ORDER_FILE_NAME = '.order';
let activePathFileTreeItem: TreeItem | undefined;
let pathFileTreeViewRef: vscode.TreeView<TreeItem> | undefined;

function isOrderFile(filePath: string): boolean {
    return path.basename(filePath) === ORDER_FILE_NAME;
}

function isPythonFile(filePath: string): boolean {
    return filePath.endsWith('.py');
}

function isMethodRelatedPath(filePath: string): boolean {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return false;
    }

    const normalizedPath = path.normalize(filePath).toLowerCase();
    const methodRoot = path.normalize(path.join(workspaceFolder.uri.fsPath, 'method')).toLowerCase();
    return normalizedPath === methodRoot || normalizedPath.startsWith(methodRoot + path.sep);
}

function getWorkspaceRootUri(): vscode.Uri | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri;
}

function getPathFileTreeItem(element?: TreeItem): TreeItem | undefined {
    return element ?? activePathFileTreeItem ?? pathFileTreeViewRef?.selection[0];
}

function getPathFileTreeUri(element?: TreeItem): vscode.Uri | undefined {
    const targetItem = getPathFileTreeItem(element);
    if (targetItem?.filePath) {
        return vscode.Uri.file(targetItem.filePath);
    }

    return getWorkspaceRootUri();
}

async function promptForChildPath(parentUri: vscode.Uri, prompt: string, placeHolder: string): Promise<vscode.Uri | undefined> {
    const input = await vscode.window.showInputBox({
        prompt,
        placeHolder,
        ignoreFocusOut: true
    });

    if (!input) {
        return undefined;
    }

    const normalizedInput = input.trim().replace(/[\\/]+/g, path.sep);
    if (!normalizedInput) {
        return undefined;
    }

    return vscode.Uri.file(path.join(parentUri.fsPath, normalizedInput));
}

async function revealFileInPathTree(pathFileTreeDataProvider: PathFileTreeDataProvider, filePath: string): Promise<void> {
    const treeView = pathFileTreeViewRef;
    if (!treeView) {
        return;
    }

    const item = pathFileTreeDataProvider.findItemByPath(filePath);
    if (!item) {
        return;
    }

    try {
        await treeView.reveal(item, {
            select: true,
            focus: false,
            expand: true
        });
        activePathFileTreeItem = item;
    } catch (error) {
        console.error('Failed to reveal item in PATH file tree:', error);
    }
}

export function activate(context: vscode.ExtensionContext): void {
    const secondaryProvider = new SecondaryViewProvider(context.extensionUri);
    const eleTreeWebviewProvider = new EleTreeWebviewProvider(context.extensionUri);
    const methodsTreeWebviewProvider = new MethodsTreeWebviewProvider(context.extensionUri);
    const pathFileTreeDataProvider = new PathFileTreeDataProvider();
    const pathFileTreeView = vscode.window.createTreeView('pathFileTree', {
        treeDataProvider: pathFileTreeDataProvider
    });
    pathFileTreeViewRef = pathFileTreeView;
    const pathFileTreeSelectionListener = pathFileTreeView.onDidChangeSelection(event => {
        activePathFileTreeItem = event.selection[0];
    });

    const refreshEleTree = (): void => {
        eleTreeWebviewProvider.refresh();
    };

    const refreshMethodsTree = (): void => {
        methodsTreeWebviewProvider.refresh();
    };

    const refreshPathFileTree = (): void => {
        pathFileTreeDataProvider.refresh();
    };

    const refreshAllViews = (): void => {
        refreshEleTree();
        refreshMethodsTree();
        refreshPathFileTree();
    };

    const refreshForChangedPath = (changedPath: string): void => {
        if (isPythonFile(changedPath)) {
            refreshEleTree();
        }

        if (isMethodRelatedPath(changedPath)) {
            refreshMethodsTree();
        }

        if (isOrderFile(changedPath)) {
            refreshPathFileTree();
        }
    };

    const refreshForStructureChanges = (changedPaths: string[]): void => {
        let shouldRefreshEleTree = false;
        let shouldRefreshMethodsTree = false;
        let shouldRefreshPathFileTree = changedPaths.length > 0;

        for (const changedPath of changedPaths) {
            if (isPythonFile(changedPath)) {
                shouldRefreshEleTree = true;
            }

            if (isMethodRelatedPath(changedPath)) {
                shouldRefreshMethodsTree = true;
            }

            if (isOrderFile(changedPath)) {
                shouldRefreshPathFileTree = true;
            }
        }

        if (shouldRefreshEleTree) {
            refreshEleTree();
        }

        if (shouldRefreshMethodsTree) {
            refreshMethodsTree();
        }

        if (shouldRefreshPathFileTree) {
            refreshPathFileTree();
        }
    };

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SecondaryViewProvider.viewType, secondaryProvider),
        vscode.window.registerWebviewViewProvider(EleTreeWebviewProvider.viewType, eleTreeWebviewProvider),
        vscode.window.registerWebviewViewProvider(MethodsTreeWebviewProvider.viewType, methodsTreeWebviewProvider),
        pathFileTreeView,
        pathFileTreeSelectionListener
    );

    const refreshCommand = vscode.commands.registerCommand('eleTreeViewer.refresh', () => {
        refreshEleTree();
    });
    const methodsRefreshCommand = vscode.commands.registerCommand('methodsViewer.refresh', () => {
        refreshMethodsTree();
    });
    const pathFileTreeRefreshCommand = vscode.commands.registerCommand('pathFileTree.refresh', () => {
        refreshPathFileTree();
    });
    const pathFileTreeOpenCommand = vscode.commands.registerCommand('pathFileTree.openItem', async (element: TreeItem) => {
        const targetItem = getPathFileTreeItem(element);
        if (targetItem?.filePath && targetItem.nodeType === 'file') {
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(targetItem.filePath));
        }
    });
    const pathFileTreeNewFileCommand = vscode.commands.registerCommand('pathFileTree.newFile', async (element?: TreeItem) => {
        const targetUri = getPathFileTreeUri(element);
        if (!targetUri) {
            return;
        }

        const parentUri = element?.nodeType === 'file'
            ? vscode.Uri.file(path.dirname(targetUri.fsPath))
            : targetUri;
        const newFileUri = await promptForChildPath(parentUri, '输入新文件名', '例如: new_test.py 或 folder/new_test.py');
        if (!newFileUri) {
            return;
        }

        try {
            const parentDirUri = vscode.Uri.file(path.dirname(newFileUri.fsPath));
            await vscode.workspace.fs.createDirectory(parentDirUri);
            await vscode.workspace.fs.writeFile(newFileUri, new Uint8Array());
            refreshPathFileTree();
            await vscode.commands.executeCommand('vscode.open', newFileUri);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`创建文件失败: ${message}`);
        }
    });
    const pathFileTreeNewFolderCommand = vscode.commands.registerCommand('pathFileTree.newFolder', async (element?: TreeItem) => {
        const targetUri = getPathFileTreeUri(element);
        if (!targetUri) {
            return;
        }

        const parentUri = element?.nodeType === 'file'
            ? vscode.Uri.file(path.dirname(targetUri.fsPath))
            : targetUri;
        const newFolderUri = await promptForChildPath(parentUri, '输入新文件夹名', '例如: new_folder 或 parent/new_folder');
        if (!newFolderUri) {
            return;
        }

        try {
            await vscode.workspace.fs.createDirectory(newFolderUri);
            refreshPathFileTree();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`创建文件夹失败: ${message}`);
        }
    });
    const pathFileTreeRenameCommand = vscode.commands.registerCommand('pathFileTree.rename', async (element: TreeItem) => {
        const targetItem = getPathFileTreeItem(element);
        if (!targetItem?.filePath) {
            return;
        }
        const targetUri = vscode.Uri.file(targetItem.filePath);

        const currentName = path.basename(targetUri.fsPath);
        const nextName = await vscode.window.showInputBox({
            prompt: '输入新名称',
            value: currentName,
            ignoreFocusOut: true
        });

        if (!nextName || nextName === currentName) {
            return;
        }

        const renamedUri = vscode.Uri.file(path.join(path.dirname(targetUri.fsPath), nextName.trim()));
        try {
            await vscode.workspace.fs.rename(targetUri, renamedUri, { overwrite: false });
            refreshPathFileTree();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`重命名失败: ${message}`);
        }
    });
    const pathFileTreeDeleteCommand = vscode.commands.registerCommand('pathFileTree.delete', async (element: TreeItem) => {
        const targetItem = getPathFileTreeItem(element);
        if (!targetItem?.filePath) {
            return;
        }
        const targetUri = vscode.Uri.file(targetItem.filePath);

        const itemName = path.basename(targetUri.fsPath);
        const confirmed = await vscode.window.showWarningMessage(
            `确定要删除 ${itemName} 吗？`,
            { modal: true },
            '删除'
        );

        if (confirmed !== '删除') {
            return;
        }

        try {
            await vscode.workspace.fs.delete(targetUri, { recursive: targetItem.nodeType === 'folder', useTrash: true });
            refreshPathFileTree();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`删除失败: ${message}`);
        }
    });
    const pathFileTreeRevealCommand = vscode.commands.registerCommand('pathFileTree.revealInOS', async (element: TreeItem) => {
        const targetItem = getPathFileTreeItem(element);
        if (targetItem?.filePath) {
            await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(targetItem.filePath));
        }
    });
    const pathFileTreeCopyPathCommand = vscode.commands.registerCommand('pathFileTree.copyPath', async (element: TreeItem) => {
        const targetItem = getPathFileTreeItem(element);
        if (targetItem?.filePath) {
            await vscode.env.clipboard.writeText(targetItem.filePath);
        }
    });
    const pathFileTreeCreateCaseCommand = vscode.commands.registerCommand('pathFileTree.createCase', async (element: TreeItem) => {
        const targetItem = getPathFileTreeItem(element);
        if (targetItem?.filePath) {
            await createCase(vscode.Uri.file(targetItem.filePath));
        }
    });
    const pathFileTreeCopyRelativePathCommand = vscode.commands.registerCommand('pathFileTree.copyRelativePath', async (element: TreeItem) => {
        const targetItem = getPathFileTreeItem(element);
        if (!targetItem?.filePath) {
            return;
        }
        const targetUri = vscode.Uri.file(targetItem.filePath);

        const relativePath = vscode.workspace.asRelativePath(targetUri, false);
        await vscode.env.clipboard.writeText(relativePath);
    });
    const pathFileTreeFindInFolderCommand = vscode.commands.registerCommand('pathFileTree.findInFolder', async (element: TreeItem) => {
        const targetItem = getPathFileTreeItem(element);
        if (!targetItem?.filePath) {
            return;
        }
        const targetUri = vscode.Uri.file(targetItem.filePath);

        const searchUri = targetItem.nodeType === 'file'
            ? vscode.Uri.file(path.dirname(targetUri.fsPath))
            : targetUri;
        const relativePath = vscode.workspace.asRelativePath(searchUri, false);
        await vscode.commands.executeCommand('workbench.action.findInFiles', {
            query: '',
            replace: '',
            triggerSearch: true,
            filesToInclude: relativePath
        });
    });

    const dragToEditorCommand = vscode.commands.registerCommand('eleTreeViewer.dragToEditor', (element: TreeItem) => {
        if (element.isLeaf && element.codePath) {
            void insertTextAtCursor(element.codePath);
        } else {
            vscode.window.showInformationMessage('只能拖拽Ele变量到编辑器');
        }
    });

    const methodsDragToEditorCommand = vscode.commands.registerCommand('methodsViewer.dragToEditor', (element: TreeItem) => {
        if (element.isLeaf && element.codePath) {
            void insertTextAtCursor(element.codePath);
        } else {
            vscode.window.showInformationMessage('只能拖拽方法到编辑器');
        }
    });

    const openFileCommand = vscode.commands.registerCommand('eleTreeViewer.openFile', async (filePath: string, lineNumber: number) => {
        await openFileAtLine(filePath, lineNumber);
        await revealFileInPathTree(pathFileTreeDataProvider, filePath);
    });

    const methodsOpenFileCommand = vscode.commands.registerCommand('methodsViewer.openFile', async (filePath: string, lineNumber: number) => {
        await openFileAtLine(filePath, lineNumber);
        await revealFileInPathTree(pathFileTreeDataProvider, filePath);
    });

    const addClickOperationCommand = vscode.commands.registerCommand('eleTreeViewer.addClickOperation', (element: TreeItem) => {
        void addOperationToAtomicFile(element, 'click');
    });

    const addDoubleClickOperationCommand = vscode.commands.registerCommand('eleTreeViewer.addDoubleClickOperation', (element: TreeItem) => {
        void addOperationToAtomicFile(element, 'double_click');
    });

    const jumpToMethodCommand = vscode.commands.registerCommand('methodsViewer.jumpToMethod', async (element: TreeItem) => {
        if (element.methodFilePath && element.methodLine) {
            await openFileAtLine(element.methodFilePath, Number(element.methodLine));
            await revealFileInPathTree(pathFileTreeDataProvider, element.methodFilePath);
        } else {
            vscode.window.showInformationMessage('无法获取方法信息');
        }
    });

    const openSecondaryViewCommand = vscode.commands.registerCommand('eleTreeViewer.openSecondaryView', () => {
        void vscode.commands.executeCommand('eleSecondaryView.focus');
    });

    const focusSecondaryViewCommand = vscode.commands.registerCommand('eleSecondaryView.focus', async () => {
        try {
            await vscode.commands.executeCommand('workbench.view.extension.eleSecondaryViewContainer');
        } catch {
            console.log('Secondary view container command not available');
        }
    });

    const createCaseCommand = vscode.commands.registerCommand('eleTreeViewer.createCase', async (uri: vscode.Uri) => {
        await createCase(uri);
    });

    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = '$(window) 辅助视图';
    statusBarItem.tooltip = '显示 PATH 辅助视图';
    statusBarItem.command = 'eleTreeViewer.openSecondaryView';
    statusBarItem.show();

    const pythonWatcher = vscode.workspace.createFileSystemWatcher('**/*.py');
    pythonWatcher.onDidChange(uri => {
        refreshForChangedPath(uri.fsPath);
    });
    pythonWatcher.onDidCreate(uri => {
        refreshForStructureChanges([uri.fsPath]);
    });
    pythonWatcher.onDidDelete(uri => {
        refreshForStructureChanges([uri.fsPath]);
    });

    const orderWatcher = vscode.workspace.createFileSystemWatcher('**/.order');
    orderWatcher.onDidChange(uri => {
        refreshForChangedPath(uri.fsPath);
    });
    orderWatcher.onDidCreate(uri => {
        refreshForStructureChanges([uri.fsPath]);
    });
    orderWatcher.onDidDelete(uri => {
        refreshForStructureChanges([uri.fsPath]);
    });

    const createFilesListener = vscode.workspace.onDidCreateFiles(event => {
        refreshForStructureChanges(event.files.map(file => file.fsPath));
    });

    const deleteFilesListener = vscode.workspace.onDidDeleteFiles(event => {
        refreshForStructureChanges(event.files.map(file => file.fsPath));
    });

    const renameFilesListener = vscode.workspace.onDidRenameFiles(event => {
        const changedPaths = event.files.flatMap(file => [file.oldUri.fsPath, file.newUri.fsPath]);
        refreshForStructureChanges(changedPaths);
    });

    const configChangeListener = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('files.exclude')) {
            refreshPathFileTree();
        }
    });

    const saveListener = vscode.workspace.onDidSaveTextDocument(async document => {
        const filePath = document.fileName;

        if (isPythonFile(filePath)) {
            refreshForChangedPath(filePath);
        } else if (isOrderFile(filePath)) {
            refreshForChangedPath(filePath);
        }

        if (document.languageId !== 'python' && !isPythonFile(filePath)) {
            return;
        }

        const fileName = path.basename(filePath);
        if (!fileName.startsWith('test_')) {
            return;
        }

        const text = document.getText();
        const idMatch = text.match(/禅道ID[:：]\s*(\d+)/);
        if (!idMatch) {
            return;
        }

        const zentaoId = idMatch[1];
        if (zentaoId) {
            await checkAndSyncZentao(document, zentaoId);
        }
    });

    const aiGenerationCommand = vscode.commands.registerCommand('eleTreeViewer.aiGeneration', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('请先打开一个测试文件');
            return;
        }
        await processFileWithAI(editor.document);
    });

    const debugMarkrunnerCommand = vscode.commands.registerCommand('eleTreeViewer.debugMarkrunner', async (uri: vscode.Uri) => {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Requires a workspace to debug.');
            return;
        }

        const relativeFile = vscode.workspace.asRelativePath(uri);
        const config = vscode.workspace.getConfiguration('path.markrunner');
        const contextLaunchConfigName = config.get<string>('contextLaunchConfigName') || 'MarkRunner Context Debug';
        const launchConfig = vscode.workspace.getConfiguration('launch', workspaceFolder.uri);
        const configurations = launchConfig.get<Array<{ name?: string }>>('configurations') || [];
        const templateExists = configurations.some(item => item.name === contextLaunchConfigName);

        if (templateExists) {
            console.log(`Using custom launch configuration: ${contextLaunchConfigName}`);
            void vscode.debug.startDebugging(workspaceFolder, contextLaunchConfigName);
            return;
        }

        console.log('Using default internal launch configuration');
        void vscode.debug.startDebugging(workspaceFolder, {
            name: 'Debug Markrunner File',
            type: 'debugpy',
            request: 'launch',
            module: 'markrunner.cli',
            args: ['run', '-w', '${workspaceFolder}', '-p', relativeFile, '--no-report', '--reruns', '0'],
            console: 'integratedTerminal'
        });
    });

    context.subscriptions.push(
        refreshCommand,
        dragToEditorCommand,
        openFileCommand,
        addClickOperationCommand,
        addDoubleClickOperationCommand,
        methodsRefreshCommand,
        methodsDragToEditorCommand,
        methodsOpenFileCommand,
        pathFileTreeRefreshCommand,
        pathFileTreeOpenCommand,
        pathFileTreeNewFileCommand,
        pathFileTreeNewFolderCommand,
        pathFileTreeRenameCommand,
        pathFileTreeDeleteCommand,
        pathFileTreeRevealCommand,
        pathFileTreeCopyPathCommand,
        pathFileTreeCopyRelativePathCommand,
        pathFileTreeFindInFolderCommand,
        pathFileTreeCreateCaseCommand,
        jumpToMethodCommand,
        openSecondaryViewCommand,
        focusSecondaryViewCommand,
        createCaseCommand,
        statusBarItem,
        pythonWatcher,
        orderWatcher,
        createFilesListener,
        deleteFilesListener,
        renameFilesListener,
        configChangeListener,
        saveListener,
        aiGenerationCommand,
        debugMarkrunnerCommand
    );

    try {
        checkAndAddLaunchConfig();
    } catch (error) {
        console.error('Error initializing launch configuration:', error);
    }

    setTimeout(() => {
        console.log('Initial refresh on plugin activation...');
        refreshAllViews();
    }, 500);

    console.log('EasyTest plugin activated');
}

export function deactivate(): void {
    console.log('EasyTest plugin deactivated');
}
