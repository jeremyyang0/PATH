import * as vscode from 'vscode';

export function createSecondaryViewStatusBarItem(): vscode.StatusBarItem {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = '$(window) 辅助视图';
    statusBarItem.tooltip = '打开 PATH 辅助视图';
    statusBarItem.command = 'eleTreeViewer.openSecondaryView';
    return statusBarItem;
}

export async function focusSecondaryViewContainer(): Promise<void> {
    try {
        await vscode.commands.executeCommand('workbench.view.extension.eleSecondaryViewContainer');
    } catch {
        console.log('Secondary view container command not available');
    }
}
