import * as vscode from 'vscode';
import { SecondaryViewFeature } from '../models/contracts';
import { SecondaryViewProvider } from '../providers/secondaryViewProvider';
import { createSecondaryViewStatusBarItem, focusSecondaryViewContainer } from '../services/secondaryViewCommandService';

export function registerSecondaryViewFeature(context: vscode.ExtensionContext): SecondaryViewFeature {
    const provider = new SecondaryViewProvider(context.extensionUri);
    const statusBarItem = createSecondaryViewStatusBarItem();
    statusBarItem.show();

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SecondaryViewProvider.viewType, provider),
        statusBarItem,
        vscode.commands.registerCommand('eleTreeViewer.openSecondaryView', () => {
            void focusSecondaryViewContainer();
        }),
        vscode.commands.registerCommand('eleSecondaryView.focus', async () => {
            await focusSecondaryViewContainer();
        })
    );

    return {
        focus: async () => {
            await focusSecondaryViewContainer();
            provider.focus();
        }
    };
}
