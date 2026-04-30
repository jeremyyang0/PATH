import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { StructuredError } from '../../../shared/errors/structuredError';

const PATH_SNIFF_LOG_LEVEL_ENV = 'PATH_SNIFF_LOG_LEVEL';

export type SniffSidecarPickResult =
    | {
        status: 'selected';
        widgetId: string;
        widgetIds: string[];
        primaryWidgetId: string;
        point: [number, number];
    }
    | {
        status: 'cancelled';
    };

type SniffSidecarJsonResult = Record<string, unknown>;

function normalizePoint(rawPoint: unknown): [number, number] {
    if (!Array.isArray(rawPoint) || rawPoint.length < 2) {
        return [0, 0];
    }

    return [Number(rawPoint[0]) || 0, Number(rawPoint[1]) || 0];
}

function normalizeWidgetIds(rawWidgetIds: unknown, fallbackWidgetId: string): string[] {
    if (Array.isArray(rawWidgetIds)) {
        const normalized = rawWidgetIds
            .map(widgetId => String(widgetId || ''))
            .filter(widgetId => widgetId.length > 0);
        if (normalized.length > 0) {
            return Array.from(new Set(normalized));
        }
    }

    return fallbackWidgetId ? [fallbackWidgetId] : [];
}

function getPlatformTag(): string {
    return `${process.platform}-${process.arch}`;
}

function getCliExecutableName(): string {
    return process.platform === 'win32'
        ? 'path-sniff-cli.exe'
        : 'path-sniff-cli';
}

function getCliDirectoryName(): string {
    return 'path-sniff-bundle';
}

function parseJsonLine(stdout: string): SniffSidecarJsonResult {
    const lines = stdout
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);
    const rawLine = lines[lines.length - 1] || '';
    if (!rawLine) {
        throw new StructuredError({
            error: 'Sniff sidecar returned empty stdout.',
            errorType: 'SidecarLaunchFailed'
        });
    }

    try {
        return JSON.parse(rawLine) as SniffSidecarJsonResult;
    } catch (error) {
        throw new StructuredError({
            error: [
                'Failed to parse sidecar JSON output.',
                error instanceof Error ? error.message : String(error),
                rawLine
            ].join('\n'),
            errorType: 'SidecarLaunchFailed'
        });
    }
}

export class SniffSidecarService {
    public constructor(private readonly extensionRoot: string) {}

    public async pickWidget(serverName: string): Promise<SniffSidecarPickResult> {
        const payload = await this.runJsonCommand(['pick', '--server-name', serverName, '--json']);
        const status = String(payload['status'] || '');
        if (status === 'cancelled') {
            return { status: 'cancelled' };
        }

        if (status !== 'selected') {
            throw new StructuredError({
                error: `Unexpected sidecar pick status: ${status || 'unknown'}`,
                errorType: 'SidecarLaunchFailed'
            });
        }

        const widgetId = String(payload['widgetId'] || '');
        if (!widgetId) {
            throw new StructuredError({
                error: 'Sniff sidecar did not return a widgetId.',
                errorType: 'SidecarLaunchFailed'
            });
        }

        const widgetIds = normalizeWidgetIds(payload['widgetIds'], widgetId);
        const primaryWidgetId = String(payload['primaryWidgetId'] || widgetIds[widgetIds.length - 1] || widgetId);

        return {
            status: 'selected',
            widgetId,
            widgetIds,
            primaryWidgetId,
            point: normalizePoint(payload['point'])
        };
    }

    private async runJsonCommand(args: string[]): Promise<SniffSidecarJsonResult> {
        const executablePath = this.resolveCliPath();
        return new Promise<SniffSidecarJsonResult>((resolve, reject) => {
            const child = spawn(executablePath, args, {
                cwd: path.dirname(executablePath),
                windowsHide: true,
                env: {
                    ...process.env,
                    [PATH_SNIFF_LOG_LEVEL_ENV]: this.getLogLevel()
                }
            });

            let stdout = '';
            let stderr = '';
            let settled = false;

            const finalize = (handler: () => void): void => {
                if (settled) {
                    return;
                }

                settled = true;
                handler();
            };

            child.stdout.setEncoding('utf8');
            child.stderr.setEncoding('utf8');

            child.stdout.on('data', chunk => {
                stdout += chunk;
            });

            child.stderr.on('data', chunk => {
                stderr += chunk;
            });

            child.on('error', error => {
                finalize(() => {
                    reject(new StructuredError({
                        error: error.message || 'Unable to launch sniff sidecar.',
                        errorType: 'SidecarLaunchFailed'
                    }));
                });
            });

            child.on('close', code => {
                finalize(() => {
                    try {
                        const payload = parseJsonLine(stdout);
                        if (code === 0 || code === 2) {
                            resolve(payload);
                            return;
                        }

                        reject(new StructuredError({
                            error: String(payload['message'] || stderr.trim() || 'Sniff sidecar command failed.'),
                            errorType: String(payload['errorType'] || 'SidecarLaunchFailed')
                        }));
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        });
    }

    private resolveCliPath(): string {
        const cliPath = path.join(
            this.extensionRoot,
            'resources',
            'sniff-sidecar',
            getPlatformTag(),
            getCliDirectoryName(),
            getCliExecutableName()
        );

        if (!fs.existsSync(cliPath)) {
            throw new StructuredError({
                error: `Sniff sidecar is missing for ${getPlatformTag()}: ${cliPath}`,
                errorType: 'SidecarUnavailable'
            });
        }

        return cliPath;
    }

    private getLogLevel(): string {
        const configured = vscode.workspace
            .getConfiguration('path.sniff')
            .get<string>('sidecar.logLevel', 'info');
        const normalized = (configured || 'info').trim().toLowerCase();
        if (['debug', 'info', 'warning', 'error'].includes(normalized)) {
            return normalized;
        }

        return 'info';
    }
}
