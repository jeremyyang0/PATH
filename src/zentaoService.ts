import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';

export interface ZentaoCaseInfo {
    id: number;
    title: string;
    precondition: string;
    steps: Array<{
        desc: string;
        expect: string;
    }>;
}

/**
 * 获取禅道配置
 */
function getZentaoConfig(): { host: string; username: string; password: string } {
    const config = vscode.workspace.getConfiguration('path.zentao');
    return {
        host: config.get<string>('host') || '',
        username: config.get<string>('username') || '',
        password: config.get<string>('password') || ''
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
                ...headers
            },
            timeout: 5000
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
 * 获取禅道Token
 */
async function getToken(host: string, username: string, password: string): Promise<string> {
    const url = `http://${host}/max/api.php/v1/tokens`;
    const data = JSON.stringify({
        account: username,
        password: password
    });

    try {
        const response = await sendRequest(url, 'POST', {}, data);
        const result = JSON.parse(response);
        if (result.token) {
            return result.token;
        }
        throw new Error('获取Token失败: ' + JSON.stringify(result));
    } catch (error) {
        throw new Error(`连接禅道失败: ${error}`);
    }
}

/**
 * 解码HTML实体
 */
function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&#039;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/\r\n/g, '\n');
}

/**
 * 获取用例信息
 */
export async function getCaseInfo(caseId: string): Promise<ZentaoCaseInfo | null> {
    const config = getZentaoConfig();

    if (!config.host || !config.username || !config.password) {
        vscode.window.showWarningMessage('请先配置禅道连接信息 (设置 > 扩展 > PATH Plugin Settings)');
        return null;
    }

    try {
        // 获取Token
        const token = await getToken(config.host, config.username, config.password);

        // 获取用例信息
        const url = `http://${config.host}/max/api.php/v1/testcases/${caseId}`;
        const response = await sendRequest(url, 'GET', { 'Token': token });
        const result = JSON.parse(response);

        if (result.id) {
            // 处理步骤，解码HTML实体并格式化
            const formattedSteps: Array<{ desc: string; expect: string }> = [];
            if (result.steps && Array.isArray(result.steps)) {
                for (let i = 0; i < result.steps.length; i++) {
                    const step = result.steps[i];
                    const stepDesc = decodeHtmlEntities(step.desc || '');
                    const stepExpect = decodeHtmlEntities(step.expect || '');
                    formattedSteps.push({
                        desc: `${i + 1}: ${stepDesc}`,
                        expect: `${i + 1}: ${stepExpect}`
                    });
                }
            }

            return {
                id: result.id,
                title: decodeHtmlEntities(result.title || ''),
                precondition: decodeHtmlEntities(result.precondition || ''),
                steps: formattedSteps,
            };
        }

        vscode.window.showErrorMessage(`获取用例信息失败: ${JSON.stringify(result)}`);
        return null;
    } catch (error) {
        vscode.window.showErrorMessage(`禅道API错误: ${error}`);
        return null;
    }
}

/**
 * 测试禅道连接
 */
export async function testConnection(): Promise<boolean> {
    const config = getZentaoConfig();

    if (!config.host || !config.username || !config.password) {
        vscode.window.showWarningMessage('请先配置禅道连接信息');
        return false;
    }

    try {
        await getToken(config.host, config.username, config.password);
        vscode.window.showInformationMessage('禅道连接成功！');
        return true;
    } catch (error) {
        vscode.window.showErrorMessage(`禅道连接失败: ${error}`);
        return false;
    }
}
