import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { StructuredError } from '../errors/structuredError';

type PostOptions = {
    timeoutMs?: number;
};

function getSocketPaths(serverName: string): string[] {
    if (process.platform !== 'win32') {
        return [path.join(os.tmpdir(), serverName)];
    }

    if (/^\\\\[.?]\\pipe\\/.test(serverName)) {
        return [serverName];
    }

    return [
        `\\\\.\\pipe\\${serverName}`,
        `\\\\.\\pipe\\LOCAL\\${serverName}`,
        `\\\\?\\pipe\\${serverName}`
    ];
}

function normalizeRoute(route: string): string {
    return route.replace(/^\/+/, '');
}

function shouldTryNextPath(error: unknown): boolean {
    if (!(error instanceof StructuredError)) {
        return false;
    }

    if (error.errorType === 'ParseError' || error.errorType === 'TimeoutError') {
        return false;
    }

    const message = error.message || '';
    return (
        message.includes('EPIPE') ||
        message.includes('ENOENT') ||
        message.includes('ECONNREFUSED') ||
        error.errorType === 'ConnectionClosedError' ||
        error.errorType === 'ConnectionError' ||
        error.errorType === 'Error'
    );
}

function tryParseBufferedResponse<TResponse>(response: string): { ok: true; value: TResponse } | { ok: false } {
    if (!response) {
        return { ok: false };
    }

    try {
        return { ok: true, value: JSON.parse(response) as TResponse };
    } catch {
        return { ok: false };
    }
}

export class LocalSocketTransport {
    public async post<TResponse>(
        serverName: string,
        route: string,
        payload?: Record<string, unknown>,
        options?: PostOptions
    ): Promise<TResponse> {
        const requestPath = `/${serverName}/${normalizeRoute(route)}`;
        const requestBody = payload ? JSON.stringify(payload) : '';
        const requestText = requestBody
            ? `POST ${requestPath}\n${requestBody}`
            : `POST ${requestPath}`;

        const socketPaths = getSocketPaths(serverName);
        let lastError: unknown;

        for (const socketPath of socketPaths) {
            try {
                return await this.postToSocketPath<TResponse>(socketPath, requestText, options);
            } catch (error) {
                lastError = error;
                if (!shouldTryNextPath(error)) {
                    throw error;
                }
            }
        }

        throw lastError instanceof Error
            ? lastError
            : new StructuredError({ error: String(lastError || 'connect failed'), errorType: 'ConnectionError' });
    }

    private async postToSocketPath<TResponse>(socketPath: string, requestText: string, options?: PostOptions): Promise<TResponse> {
        return new Promise<TResponse>((resolve, reject) => {
            const socket = net.createConnection(socketPath);
            let response = '';
            let settled = false;
            const timeoutMs = options?.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : 5000;

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
                    const parsed = tryParseBufferedResponse<TResponse>(response);
                    if (parsed.ok) {
                        resolve(parsed.value);
                        return;
                    }

                    reject(new StructuredError({
                        error: `Invalid JSON from server: ${response.substring(0, 200)}`,
                        errorType: 'ParseError'
                    }));
                });
            };

            socket.setTimeout(timeoutMs, () => {
                finalize(() => {
                    reject(new StructuredError({ error: 'Response timed out', errorType: 'TimeoutError' }));
                });
            });

            socket.on('connect', () => {
                socket.write(requestText, 'utf8');
            });

            socket.on('data', chunk => {
                response += chunk.toString('utf8');
            });

            socket.on('end', () => {
                finishWithResponse();
            });

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
                        error: `Connection closed before any response was received: ${socketPath}`,
                        errorType: 'ConnectionClosedError'
                    }));
                });
            });

            socket.on('error', error => {
                const parsed = tryParseBufferedResponse<TResponse>(response);
                if (parsed.ok && /EPIPE|ECONNRESET/.test(error.message || '')) {
                    finalize(() => {
                        resolve(parsed.value);
                    });
                    return;
                }

                finalize(() => {
                    reject(new StructuredError({
                        error: `${error.message || 'Connection failed'}: ${socketPath}`,
                        errorType: error.name || 'ConnectionError'
                    }));
                });
            });
        });
    }
}
