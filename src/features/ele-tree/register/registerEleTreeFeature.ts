import * as vscode from 'vscode';
import { createCase } from '../../../shared/case/createCase';
import { insertTextAtCursor, openFileAtLine } from '../../../shared/editor/editorActions';
import { TreeItem } from '../../../shared/tree/treeItem';
import { EleTreeFeature, EleTreeFeatureDependencies } from '../models/contracts';
import { EleTreeWebviewProvider } from '../providers/eleTreeWebviewProvider';
import { addOperationToAtomicFile } from '../services/eleTreeOperationService';

export function registerEleTreeFeature(
    context: vscode.ExtensionContext,
    dependencies: EleTreeFeatureDependencies
): EleTreeFeature {
    const provider = new EleTreeWebviewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(EleTreeWebviewProvider.viewType, provider),
        vscode.commands.registerCommand('eleTreeViewer.refresh', () => {
            provider.refresh();
        }),
        vscode.commands.registerCommand('eleTreeViewer.dragToEditor', (element: TreeItem) => {
            if (element.isLeaf && element.codePath) {
                void insertTextAtCursor(element.codePath);
                return;
            }

            vscode.window.showInformationMessage('只能拖拽元素节点到编辑器。');
        }),
        vscode.commands.registerCommand('eleTreeViewer.openFile', async (filePath: string, lineNumber: number) => {
            await openFileAtLine(filePath, lineNumber);
            await dependencies.revealFileInPathTree(filePath);
        }),
        vscode.commands.registerCommand('eleTreeViewer.addClickOperation', (element: TreeItem) => {
            void addOperationToAtomicFile(element, 'click');
        }),
        vscode.commands.registerCommand('eleTreeViewer.addDoubleClickOperation', (element: TreeItem) => {
            void addOperationToAtomicFile(element, 'double_click');
        }),
        vscode.commands.registerCommand('eleTreeViewer.createCase', async (uri: vscode.Uri) => {
            await createCase(uri);
        })
    );

    return {
        refresh: () => {
            provider.refresh();
        }
    };
}
