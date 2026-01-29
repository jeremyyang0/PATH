/**
 * 测试AI API请求
 * 使用Node.js内置http模块测试与AI服务的通信
 * 
 * 运行方式: npx ts-node test-ai-request.ts
 */

import * as http from 'http';

// 从pychat.py获取的配置
const config = {
    url: 'http://127.0.0.1:8045/v1',
    apiKey: 'sk-30fcdd635a0b41509a2275837a5ab62a',
    model: 'gemini-3-flash'
};

function sendRequest(url: string, method: string, headers: Record<string, string>, data?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || 80,
            path: urlObj.pathname + urlObj.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            timeout: 60000
        };

        console.log('请求配置:', options);
        console.log('请求数据:', data);

        const req = http.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            res.on('end', () => {
                console.log('响应状态:', res.statusCode);
                resolve(responseData);
            });
        });

        req.on('error', (error) => {
            console.error('请求错误:', error);
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

async function testAIRequest() {
    console.log('=== 测试AI API请求 ===\n');
    console.log('配置:', config);
    console.log();

    const url = `${config.url}/chat/completions`;
    const requestData = JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'Hello, please respond with a short greeting.' }],
        temperature: 0.1
    });

    try {
        console.log('发送请求到:', url);
        console.log();

        const response = await sendRequest(url, 'POST', {
            'Authorization': `Bearer ${config.apiKey}`
        }, requestData);

        console.log('原始响应:', response);
        console.log();

        const result = JSON.parse(response);

        if (result.choices && result.choices[0] && result.choices[0].message) {
            console.log('✅ 请求成功!');
            console.log('AI回复:', result.choices[0].message.content);
        } else {
            console.log('❌ 响应格式不正确:', JSON.stringify(result, null, 2));
        }
    } catch (error) {
        console.error('❌ 请求失败:', error);
    }
}

// 运行测试
testAIRequest();
