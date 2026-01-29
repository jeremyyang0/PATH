import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import { EleParser, ParseResult } from './parseEle';

/**
 * AI配置
 */
interface AIConfig {
    url: string;
    apiKey: string;
    model: string;
}

/**
 * 方法候选信息
 */
interface MethodCandidate {
    label: string;      // 中文描述
    codePath: string;   // 如 logic.settings.open_settings
    methodDoc: string;  // 方法文档
    isAssert?: boolean; // 是否为断言方法
}

/**
 * 步骤信息
 */
export interface StepInfo {
    line: number;       // 步骤注释所在行号 (0-indexed)
    desc: string;       // 步骤描述
    expect: string;     // 预期结果
    expectLine?: number; // 预期注释所在行号
    hasCode?: boolean;   // 是否已经有代码实现
    existingCode?: string[]; // 已有的代码内容
}

/**
 * 获取AI配置
 */
function getAIConfig(): AIConfig {
    const config = vscode.workspace.getConfiguration('path.ai');
    return {
        url: config.get<string>('url') || '',
        apiKey: config.get<string>('apiKey') || '',
        model: config.get<string>('model') || ''
    };
}

/**
 * 发送HTTP请求
 */
function sendRequest(url: string, method: string, headers: Record<string, string>, data?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === 'https:';
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            timeout: 60000  // 60秒超时
        };

        const req = (isHttps ? https : http).request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            res.on('end', () => {
                resolve(responseData);
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('请求超时'));
        });

        if (data) {
            req.write(data);
        }
        req.end();
    });
}

/**
 * 调用AI API
 */
async function callAI(prompt: string): Promise<string> {
    const config = getAIConfig();

    if (!config.url || !config.apiKey || !config.model) {
        throw new Error('请先配置AI设置 (设置 > 扩展 > PATH Plugin Settings)');
    }

    // 确保url末尾没有多余的斜杠
    const baseUrl = config.url.replace(/\/+$/, '');
    const url = `${baseUrl}/chat/completions`;

    const data = JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1  // 低温度以获得更确定的结果
    });

    console.log('AI请求URL:', url);
    console.log('AI模型:', config.model);

    try {
        const response = await sendRequest(url, 'POST', {
            'Authorization': `Bearer ${config.apiKey}`
        }, data);

        console.log('AI原始响应:', response.substring(0, 200));

        // 尝试解析JSON，如果失败则显示更友好的错误
        let result;
        try {
            result = JSON.parse(response);
        } catch (parseError) {
            throw new Error(`API返回非JSON响应: ${response.substring(0, 100)}`);
        }

        if (result.choices && result.choices[0] && result.choices[0].message) {
            return result.choices[0].message.content || '';
        }

        // 检查是否有错误信息
        if (result.error) {
            throw new Error(`API错误: ${result.error.message || JSON.stringify(result.error)}`);
        }

        throw new Error('AI响应格式错误: ' + JSON.stringify(result));
    } catch (error) {
        throw new Error(`AI调用失败: ${error}`);
    }
}

/**
 * 从文件内容解析步骤
 */
/**
 * 从文件内容解析步骤
 */
/**
 * 从文件内容解析步骤
 */
export function parseStepsFromFile(content: string): StepInfo[] {
    const lines = content.split('\n');
    const steps: StepInfo[] = [];

    // 匹配 # 步骤 xxx 格式
    const stepPattern = /^\s*#\s*步骤\s*(\d+)?[:\s：]?\s*(.+)/;
    const expectPattern = /^\s*#\s*预期\s*(\d+)?[:\s：]?\s*(.+)/;

    let currentStep: StepInfo | null = null;

    // 1. 扫描所有步骤
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] || '';

        const stepMatch = line.match(stepPattern);
        if (stepMatch) {
            if (currentStep) {
                steps.push(currentStep);
            }
            // 开始新步骤
            currentStep = {
                line: i,
                desc: stepMatch[2]?.trim() || '',
                expect: ''
            };
            continue;
        }

        const expectMatch = line.match(expectPattern);
        if (expectMatch && currentStep) {
            currentStep.expect = expectMatch[2]?.trim() || '';
            currentStep.expectLine = i;
        }
    }
    // 保存最后一个步骤
    if (currentStep) {
        steps.push(currentStep);
    }

    // 2. 检查每个步骤下是否已有代码
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i]!;
        const nextStep = steps[i + 1];

        // 搜索范围：从当前步骤(或预期)结束后，到下一个步骤开始前(或文件末尾)
        const startScan = (step.expectLine !== undefined ? step.expectLine : step.line) + 1;
        const endScan = nextStep ? nextStep.line : lines.length;

        let hasCode = false;
        const existingCode: string[] = [];
        for (let j = startScan; j < endScan; j++) {
            const lineContent = lines[j]?.trim();
            // 如果行不为空，且不以#开头，则认为是代码
            if (lineContent && !lineContent.startsWith('#')) {
                hasCode = true;
                existingCode.push(lineContent);
            }
        }
        step.hasCode = hasCode;
        if (hasCode) {
            step.existingCode = existingCode;
        }
    }

    return steps;
}

/**
 * 获取方法树数据
 */
async function getMethodTreeData(): Promise<MethodCandidate[]> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return [];
    }

    const parser = new EleParser(workspaceFolder.uri.fsPath);
    const result = await parser.parseAllFiles();

    const candidates: MethodCandidate[] = [];

    for (const methodResult of result.method_results || []) {
        for (const method of methodResult.methods) {
            // 从file_path构建codePath
            const filePath = methodResult.file_path;
            const pathParts = filePath.split(/[\/\\]/);
            const methodIndex = pathParts.indexOf('method');
            const relativeParts = methodIndex !== -1
                ? pathParts.slice(methodIndex + 1, -1)
                : pathParts.slice(0, -1);

            let codePath = [...relativeParts, method.name].join('.');

            let isAssert = false;
            // 优化Asserts路径："xxxx.asserts."
            if (codePath.includes('.asserts.')) {
                isAssert = true;
            }

            candidates.push({
                label: method.doc || method.name,
                codePath: codePath,
                methodDoc: method.doc || '',
                isAssert: isAssert
            });
        }
    }

    return candidates;
}

/**
 * 用关键词搜索方法树
 */
function searchMethodTree(candidates: MethodCandidate[], keywords: string[]): MethodCandidate[] {
    const keywordsLower = keywords.map(k => k.toLowerCase());

    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // 1. 计算匹配分数
    const scoredCandidates = candidates.map(candidate => {
        let score = 0;
        const labelLower = candidate.label.toLowerCase();
        const codePathLower = candidate.codePath.toLowerCase();
        const docLower = candidate.methodDoc.toLowerCase();

        keywordsLower.forEach(kw => {
            if (!kw) return;
            let matched = false;

            // 1. CodePath 匹配 (最高权重)
            if (codePathLower.includes(kw)) {
                score += 10;
                matched = true;
            }

            // 2. Label 匹配
            if (labelLower.includes(kw)) {
                score += 1;
                matched = true;

                // Label 中 【】 内容加权
                try {
                    const escapedKw = escapeRegExp(kw);
                    // 匹配 【...kw...】 的模式
                    const pattern = new RegExp(`【[^】]*?${escapedKw}[^】]*?】`, 'i');
                    if (pattern.test(candidate.label)) {
                        score += 10; // 显著加权
                    }
                } catch (e) {
                    // ignore regex errors
                }
            }

            // 3. Doc 匹配
            if (docLower.includes(kw)) {
                score += 1;
                matched = true;
            }
        });

        return { candidate, score };
    });

    // 2. 过滤和排序
    // 过滤掉 score = 0 的
    // 按 score 降序排序
    return scoredCandidates
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(item => item.candidate);
}

/**
 * 提取JSON响应
 */
function extractJson(text: string): any {
    try {
        // 尝试直接解析
        return JSON.parse(text);
    } catch (e) {
        // 尝试提取Markdown代码块中的json
        const match = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
        if (match && match[1]) {
            try {
                return JSON.parse(match[1]);
            } catch (e2) {
                // ignore
            }
        }

        // 尝试查找第一个 { 和最后一个 }
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
            try {
                return JSON.parse(text.substring(start, end + 1));
            } catch (e3) {
                // ignore
            }
        }
    }
    return null;
}

/**
 * 智能搜索和匹配方法（模拟Function Calling）
 */
interface MethodCallResult {
    path: string;
    args?: Record<string, string>;
}

async function searchAndMatchMethod(
    queryText: string,
    allCandidates: MethodCandidate[],
    candidateType: 'action' | 'assert' | 'all',
    previousSteps: string[] = []
): Promise<{ calls: MethodCallResult[], history: string[] }> {
    const MAX_TURNS = 3;
    let searchHistory: string[] = [];
    let currentCandidates: MethodCandidate[] = [];

    // 根据类型预过滤搜索范围
    let searchScopeCandidates = allCandidates;
    if (candidateType === 'action') {
        searchScopeCandidates = allCandidates.filter(c => !c.isAssert);
    } else if (candidateType === 'assert') {
        searchScopeCandidates = allCandidates.filter(c => c.isAssert);
    }

    for (let turn = 0; turn < MAX_TURNS; turn++) {
        // 构建任务描述
        let taskDesc = '';
        if (candidateType === 'action') {
            taskDesc = `当前处理任务: 查找步骤【${queryText}】对应的操作方法。\n注意：只查找执行动作的方法，不需要断言。`;
        } else if (candidateType === 'assert') {
            taskDesc = `当前处理任务: 查找预期【${queryText}】对应的断言方法。\n`;
        } else {
            taskDesc = `当前步骤: ${queryText}`;
        }

        let context = `${taskDesc}\n`;

        // 添加前序步骤上下文（最近5步）
        if (previousSteps.length > 0) {
            const recentSteps = previousSteps.slice(-5);
            context = `前序步骤(上下文参考):\n${recentSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n` + context;
        }

        if (searchHistory.length > 0) {
            context += `\n搜索历史:\n${searchHistory.join('\n')}\n`;
        }

        // 构建候选列表
        let candidatesContext = '';
        if (currentCandidates.length > 0) {
            let filteredCtxCandidates = currentCandidates;
            // 再次过滤展示，确保Prompt干净
            if (candidateType === 'action') {
                filteredCtxCandidates = currentCandidates.filter(c => !c.isAssert);
            } else if (candidateType === 'assert') {
                filteredCtxCandidates = currentCandidates.filter(c => c.isAssert);
            }

            candidatesContext = '\n找到的候选方法:\n';
            const list = filteredCtxCandidates.slice(0, 50).map(c =>
                `- ${c.codePath} (描述: ${c.label})`
            ).join('\n');
            candidatesContext += list + '\n';

            if (filteredCtxCandidates.length > 50) {
                candidatesContext += `...(共 ${filteredCtxCandidates.length} 个结果，已截断)\n`;
            }
        } else if (turn > 0) {
            candidatesContext = '\n当前搜索未找到任何结果。\n';
        }

        const prompt = `你是一个智能测试代码生成助手,你拥有丰富的电子行业及自动化测试经验。
${context}${candidatesContext}

">",",","->"等符号通常表示多步操作，请将它们拆解成多个方法。

${candidateType === 'action' ? '请找到能执行该步骤的操作方法。' : ''}
${candidateType === 'assert' ? '请找到能验证该预期的断言方法。' : ''}

你可以通过回复JSON指令来执行操作：

1. 搜索方法:
{
    "action": "search",
    "keywords": ["关键词1", "关键词2"]
}
(提示：请从描述中提取核心实体和动作作为关键词。如果是断言，请搜索验证状态的词或核心实体,如 "显示", "存在", "成功","元件","网络","过孔"。)

2. 完成匹配:
{
    "action": "finish",
    "codeCalls": [
        { "path": "logic.select_component", "args": { "name": "R1" } }
    ]
}
(重要提示：
 - 如果候选方法的描述中包含 {{参数名}} 占位符（如 "选择{{name}}"），请尽量从步骤描述中提取该参数的值。·
 - 如果没有参数，args 字段可以省略或留空。
 - codeCalls 列表包含所有需要调用的方法序列。
 - 有时候用户的指令可能会比较模糊（用户描述的一个步骤可能需要多个方法），你可以根据你的经验先找出该步骤中提到的所有实体的可能的候选方法，尝试组织成一个可以实现该步骤的完整逻辑。
)

请只回复JSON。`;

        try {
            const responseText = await callAI(prompt);
            console.log(`Turn ${turn + 1} AI Response:`, responseText);

            const result = extractJson(responseText);
            if (!result) {
                console.error('无法解析AI响应JSON');
                // 后备搜索逻辑
                if (turn === 0) {
                    const keywords = queryText.split(/[\s,>，>]+/).filter(k => k.length > 1).slice(0, 3);
                    searchHistory.push(`自动提取关键词: ${keywords.join(', ')}`);
                    const searchResult = searchMethodTree(searchScopeCandidates, keywords);
                    const newCandidates = searchResult.filter(
                        newItem => !currentCandidates.some(exist => exist.codePath === newItem.codePath)
                    );
                    currentCandidates = [...currentCandidates, ...newCandidates];
                    continue;
                }
                continue;
            }

            if (result.action === 'search' && Array.isArray(result.keywords)) {
                const keywords = result.keywords as string[];
                const searchResult = searchMethodTree(searchScopeCandidates, keywords);

                const newCandidates = searchResult.filter(
                    newItem => !currentCandidates.some(exist => exist.codePath === newItem.codePath)
                );
                currentCandidates = [...currentCandidates, ...newCandidates];
                searchHistory.push(`搜索关键词 "${keywords.join(', ')}": 找到 ${searchResult.length} 个结果`);

            } else if (result.action === 'finish') {
                // 兼容旧的 codePaths 返回
                let calls: MethodCallResult[] = [];

                if (Array.isArray(result.codeCalls)) {
                    calls = result.codeCalls;
                } else if (Array.isArray(result.codePaths)) {
                    calls = result.codePaths.map((p: string) => ({ path: p }));
                }

                // 过滤
                if (candidateType === 'action') {
                    calls = calls.filter(c => {
                        const candidate = allCandidates.find(cand => cand.codePath === c.path);
                        return candidate ? !candidate.isAssert : !c.path.includes('.asserts.');
                    });
                } else if (candidateType === 'assert') {
                    calls = calls.filter(c => {
                        const candidate = allCandidates.find(cand => cand.codePath === c.path);
                        return candidate ? candidate.isAssert : c.path.includes('.asserts.');
                    });
                }

                return { calls: calls, history: searchHistory };
            }
        } catch (error) {
            console.error('AI交互出错:', error);
            searchHistory.push(`AI Error: ${error}`);
        }
    }
    return { calls: [], history: searchHistory };
}

interface ReportItem {
    step: string;
    result: 'Skipped' | 'Success' | 'Failed';
    details: string;
}

function generateHtmlReport(items: ReportItem[]): string {
    const successCount = items.filter(i => i.result === 'Success').length;
    const failedCount = items.filter(i => i.result === 'Failed').length;
    const skippedCount = items.filter(i => i.result === 'Skipped').length;

    // 生成行
    const rows = items.map(item => {
        let badgeClass = '';
        if (item.result === 'Success') badgeClass = 'success';
        else if (item.result === 'Failed') badgeClass = 'failed';
        else badgeClass = 'skipped';

        return `
            <tr>
                <td style="font-weight: 500;">${item.step}</td>
                <td><span class="status-badge ${badgeClass}">${item.result}</span></td>
                <td><pre>${item.details}</pre></td>
            </tr>
        `;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Generation Report</title>
    <style>
        :root {
            --bg-color: #f5f5f7;
            --card-bg: #ffffff;
            --text-primary: #1d1d1f;
            --text-secondary: #86868b;
            --border-color: #d2d2d7;
            --success-color: #34c759;
            --error-color: #ff3b30;
            --skip-color: #8e8e93;
            --table-header-bg: #fafafa;
        }

        body.vscode-dark {
            --bg-color: #1c1c1e;
            --card-bg: #2c2c2e;
            --text-primary: #e5e5e7;
            --text-secondary: #a1a1a6;
            --border-color: #38383a;
            --success-color: #30d158;
            --error-color: #ff453a;
            --skip-color: #98989d;
            --table-header-bg: #2c2c2e;
        }

        body { 
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif; 
            padding: 40px; 
            line-height: 1.5; 
            max-width: 1000px;
            margin: 0 auto;
            background-color: var(--bg-color); 
            color: var(--text-primary);
        }

        h1 { font-weight: 600; font-size: 28px; margin-bottom: 32px; letter-spacing: -0.01em; }

        .stats { display: flex; gap: 16px; margin-bottom: 40px; }
        .stat-card { 
            background: var(--card-bg); 
            padding: 24px; 
            border-radius: 16px; 
            flex: 1;
            text-align: left;
            border: 1px solid rgba(0,0,0,0.05);
            transition: transform 0.2s;
        }
        body.vscode-dark .stat-card { border: 1px solid rgba(255,255,255,0.05); }

        .stat-value { font-size: 36px; font-weight: 700; margin-bottom: 4px; letter-spacing: -0.02em; line-height: 1.2; }
        .stat-label { color: var(--text-secondary); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }

        table { 
            width: 100%; 
            border-collapse: separate; 
            border-spacing: 0; 
            background: var(--card-bg); 
            border-radius: 16px; 
            overflow: hidden; 
            box-shadow: 0 4px 20px rgba(0,0,0,0.04); 
            border: 1px solid rgba(0,0,0,0.05);
        }
        body.vscode-dark table { box-shadow: none; border: 1px solid rgba(255,255,255,0.05); }
        
        th, td { padding: 16px 24px; text-align: left; border-bottom: 1px solid var(--border-color); vertical-align: top; }
        th { background-color: var(--table-header-bg); font-weight: 600; font-size: 13px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; border-bottom-width: 0; }
        tr:last-child td { border-bottom: none; }
        
        pre { 
            margin: 0; 
            font-family: "SF Mono", "Menlo", "Monaco", "Courier New", monospace; 
            font-size: 13px; 
            line-height: 1.6; 
            color: var(--text-secondary);
            white-space: pre-wrap;
        }

        .status-badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 50px;
            font-size: 12px;
            font-weight: 600;
        }
        .status-badge.success { background: rgba(52, 199, 89, 0.15); color: var(--success-color); }
        .status-badge.failed { background: rgba(255, 59, 48, 0.15); color: var(--error-color); }
        .status-badge.skipped { background: rgba(142, 142, 147, 0.15); color: var(--skip-color); }
    </style>
</head>
<body>
    <h1>AI Generation 报告</h1>
    
    <div class="stats">
        <div class="stat-card">
            <div class="stat-value">${items.length}</div>
            <div class="stat-label">总步骤</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="color: var(--success-color);">${successCount}</div>
            <div class="stat-label">成功</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="color: var(--error-color);">${failedCount}</div>
            <div class="stat-label">失败</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="color: var(--skip-color);">${skippedCount}</div>
            <div class="stat-label">跳过</div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th style="width: 35%">步骤</th>
                <th style="width: 15%">结果</th>
                <th style="width: 50%">详情</th>
            </tr>
        </thead>
        <tbody>
            ${rows}
        </tbody>
    </table>
</body>
</html>`;
}



/**
 * 主入口：处理整个文件
 */
export async function processFileWithAI(document: vscode.TextDocument): Promise<void> {
    const config = getAIConfig();

    if (!config.url || !config.apiKey || !config.model) {
        vscode.window.showWarningMessage('请先配置AI设置 (设置 > 扩展 > PATH Plugin Settings > AI配置)');
        return;
    }

    const content = document.getText();
    const steps = parseStepsFromFile(content);

    if (steps.length === 0) {
        vscode.window.showInformationMessage('未找到步骤注释 (格式: # 步骤 xxx)');
        return;
    }

    // 获取方法树
    const allCandidates = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'AI Generation',
        cancellable: false
    }, async (progress) => {
        progress.report({ message: '加载方法树...' });
        return await getMethodTreeData();
    });

    if (allCandidates.length === 0) {
        vscode.window.showWarningMessage('方法树为空，无法生成代码');
        return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
        vscode.window.showWarningMessage('请保持文件打开状态');
        return;
    }

    // 处理每个步骤
    const report: ReportItem[] = [];
    const stepsHistory: string[] = [];
    let lineOffset = 0;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'AI Generation',
        cancellable: true
    }, async (progress, token) => {
        // 正序处理（从前向后），需要维护lineOffset
        const sortedSteps = [...steps].sort((a, b) => a.line - b.line);

        for (let i = 0; i < sortedSteps.length; i++) {
            if (token.isCancellationRequested) {
                break;
            }

            const step = sortedSteps[i]!;

            if (step.hasCode) {
                progress.report({
                    message: `跳过步骤 (已有代码): ${step.desc.substring(0, 20)}...`,
                    increment: 100 / steps.length
                });
                report.push({ step: step.desc, result: 'Skipped', details: '已有代码实现' });
                // 将已有代码加入上下文，保持逻辑连贯
                const codeContext = step.existingCode ? step.existingCode.join('; ') : 'Existing Code';
                stepsHistory.push(`${step.desc} (Context: ${codeContext})`);
                continue;
            }

            progress.report({
                message: `处理步骤 ${i + 1}/${steps.length}: ${step.desc.substring(0, 20)}...`,
                increment: 100 / steps.length
            });

            // 辅助函数：格式化调用代码
            const formatCall = (c: MethodCallResult) => {
                if (c.args && Object.keys(c.args).length > 0) {
                    const argsStr = Object.entries(c.args)
                        .map(([k, v]) => `${k}="${v}"`)
                        .join(', ');
                    return `${c.path}(${argsStr})`;
                }
                return `${c.path}()`;
            };

            // 1. 处理操作步骤 (Action)
            const actionResult = await searchAndMatchMethod(step.desc, allCandidates, 'action', stepsHistory);
            const actionCalls = actionResult.calls;

            // 2. 处理断言 (Assert)
            let assertCalls: MethodCallResult[] = [];
            let assertResult = { calls: [], history: [] } as { calls: MethodCallResult[], history: string[] };

            if (step.expect) {
                assertResult = await searchAndMatchMethod(step.expect, allCandidates, 'assert', stepsHistory);
                assertCalls = assertResult.calls;
            }

            // 确定插入位置（步骤和预期注释之后）
            // 注意：由于前面的插入导致行号变化，需要加上 lineOffset
            const baseLine = step.expectLine !== undefined ? step.expectLine : step.line;
            const insertLine = baseLine + 1 + lineOffset;

            // 获取缩进（使用偏移后的行号获取当前内容）
            const currentStepLine = step.line + lineOffset;
            let indent = '        ';
            if (currentStepLine < document.lineCount) {
                const stepLineText = document.lineAt(currentStepLine).text;
                const indentMatch = stepLineText.match(/^(\s*)/);
                indent = (indentMatch && indentMatch[1]) ? indentMatch[1] : '        ';
            }

            // 构建插入内容和报告
            let codeLines: string[] = [];

            // Action 结果处理
            if (actionCalls.length > 0) {
                const lines = actionCalls.map(c => `${indent}${formatCall(c)}`); // 生成带参数的调用
                codeLines.push(...lines);

                // 报告中使用简单的路径展示，还是带参数？带参数更好
                const callDescriptions = actionCalls.map(c => formatCall(c)).join('\n');

                report.push({
                    step: step.desc,
                    result: 'Success',
                    details: `生成操作代码:\n${callDescriptions}`
                });
                stepsHistory.push(`${step.desc} (Code: ${actionCalls.map(c => c.path).join(', ')})`);
            } else {
                codeLines.push(`${indent}# TODO: ${step.desc}`);
                report.push({
                    step: step.desc,
                    result: 'Failed',
                    details: '未找到操作方法\n---\nAI搜索记录:\n' + actionResult.history.join('\n')
                });
                stepsHistory.push(`${step.desc} (Failed)`);
            }

            // Assert 结果处理
            if (step.expect) {
                if (assertCalls.length > 0) {
                    const lines = assertCalls.map(c => `${indent}${formatCall(c)}`);
                    codeLines.push(...lines);

                    const callDescriptions = assertCalls.map(c => formatCall(c)).join('\n');

                    report.push({
                        step: `验证: ${step.expect}`,
                        result: 'Success',
                        details: `生成断言代码:\n${callDescriptions}`
                    });
                } else {
                    codeLines.push(`${indent}# TODO: 验证 ${step.expect}`);
                    report.push({
                        step: `验证: ${step.expect}`,
                        result: 'Failed',
                        details: '未找到断言方法\n---\nAI搜索记录:\n' + assertResult.history.join('\n')
                    });
                }
            }

            const insertText = codeLines.join('\n') + '\n';

            // 插入代码
            await editor.edit(editBuilder => {
                const position = new vscode.Position(insertLine, 0);
                editBuilder.insert(position, insertText);
            });

            // 更新行号偏移
            // split('\n').length - 1 是因为最后有一个换行符
            const insertedLinesCount = insertText.split('\n').length - 1;
            lineOffset += insertedLinesCount;
        }
    });

    // 生成并打开报告
    const reportHtml = generateHtmlReport(report);
    const panel = vscode.window.createWebviewPanel(
        'aiGenerationReport',
        'AI Generation 报告',
        vscode.ViewColumn.Beside,
        {}
    );
    panel.webview.html = reportHtml;

    vscode.window.showInformationMessage(`AI Generation 完成，处理了 ${steps.length} 个步骤`);
}
