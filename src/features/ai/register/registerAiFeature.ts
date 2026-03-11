import * as vscode from 'vscode';
import { processFileWithAI } from '../services/aiService';
import { agentService } from '../services/agentService';

async function runGeneration(forceAgent: boolean): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('Open a Python test file before running AI generation.');
        return;
    }

    const agentEnabled = vscode.workspace.getConfiguration('path.ai.agent').get<boolean>('enabled') ?? true;
    if (forceAgent || agentEnabled) {
        await agentService.processDocument(editor.document);
        return;
    }

    await processFileWithAI(editor.document);
}

export function registerAiFeature(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('eleTreeViewer.aiGeneration', async () => {
            await runGeneration(false);
        }),
        vscode.commands.registerCommand('eleTreeViewer.aiAgentGeneration', async () => {
            await runGeneration(true);
        })
    );
}
