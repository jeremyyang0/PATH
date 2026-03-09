import * as vscode from 'vscode';
import { SniffFeature } from '../models/contracts';
import { SniffLogsWebviewProvider } from '../providers/sniffLogsWebviewProvider';
import { SniffOverviewWebviewProvider } from '../providers/sniffOverviewWebviewProvider';
import { SniffWebviewProvider } from '../providers/sniffWebviewProvider';
import { SniffViewStateStore } from '../services/sniffViewStateStore';

export function registerSniffFeature(context: vscode.ExtensionContext): SniffFeature {
    const stateStore = new SniffViewStateStore();
    const provider = new SniffWebviewProvider(context.extensionUri, stateStore);
    const overviewProvider = new SniffOverviewWebviewProvider(context.extensionUri, stateStore);
    const logsProvider = new SniffLogsWebviewProvider(context.extensionUri, stateStore);

    context.subscriptions.push(
        stateStore,
        vscode.window.registerWebviewViewProvider(SniffWebviewProvider.viewType, provider),
        vscode.window.registerWebviewViewProvider(SniffOverviewWebviewProvider.viewType, overviewProvider),
        vscode.window.registerWebviewViewProvider(SniffLogsWebviewProvider.viewType, logsProvider),
        stateStore.onDidChangeDetails(() => {
            overviewProvider.pushState();
            logsProvider.pushState();
        }),
        vscode.commands.registerCommand('pathSniffViewer.refresh', async () => {
            await provider.refresh();
        })
    );

    return {
        refresh: () => provider.refresh()
    };
}
