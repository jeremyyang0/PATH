import * as vscode from 'vscode';
import { insertTextAtCursor, openFileAtLine } from '../../../platform/vscode/editor/editorActions';
import { isEleDefinitionFile, ParsedEleProperty } from '../../../shared/python/elePropertyParser';
import { ElementTreeNode as TreeItem } from '../models/elementTreeNode';
import { EleTreeFeature, EleTreeFeatureDependencies } from '../models/contracts';
import { ElePropertyCodeLensProvider } from '../providers/elePropertyCodeLensProvider';
import { EleTreeWebviewProvider } from '../providers/eleTreeWebviewProvider';
import {
    generateClickMethodsForEleFile,
    generateOperationForEleProperty,
    resolveElePropertyFromEditor
} from '../services/eleEditorOperationService';
import { addOperationToAtomicFile } from '../services/eleTreeOperationService';

export function registerEleTreeFeature(
    context: vscode.ExtensionContext,
    dependencies: EleTreeFeatureDependencies
): EleTreeFeature {
    const provider = new EleTreeWebviewProvider(context.extensionUri);
    const codeLensProvider = new ElePropertyCodeLensProvider();

    context.subscriptions.push(
        provider,
        vscode.window.registerWebviewViewProvider(EleTreeWebviewProvider.viewType, provider),
        vscode.languages.registerCodeLensProvider(
            {
                language: 'python',
                pattern: '**/*_ele.py'
            },
            codeLensProvider
        ),
        vscode.workspace.onDidChangeTextDocument(event => {
            if (isEleDefinitionFile(event.document.uri.fsPath)) {
                codeLensProvider.refresh();
            }
        }),
        vscode.workspace.onDidSaveTextDocument(document => {
            if (isEleDefinitionFile(document.uri.fsPath)) {
                codeLensProvider.refresh();
            }
        }),
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor?.document.uri.scheme === 'file' && isEleDefinitionFile(editor.document.uri.fsPath)) {
                codeLensProvider.refresh();
            }
        }),
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
        vscode.commands.registerCommand('eleTreeViewer.generateClickMethodsForEleFile', (uri?: vscode.Uri) => {
            void generateClickMethodsForEleFile(uri);
        }),
        vscode.commands.registerCommand('eleTreeViewer.jumpToElementInTree', async (property?: ParsedEleProperty) => {
            const resolvedProperty = await resolveElePropertyFromEditor(property);
            if (!resolvedProperty) {
                vscode.window.showWarningMessage('当前属性无法识别为元素树节点。');
                return;
            }

            await provider.revealElementInTree({
                eleFilePath: resolvedProperty.eleFilePath,
                eleVariableName: resolvedProperty.eleVariableName,
                eleLineNumber: resolvedProperty.eleLineNumber
            });
        }),
        vscode.commands.registerCommand('eleTreeViewer.generateClickForEleProperty', (property?: ParsedEleProperty) => {
            void generateOperationForEleProperty('click', property);
        }),
        vscode.commands.registerCommand('eleTreeViewer.generateDoubleClickForEleProperty', (property?: ParsedEleProperty) => {
            void generateOperationForEleProperty('double_click', property);
        }),
        vscode.commands.registerCommand('eleTreeViewer.createCase', async (uri: vscode.Uri) => {
            await vscode.commands.executeCommand('pathFileTree.createCase', uri);
        })
    );

    return {
        refresh: () => {
            provider.refresh();
        }
    };
}
