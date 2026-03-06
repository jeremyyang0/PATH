
import * as vscode from 'vscode';
import { parseStepsFromFile } from './aiService';
import { getCaseInfo, updateCase } from './zentaoService';

function stripIndex(text: string): string {
    return text.replace(/^\d+[:：]\s*/, '').trim();
}

export async function checkAndSyncZentao(document: vscode.TextDocument, zentaoId: string): Promise<void> {
    console.log(`Checking ZenTao sync for Case #${zentaoId}...`);

    try {
        // 1. 获取本地文件中的步骤
        const localSteps = parseStepsFromFile(document.getText(), { includePreconditions: false });
        if (localSteps.length === 0) {
            console.log('Local file has no steps.');
            return;
        }

        // 2. 获取禅道上的步骤信息
        const remoteCase = await getCaseInfo(zentaoId);
        if (!remoteCase) {
            return; // 获取失败或未配置，已由 service 提示
        }

        // 3. 比较差异
        // 注意：remoteCase.steps 中的描述和预期包含了 "1: " 这样的前缀，需要去除后比较
        // localSteps 中的描述和预期是纯文本，不包含 "1: "

        const remoteSteps = remoteCase.steps || [];

        // 简易比较逻辑：比较数量，然后逐一比较内容
        let hasChanges = false;
        if (localSteps.length !== remoteSteps.length) {
            hasChanges = true;
        } else {
            for (let i = 0; i < localSteps.length; i++) {
                const local = localSteps[i];
                const remote = remoteSteps[i]; // remote cannot be undefined check length equal

                // 去除远程的前缀
                const remoteDesc = stripIndex(remote!.desc);
                const remoteExpect = stripIndex(remote!.expect);

                if (local?.desc !== remoteDesc || local?.expect !== remoteExpect) {
                    hasChanges = true;
                    // Debug info
                    console.log(`Diff at step ${i + 1}:`);
                    console.log(`Local: "${local?.desc}" / "${local?.expect}"`);
                    console.log(`Remote: "${remoteDesc}" / "${remoteExpect}"`);
                    break;
                }
            }
        }

        if (!hasChanges) {
            console.log('No changes detected.');
            return;
        }

        // 4. 询问用户
        const selection = await vscode.window.showInformationMessage(
            `检测到该文件的步骤/预期结果与禅道(ID: ${zentaoId})不一致，是否同步更新到禅道？`,
            '是', '否'
        );

        if (selection === '是') {
            const success = await updateCase(zentaoId, localSteps.map(s => ({
                desc: s.desc,
                expect: s.expect
            })));

            if (success) {
                vscode.window.showInformationMessage(`成功同步用例 #${zentaoId} 到禅道！`);
            }
        }

    } catch (error) {
        console.error('Error in checkAndSyncZentao:', error);
    }
}
