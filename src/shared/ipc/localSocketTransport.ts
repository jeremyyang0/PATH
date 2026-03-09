import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { StructuredError } from '../errors/structuredError';

function getSocketPath(serverName: string): string {
    if (process.platform === 'win32') {
        return `\\\\.\\pipe\\${serverName}`;
    }

    return path.join(os.tmpdir(), serverName);
}

export class LocalSocketTransport {
    public async post<TResponse>(serverName: string, route: string, payload?: Record<string, unknown>): Promise<TResponse> {
        const requestPath = `/${serverName}/${route}`;
        const requestBody = payload ? JSON.stringify(payload) : '';
        const requestText = requestBody
            ? `POST ${requestPath}\n${requestBody}`
            : `POST ${requestPath}`;

        return new Promise<TResponse>((resolve, reject) => {
            const socket = net.createConnection(getSocketPath(serverName));
            let response = '';
            let settled = false;

            const finalize = (handler: () => void): void => {
                if (settled) {
                    return;
                }

                settled = true;
                socket.removeAllListeners();
                socket.destroy();
                handler();
            };

            socket.setTimeout(5000, () => {
                finalize(() => {
                    reject(new StructuredError({ error: '响应超时', errorType: 'TimeoutError' }));
                });
            });

            socket.on('connect', () => {
                socket.end(requestText, 'utf8');
            });

            socket.on('data', chunk => {
                response += chunk.toString('utf8');
            });

            socket.on('end', () => {
                finalize(() => {
                    try {
                        resolve(JSON.parse(response) as TResponse);
                    } catch {
                        reject(new StructuredError({
                            error: `服务端返回了无效 JSON: ${response.substring(0, 200)}`,
                            errorType: 'ParseError'
                        }));
                    }
                });
            });

            socket.on('error', error => {
                finalize(() => {
                    reject(new StructuredError({
                        error: error.message || '连接失败',
                        errorType: error.name || 'ConnectionError'
                    }));
                });
            });
        });
    }
}
