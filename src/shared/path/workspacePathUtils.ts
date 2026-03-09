import * as path from 'path';
import * as vscode from 'vscode';

export const ORDER_FILE_NAME = '.order';

export function isOrderFile(filePath: string): boolean {
    return path.basename(filePath) === ORDER_FILE_NAME;
}

export function isPythonFile(filePath: string): boolean {
    return filePath.endsWith('.py');
}

export function isMethodRelatedPath(filePath: string): boolean {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return false;
    }

    const normalizedPath = path.normalize(filePath).toLowerCase();
    const methodRoot = path.normalize(path.join(workspaceFolder.uri.fsPath, 'method')).toLowerCase();
    return normalizedPath === methodRoot || normalizedPath.startsWith(`${methodRoot}${path.sep}`);
}

export function getWorkspaceRootUri(): vscode.Uri | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri;
}
