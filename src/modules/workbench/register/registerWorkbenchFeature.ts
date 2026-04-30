import * as vscode from 'vscode';
import { LaunchConfigurationItem } from '../models/contracts';
import { checkAndAddLaunchConfig } from '../services/launchConfigService';

export function registerWorkbenchFeature(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('eleTreeViewer.debugMarkrunner', async (uri: vscode.Uri) => {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('调试命令必须在工作区内执行。');
                return;
            }

            const relativeFile = vscode.workspace.asRelativePath(uri);
            const config = vscode.workspace.getConfiguration('path.markrunner');
            const contextLaunchConfigName = config.get<string>('contextLaunchConfigName') || 'MarkRunner Context Debug';
            const launchConfig = vscode.workspace.getConfiguration('launch', workspaceFolder.uri);
            const configurations = launchConfig.get<LaunchConfigurationItem[]>('configurations') || [];
            const templateExists = configurations.some(item => item.name === contextLaunchConfigName);

            if (templateExists) {
                void vscode.debug.startDebugging(workspaceFolder, contextLaunchConfigName);
                return;
            }

            // 没有模板时直接按当前文件起一个临时调试配置，保证命令可用。
            void vscode.debug.startDebugging(workspaceFolder, {
                name: 'Debug Markrunner File',
                type: 'debugpy',
                request: 'launch',
                module: 'markrunner.cli',
                args: ['run', '-w', '${workspaceFolder}', '-p', relativeFile, '--no-report', '--reruns', '0'],
                console: 'integratedTerminal'
            });
        })
    );

    try {
        void checkAndAddLaunchConfig();
    } catch (error) {
        console.error('Error initializing launch configuration:', error);
    }
}
