import * as vscode from 'vscode';
import { TreeItem } from '../../../shared/tree/treeItem';
import { MethodsTreeFeature, MethodsTreeFeatureDependencies } from '../models/contracts';
import { MethodsTreeWebviewProvider } from '../providers/methodsTreeWebviewProvider';
import { dragMethodToEditor, jumpToMethod, openMethodFile } from '../services/methodTreeCommandService';

export function registerMethodsTreeFeature(
    context: vscode.ExtensionContext,
    dependencies: MethodsTreeFeatureDependencies
): MethodsTreeFeature {
    const provider = new MethodsTreeWebviewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(MethodsTreeWebviewProvider.viewType, provider),
        vscode.commands.registerCommand('methodsViewer.refresh', () => {
            provider.refresh();
        }),
        vscode.commands.registerCommand('methodsViewer.dragToEditor', (element: TreeItem) => {
            void dragMethodToEditor(element);
        }),
        vscode.commands.registerCommand('methodsViewer.openFile', async (filePath: string, lineNumber: number) => {
            await openMethodFile(filePath, lineNumber, dependencies.revealFileInPathTree);
        }),
        vscode.commands.registerCommand('methodsViewer.jumpToMethod', async (element: TreeItem) => {
            await jumpToMethod(element, dependencies.revealFileInPathTree);
        })
    );

    return {
        refresh: () => {
            provider.refresh();
        }
    };
}
