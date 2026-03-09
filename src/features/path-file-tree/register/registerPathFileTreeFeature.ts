import * as vscode from 'vscode';
import { TreeItem } from '../../../shared/tree/treeItem';
import { PathFileTreeFeature } from '../models/contracts';
import { PathFileTreeDataProvider } from '../providers/pathFileTreeDataProvider';
import { PathFileTreeCommandService } from '../services/pathFileTreeCommandService';

export function registerPathFileTreeFeature(context: vscode.ExtensionContext): PathFileTreeFeature {
    const dataProvider = new PathFileTreeDataProvider();
    const treeView = vscode.window.createTreeView('pathFileTree', {
        treeDataProvider: dataProvider
    });
    const commandService = new PathFileTreeCommandService(dataProvider, treeView);

    context.subscriptions.push(
        treeView,
        treeView.onDidChangeSelection(event => {
            commandService.setActiveItem(event.selection[0]);
        }),
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (!editor || editor.document.uri.scheme !== 'file') {
                return;
            }

            void commandService.revealFileInTree(editor.document.uri.fsPath);
        }),
        vscode.commands.registerCommand('pathFileTree.refresh', () => {
            commandService.refresh();
        }),
        vscode.commands.registerCommand('pathFileTree.openItem', async (element: TreeItem) => {
            await commandService.openItem(element);
        }),
        vscode.commands.registerCommand('pathFileTree.newFile', async (element?: TreeItem) => {
            await commandService.createNewFile(element);
        }),
        vscode.commands.registerCommand('pathFileTree.newFolder', async (element?: TreeItem) => {
            await commandService.createNewFolder(element);
        }),
        vscode.commands.registerCommand('pathFileTree.rename', async (element?: TreeItem) => {
            await commandService.renameItem(element);
        }),
        vscode.commands.registerCommand('pathFileTree.delete', async (element?: TreeItem) => {
            await commandService.deleteItem(element);
        }),
        vscode.commands.registerCommand('pathFileTree.revealInOS', async (element?: TreeItem) => {
            await commandService.revealInOs(element);
        }),
        vscode.commands.registerCommand('pathFileTree.copyPath', async (element?: TreeItem) => {
            await commandService.copyPath(element);
        }),
        vscode.commands.registerCommand('pathFileTree.copyRelativePath', async (element?: TreeItem) => {
            await commandService.copyRelativePath(element);
        }),
        vscode.commands.registerCommand('pathFileTree.findInFolder', async (element?: TreeItem) => {
            await commandService.findInFolder(element);
        }),
        vscode.commands.registerCommand('pathFileTree.createCase', async (element?: TreeItem) => {
            await commandService.createCaseForItem(element);
        })
    );

    return {
        dataProvider,
        refresh: () => {
            commandService.refresh();
        },
        revealFileInTree: async (filePath: string) => {
            await commandService.revealFileInTree(filePath);
        }
    };
}
