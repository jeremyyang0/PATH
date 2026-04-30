import * as net from 'net';
import { StructuredError } from '../../../shared/errors/structuredError';

export interface NeedleEndpoint {
    host: string;
    port: number;
}

export interface NeedlePostOptions {
    timeoutMs: number;
}

function normalizeRoute(route: string): string {
    return `/${String(route || '').trim().replace(/^\/+/, '')}`;
}

function encodeRequest(route: string, payload?: Record<string, unknown>): string {
    return `POST ${normalizeRoute(route)}\n${JSON.stringify(payload || {})}`;
}

function parseResponse<TResponse>(route: string, response: string): TResponse {
    if (!response) {
        throw new StructuredError({
            error: `${normalizeRoute(route)} 没有返回数据`,
            errorType: 'ConnectionClosedError'
        });
    }

    try {
        return JSON.parse(response) as TResponse;
    } catch {
        throw new StructuredError({
            error: `Invalid JSON from Needle server: ${response.substring(0, 200)}`,
            errorType: 'ParseError'
        });
    }
}

export class NeedleTcpTransport {
    /**
     * Needle agent 使用简单的 `POST /route + JSON body` TCP 协议；这里集中处理 UTF-8 编解码和超时。
     */
    public async post<TResponse>(
        endpoint: NeedleEndpoint,
        route: string,
        payload: Record<string, unknown> | undefined,
        options: NeedlePostOptions
    ): Promise<TResponse> {
        return new Promise<TResponse>((resolve, reject) => {
            const socket = net.createConnection({ host: endpoint.host, port: endpoint.port });
            const requestText = encodeRequest(route, payload);
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

            const finishWithResponse = (): void => {
                finalize(() => {
                    try {
                        resolve(parseResponse<TResponse>(route, response));
                    } catch (error) {
                        reject(error);
                    }
                });
            };

            socket.setEncoding('utf8');
            socket.setTimeout(options.timeoutMs, () => {
                finalize(() => {
                    reject(new StructuredError({
                        error: `${normalizeRoute(route)} 响应超时`,
                        errorType: 'TimeoutError'
                    }));
                });
            });

            socket.on('connect', () => {
                socket.write(requestText, 'utf8');
            });

            socket.on('data', chunk => {
                response += chunk;
            });

            socket.on('end', finishWithResponse);

            socket.on('close', hadError => {
                if (settled || hadError) {
                    return;
                }
                if (response) {
                    finishWithResponse();
                    return;
                }

                finalize(() => {
                    reject(new StructuredError({
                        error: `Connection closed before any response was received: ${endpoint.host}:${endpoint.port}`,
                        errorType: 'ConnectionClosedError'
                    }));
                });
            });

            socket.on('error', error => {
                finalize(() => {
                    reject(new StructuredError({
                        error: `${error.message || 'Connection failed'}: ${endpoint.host}:${endpoint.port}`,
                        errorType: error.name || 'ConnectionError'
                    }));
                });
            });
        });
    }
}

export const needleTcpTransportTestOnly = {
    encodeRequest,
    normalizeRoute
};
