import * as path from 'path';
import * as vscode from 'vscode';
import { parseStepsFromFile } from '../../ai';
import { GetZentaoCase } from '../application/use-cases/get-zentao-case';
import { LoadMyZentaoWorkItems } from '../application/use-cases/load-my-zentao-work-items';
import { LoginZentao } from '../application/use-cases/login-zentao';
import { SyncCaseStepsFromDocument } from '../application/use-cases/sync-case-steps-from-document';
import { UpdateZentaoCaseSteps } from '../application/use-cases/update-zentao-case-steps';
import { VscodeZentaoConfigProvider } from '../infrastructure/config/vscode-zentao-config-provider';
import { ZentaoRestGateway } from '../infrastructure/http/zentao-rest-gateway';
import { VscodeSecretCredentialStore } from '../infrastructure/secrets/vscode-secret-credential-store';
import { ZentaoTreeController } from '../presentation/tree/zentao-tree-controller';
import { ZentaoTreeDataProvider } from '../presentation/tree/zentao-tree-data-provider';
import { ZentaoNode } from '../presentation/tree/zentao-node';

export interface RegisteredZentaoModule {
    getCase(caseId: string): Promise<import('../domain/zentao-case').ZentaoCase | null>;
    onPythonTestFileSaved(document: vscode.TextDocument): Promise<void>;
}

function extractZentaoId(text: string): string | null {
    const match = text.match(/禅道ID[:：\s]*(\d+)/);
    return match?.[1] || null;
}

async function resolveLoginPassword(configProvider: VscodeZentaoConfigProvider): Promise<{
    baseUrl: string;
    account: string;
    password: string;
} | null> {
    const config = await configProvider.read();
    if (!config) {
        void vscode.window.showWarningMessage('请先在 PATH 设置中配置禅道地址和用户名。');
        return null;
    }

    if (!config.password) {
        void vscode.window.showWarningMessage('请先在 PATH 设置中配置禅道密码。');
        return null;
    }

    return {
        baseUrl: config.baseUrl,
        account: config.account,
        password: config.password
    };
}

export function registerZentaoModule(context: vscode.ExtensionContext): RegisteredZentaoModule {
    const configProvider = new VscodeZentaoConfigProvider();
    const credentialStore = new VscodeSecretCredentialStore(context.secrets);
    const gateway = new ZentaoRestGateway();
    const loginZentao = new LoginZentao(gateway);
    const getZentaoCase = new GetZentaoCase(gateway, configProvider);
    const updateCaseSteps = new UpdateZentaoCaseSteps(gateway, configProvider);
    const syncCaseSteps = new SyncCaseStepsFromDocument(getZentaoCase, updateCaseSteps);
    const loadMyWorkItems = new LoadMyZentaoWorkItems(gateway, configProvider);
    const treeController = new ZentaoTreeController(loadMyWorkItems);
    const treeDataProvider = new ZentaoTreeDataProvider(treeController);
    const treeView = vscode.window.createTreeView('pathZentaoTree', {
        treeDataProvider
    });
    treeController.clear();

    const refreshTree = async (): Promise<void> => {
        try {
            await treeController.refresh();
        } catch (error) {
            treeController.showError(error instanceof Error ? error.message : String(error));
            void vscode.window.showWarningMessage(`刷新禅道工单失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    context.subscriptions.push(
        treeDataProvider,
        treeView,
        vscode.commands.registerCommand('pathZentaoTree.refresh', async () => {
            await refreshTree();
        }),
        vscode.commands.registerCommand('pathZentaoTree.login', async () => {
            const input = await resolveLoginPassword(configProvider);
            if (!input) {
                return;
            }

            try {
                await loginZentao.execute(input);
                void vscode.window.showInformationMessage('禅道登录成功。');
                await refreshTree();
            } catch (error) {
                void vscode.window.showErrorMessage(`禅道登录失败: ${error instanceof Error ? error.message : String(error)}`);
            }
        }),
        vscode.commands.registerCommand('pathZentaoTree.logout', async () => {
            await credentialStore.clear();
            treeController.clear();
            void vscode.window.showInformationMessage('已清除 PATH 插件旧版保存的禅道会话。');
        }),
        vscode.commands.registerCommand('pathZentaoTree.openItem', async (node: ZentaoNode) => {
            if (!node.item.url) {
                void vscode.window.showWarningMessage('当前工单没有可打开的链接。');
                return;
            }

            await vscode.env.openExternal(vscode.Uri.parse(node.item.url));
        }),
        treeView.onDidChangeVisibility(() => {
            if (treeView.visible) {
                void refreshTree();
            }
        }),
        treeView.onDidChangeSelection(event => {
            const selectedNode = event.selection[0];
            if (selectedNode) {
                void vscode.commands.executeCommand('setContext', 'pathZentaoTree.hasSelection', true);
            }
        })
    );

    return {
        getCase: async (caseId: string) => {
            try {
                return await getZentaoCase.execute(caseId);
            } catch (error) {
                void vscode.window.showErrorMessage(`获取禅道用例失败: ${error instanceof Error ? error.message : String(error)}`);
                return null;
            }
        },
        onPythonTestFileSaved: async (document: vscode.TextDocument) => {
            const filePath = document.fileName;
            if (document.languageId !== 'python' && !filePath.endsWith('.py')) {
                return;
            }

            if (!path.basename(filePath).startsWith('test_')) {
                return;
            }

            const caseId = extractZentaoId(document.getText());
            if (!caseId) {
                return;
            }

            const localSteps = parseStepsFromFile(document.getText(), { includePreconditions: false });
            try {
                await syncCaseSteps.execute(caseId, localSteps, {
                    approve: async currentCaseId => {
                        const selection = await vscode.window.showInformationMessage(
                            `检测到该文件的步骤/预期结果与禅道(ID: ${currentCaseId})不一致，是否同步更新到禅道？`,
                            '是',
                            '否'
                        );
                        return selection === '是';
                    },
                    notifySynced: async currentCaseId => {
                        void vscode.window.showInformationMessage(`成功同步用例 #${currentCaseId} 到禅道！`);
                    }
                });
            } catch (error) {
                console.error('Error in Zentao sync handler:', error);
            }
        }
    };
}
