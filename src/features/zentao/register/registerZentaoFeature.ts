import * as path from 'path';
import * as vscode from 'vscode';
import { checkAndSyncZentao } from '../services/zentaoSyncService';

export function createZentaoSaveHandler(): (document: vscode.TextDocument) => Promise<void> {
    return async (document: vscode.TextDocument): Promise<void> => {
        const filePath = document.fileName;
        if (document.languageId !== 'python' && !filePath.endsWith('.py')) {
            return;
        }

        const fileName = path.basename(filePath);
        if (!fileName.startsWith('test_')) {
            return;
        }

        const text = document.getText();
        const idMatch = text.match(/禅道ID[:：\s]*(\d+)/);
        if (!idMatch?.[1]) {
            return;
        }

        await checkAndSyncZentao(document, idMatch[1]);
    };
}
