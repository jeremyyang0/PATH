import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ZentaoCase } from '../../zentao';

export interface CreateCaseFileDependencies {
    loadZentaoCaseById(caseId: string): Promise<ZentaoCase | null>;
}

/**
 * 根据当前目录与可选的禅道用例信息生成 PATH 测试文件模板。
 */
export async function createCaseFile(
    uri: vscode.Uri,
    dependencies: CreateCaseFileDependencies
): Promise<void> {
    let targetFolder: string;

    if (uri) {
        const stat = await vscode.workspace.fs.stat(uri);
        targetFolder = stat.type === vscode.FileType.Directory ? uri.fsPath : path.dirname(uri.fsPath);
    } else {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('请打开一个工作区文件夹');
            return;
        }
        targetFolder = workspaceFolders[0]!.uri.fsPath;
    }

    const zentaoId = await vscode.window.showInputBox({
        prompt: '请输入禅道ID (可选，回车跳过)',
        placeHolder: '例如: 12345 (留空则创建基础模板)',
        validateInput: (value: string) => {
            if (value && value.trim() !== '' && !/^\d+$/.test(value.trim())) {
                return '禅道ID必须为数字';
            }
            return null;
        }
    });
    if (zentaoId === undefined) {
        return;
    }

    const config = vscode.workspace.getConfiguration('path');
    let appName = config.get<string>('appName');
    if (!appName || appName.trim() === '' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appName.trim())) {
        if (appName && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appName.trim())) {
            vscode.window.showErrorMessage(`配置中的应用名称 "${appName}" 不合法 (必须为英文：字母、数字、下划线，且不能以数字开头)，请检查设置`);
        }

        appName = await vscode.window.showInputBox({
            prompt: '请输入应用名称',
            placeHolder: '例如: Logic, Layout, Router',
            validateInput: (value: string) => {
                if (!value || value.trim() === '') {
                    return '应用名称不能为空';
                }
                if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value.trim())) {
                    return '应用名称必须为英文（字母、数字、下划线，且不能以数字开头）';
                }
                return null;
            }
        });
    }
    if (appName === undefined) {
        return;
    }

    const trimmedId = zentaoId.trim();
    const trimmedAppName = appName.trim();
    let caseInfo: ZentaoCase | null = null;
    if (trimmedId) {
        caseInfo = await dependencies.loadZentaoCaseById(trimmedId);
    }

    const folderName = path.basename(targetFolder);
    const existingFiles = fs.readdirSync(targetFolder);
    const pattern = new RegExp(`^test_${folderName}_(\\d{3})\\.py$`);
    let maxId = 0;
    for (const file of existingFiles) {
        const match = file.match(pattern);
        if (match) {
            const id = parseInt(match[1]!, 10);
            if (id > maxId) {
                maxId = id;
            }
        }
    }

    const nextId = (maxId + 1).toString().padStart(3, '0');
    const testName = `test_${folderName}_${nextId}`;
    const fileName = `${testName}.py`;
    const filePath = path.join(targetFolder, fileName);

    if (fs.existsSync(filePath)) {
        const overwrite = await vscode.window.showWarningMessage(
            `文件 ${fileName} 已存在，是否覆盖？`,
            '覆盖',
            '取消'
        );
        if (overwrite !== '覆盖') {
            return;
        }
    }

    const caseTitle = caseInfo?.title || (trimmedId ? `测试用例 #${trimmedId}` : '测试用例');
    const precondition = caseInfo?.precondition || '';
    const appClassName = `${trimmedAppName.charAt(0).toUpperCase()}${trimmedAppName.slice(1)}`;
    const appVarName = trimmedAppName.toLowerCase();

    const preconditionLines = precondition
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);
    const numberedPreconditionPattern = /^\d+\s*[\.、]\s*(.+)$/;
    const aiPreconditionSteps: string[] = [];
    const preservedPreconditionNotes: string[] = [];

    for (const line of preconditionLines) {
        const numberedMatch = line.match(numberedPreconditionPattern);
        if (numberedMatch?.[1]) {
            aiPreconditionSteps.push(numberedMatch[1].trim());
        } else {
            preservedPreconditionNotes.push(line);
        }
    }

    const preconditionCommentLines: string[] = [];
    if (preservedPreconditionNotes.length > 0) {
        preconditionCommentLines.push(...preservedPreconditionNotes.map(line => `        # 前置条件: ${line}`));
    }
    if (aiPreconditionSteps.length > 0) {
        preconditionCommentLines.push(...aiPreconditionSteps.map((line, index) => `        # 前置步骤 ${index + 1}: ${line}`));
    } else if (!preconditionLines.length) {
        preconditionCommentLines.push('        # TODO: 前置步骤');
    }

    const setupTeardownFixture = `
    @pytest.fixture(autouse=True, scope='function')
    def setup_teardown(self, ${appVarName}: ${appClassName}Export):
${preconditionCommentLines.join('\n')}
        yield
`;

    const stepsComment = caseInfo?.steps && caseInfo.steps.length > 0
        ? caseInfo.steps.map(step => `        # 步骤 ${step.desc}\n        # 预期 ${step.expect}\n        `).join('\n')
        : '        # TODO: 实现逻辑';

    const fileHeader = trimmedId
        ? `# -*- coding: utf-8 -*-
"""
测试用例文件: ${testName}.py
禅道ID: ${trimmedId}
用例标题: ${caseTitle}
"""`
        : `# -*- coding: utf-8 -*-
"""
测试用例文件: ${testName}.py
"""`;

    const fileContent = `${fileHeader}
import pytest
from method.${appVarName} import ${appClassName}Export
from case.base_case import BaseCase

class Test${appClassName}(BaseCase):

${setupTeardownFixture}

    def ${testName}(self, ${appVarName}: ${appClassName}Export):
        """${caseTitle}"""
${stepsComment}
`;

    try {
        fs.writeFileSync(filePath, fileContent, 'utf8');
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document);
        vscode.window.showInformationMessage(`测试用例文件已创建: ${fileName}`);
    } catch (error) {
        vscode.window.showErrorMessage(`创建文件失败: ${error}`);
    }
}
