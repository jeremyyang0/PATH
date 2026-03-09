import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ZentaoCaseInfo } from '../../features/zentao/models/zentaoModels';
import { getCaseInfo } from '../../features/zentao/services/zentaoService';

/**
 * 创建测试用例文件
 * @param uri 右键点击的文件夹URI
 */
export async function createCase(uri: vscode.Uri): Promise<void> {
    // 获取目标文件夹路径
    let targetFolder: string;

    if (uri) {
        // 如果是右键点击文件夹，使用该文件夹
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type === vscode.FileType.Directory) {
            targetFolder = uri.fsPath;
        } else {
            // 如果点击的是文件，使用其所在文件夹
            targetFolder = path.dirname(uri.fsPath);
        }
    } else {
        // 如果没有传入URI，尝试使用工作区根目录
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('请打开一个工作区文件夹');
            return;
        }
        targetFolder = workspaceFolders[0]!.uri.fsPath;
    }

    // 弹出输入框，要求输入禅道ID
    const zentaoId = await vscode.window.showInputBox({
        prompt: '请输入禅道ID (可选，回车跳过)',
        placeHolder: '例如: 12345 (留空则创建基础模板)',
        validateInput: (value: string) => {
            if (value && value.trim() !== '') {
                if (!/^\d+$/.test(value.trim())) {
                    return '禅道ID必须为数字';
                }
            }
            return null;
        }
    });

    // 用户取消输入
    if (zentaoId === undefined) {
        return;
    }

    // 获取配置中的应用名称
    const config = vscode.workspace.getConfiguration('path');
    let appName = config.get<string>('appName');

    // 如果配置中没有应用名称，或者为空，则弹出输入框
    if (!appName || appName.trim() === '') {
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
    } else {
        // 验证配置中的应用名称是否合法
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appName.trim())) {
            vscode.window.showErrorMessage(`配置中的应用名称 "${appName}" 不合法 (必须为英文：字母、数字、下划线，且不能以数字开头)，请检查设置`);
            // 如果不合法，还是弹出输入框让用户输入
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
    }


    // 用户取消输入
    if (appName === undefined) {
        return;
    }

    const trimmedId = zentaoId.trim();
    const trimmedAppName = appName.trim();

    // 尝试从禅道获取用例信息（仅当有ID时）
    let caseInfo: ZentaoCaseInfo | null = null;
    if (trimmedId) {
        try {
            caseInfo = await getCaseInfo(trimmedId);
        } catch (error) {
            console.log('获取禅道用例信息失败:', error);
        }
    }

    // 获取文件夹名称
    const folderName = path.basename(targetFolder);

    // 查找现有文件，计算自增ID
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

    // 检查文件是否已存在
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

    // 构建用例标题和前置条件
    const caseTitle = caseInfo?.title || (trimmedId ? `测试用例 #${trimmedId}` : '测试用例');
    const precondition = caseInfo?.precondition || '';
    const appClassName = `${trimmedAppName.charAt(0).toUpperCase()}${trimmedAppName.slice(1)}`;
    const appVarName = trimmedAppName.toLowerCase();

    // 前置条件按换行拆分：
    // - 仅将 "1.xxx" / "1、xxx" 这类编号行转换为 AI 可识别的前置步骤
    // - 其他行保留为普通注释，不参与 AI 步骤生成
    const preconditionLines = precondition
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);

    const numberedPreconditionPattern = /^\d+\s*[\.、]\s*(.+)$/;
    const aiPreconditionSteps: string[] = [];
    const preservedPreconditionNotes: string[] = [];

    for (const line of preconditionLines) {
        const numberedMatch = line.match(numberedPreconditionPattern);
        if (numberedMatch) {
            const cleanedLine = numberedMatch[1]?.trim();
            if (cleanedLine) {
                aiPreconditionSteps.push(cleanedLine);
            }
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

    const preconditionStepsComment = preconditionCommentLines.join('\n');

    const setupTeardownFixture = `
    @pytest.fixture(autouse=True, scope='function')
    def setup_teardown(self, ${appVarName}: ${appClassName}Export):
${preconditionStepsComment}
        yield
`;

    // 构建步骤注释
    let stepsComment = '';
    if (caseInfo?.steps && caseInfo.steps.length > 0) {
        const stepsLines = caseInfo.steps.map(step => {
            return `        # 步骤 ${step.desc}\n        # 预期 ${step.expect}\n        `;
        });
        stepsComment = stepsLines.join('\n');
    } else {
        stepsComment = '        # TODO: 实现逻辑';
    }

    // 创建测试用例文件内容
    let fileContent = '';

    if (trimmedId) {
        // 完整模板（有禅道ID）
        fileContent = `# -*- coding: utf-8 -*-
"""
测试用例文件: ${testName}.py
禅道ID: ${trimmedId}
用例标题: ${caseTitle}
"""
import pytest
from method.${appVarName} import ${appClassName}Export
from case.base_case import BaseCase

class Test${appClassName}(BaseCase):

${setupTeardownFixture}

    def ${testName}(self, ${appVarName}: ${appClassName}Export):
        """${caseTitle}"""
${stepsComment}
`;
    } else {
        // 最小模板（无禅道ID）
        fileContent = `# -*- coding: utf-8 -*-
"""
测试用例文件: ${testName}.py
"""
import pytest
from method.${appVarName} import ${appClassName}Export
from case.base_case import BaseCase

class Test${appClassName}(BaseCase):

${setupTeardownFixture}

    def ${testName}(self, ${appVarName}: ${appClassName}Export):
        """${caseTitle}"""
${stepsComment}
`;
    }

    try {
        // 写入文件
        fs.writeFileSync(filePath, fileContent, 'utf8');

        // 打开创建的文件
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document);

        vscode.window.showInformationMessage(`测试用例文件已创建: ${fileName}`);
    } catch (error) {
        vscode.window.showErrorMessage(`创建文件失败: ${error}`);
    }
}
