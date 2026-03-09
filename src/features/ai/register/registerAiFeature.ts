import * as vscode from 'vscode';
import { processFileWithAI } from '../services/aiService';

export function registerAiFeature(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('eleTreeViewer.aiGeneration', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('请先打开一个测试文件。');
                return;
            }

            await processFileWithAI(editor.document);
        })
    );
}
