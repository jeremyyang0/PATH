import * as vscode from 'vscode';
import { agentService } from '../services/agentService';

async function runGeneration(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('Open a Python test file before running Agent Generation.');
        return;
    }

    await agentService.processDocument(editor.document);
}

export function registerAiFeature(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('eleTreeViewer.aiAgentGeneration', async () => {
            await runGeneration();
        })
    );
}
