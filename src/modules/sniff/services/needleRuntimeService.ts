import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { StructuredError } from '../../../shared/errors/structuredError';
import { NeedleEndpoint } from './needleTcpTransport';

export type SniffConnectionMode = 'remote' | 'attach' | 'loadapp';

export interface SniffConnectionRequest {
    mode: SniffConnectionMode;
    host?: string;
    port?: number;
    pid?: number;
    targetExe?: string;
    targetArgs?: string;
}

export interface SniffConnectionState {
    mode: SniffConnectionMode;
    host: string;
    port: number;
    pid?: number;
    targetExe?: string;
    targetArgs?: string;
    label: string;
}

interface ControllerResult {
    host?: string;
    port?: number;
    pid?: number;
    [key: string]: unknown;
}

const ATTACH_POLL_TIMEOUT_MS = 8000;
const ATTACH_POLL_INTERVAL_MS = 250;

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function formatWindowsPath(value: string): string {
    return value.replace(/\//g, '\\');
}

function normalizeRuntimePolicy(value: string | undefined): string {
    return ['auto', 'prefer-target', 'bundled-only'].includes(value || '') ? String(value) : 'auto';
}

function normalizeTargetProfile(value: string | undefined): string {
    return ['auto', 'generic', 'sailwind'].includes(value || '') ? String(value) : 'auto';
}

function normalizePort(value: unknown): number {
    const port = Number(value);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new StructuredError({
            error: 'Needle host/port 连接缺少有效端口。',
            errorType: 'InvalidConnectionConfig'
        });
    }
    return port;
}

function parseControllerStdout(stdout: string, stderr: string, exitCode: number | null): ControllerResult {
    const text = String(stdout || '').trim();
    if (text) {
        try {
            const payload = JSON.parse(text) as { ok?: boolean; result?: ControllerResult; error?: string };
            if (exitCode === 0 && payload.ok && payload.result) {
                return payload.result;
            }
            throw new StructuredError({
                error: String(payload.error || stderr || text || 'needle-controller 执行失败'),
                errorType: 'ControllerFailed'
            });
        } catch (error) {
            if (error instanceof StructuredError) {
                throw error;
            }
        }
    }

    throw new StructuredError({
        error: String(stderr || text || 'needle-controller 返回了无效输出'),
        errorType: exitCode === 0 ? 'ControllerInvalidOutput' : 'ControllerFailed'
    });
}

function splitCommandLineArgs(argumentText: string): string[] {
    const args: string[] = [];
    const pattern = /"([^"]*)"|'([^']*)'|[^\s]+/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(argumentText)) !== null) {
        args.push(match[1] ?? match[2] ?? match[0]);
    }
    return args;
}

export class NeedleRuntimeService {
    public resolveRemoteConnection(host: string, port: number): SniffConnectionState {
        const normalizedHost = String(host || '').trim() || '127.0.0.1';
        const normalizedPort = normalizePort(port);
        return {
            mode: 'remote',
            host: normalizedHost,
            port: normalizedPort,
            label: `${normalizedHost}:${normalizedPort}`
        };
    }

    public async attach(pid: number): Promise<SniffConnectionState> {
        const finalPid = this.normalizePid(pid);
        const result = await this.runController(finalPid, false);
        return this.connectionFromControllerResult('attach', result);
    }

    public async loadapp(targetExe: string, targetArgs = ''): Promise<SniffConnectionState> {
        const targetPath = path.resolve(String(targetExe || '').trim());
        if (!fs.existsSync(targetPath)) {
            throw new StructuredError({
                error: `Target executable does not exist: ${targetPath}`,
                errorType: 'TargetNotFound'
            });
        }

        const child = spawn(targetPath, splitCommandLineArgs(targetArgs), {
            cwd: path.dirname(targetPath),
            env: this.createLoadappEnv(targetPath),
            windowsHide: true,
            detached: false
        });

        const deadline = Date.now() + ATTACH_POLL_TIMEOUT_MS;
        let lastError: unknown;
        while (Date.now() < deadline) {
            if (child.exitCode !== null) {
                throw new StructuredError({
                    error: `目标进程在附着前已退出，退出码：${child.exitCode}`,
                    errorType: 'TargetExited'
                });
            }

            try {
                const result = await this.runController(child.pid || 0, false);
                const connection = this.connectionFromControllerResult('loadapp', result);
                return {
                    ...connection,
                    targetExe: targetPath,
                    targetArgs
                };
            } catch (error) {
                lastError = error;
                await delay(ATTACH_POLL_INTERVAL_MS);
            }
        }

        throw new StructuredError({
            error: `附加新启动进程失败：${lastError instanceof Error ? lastError.message : String(lastError || 'unknown error')}`,
            errorType: 'AttachTimeout'
        });
    }

    public endpointFromState(connection: SniffConnectionState): NeedleEndpoint {
        return {
            host: connection.host,
            port: connection.port
        };
    }

    private async runController(pid: number, forceInject: boolean): Promise<ControllerResult> {
        const finalPid = this.normalizePid(pid);
        const runtimeBundle = this.resolveRuntimeBundle();
        const controllerPath = path.join(runtimeBundle, 'needle-controller.exe');
        const probePath = path.join(runtimeBundle, 'needle-probe.dll');
        const args = [
            '--pid',
            String(finalPid),
            `--probe=${formatWindowsPath(probePath)}`,
            `--runtime-policy=${this.getRuntimePolicy()}`,
            `--target-profile=${this.getTargetProfile()}`
        ];
        const fallbackPythonRoot = this.getFallbackPythonRoot();
        if (fallbackPythonRoot) {
            args.push(`--fallback-python-root=${formatWindowsPath(fallbackPythonRoot)}`);
        }
        if (forceInject) {
            args.push('--force-inject');
        }

        return new Promise<ControllerResult>((resolve, reject) => {
            const child = spawn(controllerPath, args, {
                cwd: runtimeBundle,
                env: this.createRuntimeEnv(runtimeBundle),
                windowsHide: true
            });
            let stdout = '';
            let stderr = '';

            child.stdout.setEncoding('utf8');
            child.stderr.setEncoding('utf8');
            child.stdout.on('data', chunk => {
                stdout += chunk;
            });
            child.stderr.on('data', chunk => {
                stderr += chunk;
            });
            child.on('error', error => {
                reject(new StructuredError({
                    error: error.message || 'Unable to launch needle-controller.exe',
                    errorType: 'ControllerLaunchFailed'
                }));
            });
            child.on('close', code => {
                try {
                    resolve(parseControllerStdout(stdout, stderr, code));
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    private connectionFromControllerResult(mode: SniffConnectionMode, result: ControllerResult): SniffConnectionState {
        const host = String(result.host || '127.0.0.1');
        const port = normalizePort(result.port);
        const pid = Number(result.pid);
        return {
            mode,
            host,
            port,
            pid: Number.isInteger(pid) && pid > 0 ? pid : undefined,
            label: `${host}:${port}`
        };
    }

    private normalizePid(pid: number): number {
        const finalPid = Number(pid);
        if (!Number.isInteger(finalPid) || finalPid <= 0) {
            throw new StructuredError({
                error: 'Attach 需要有效 PID。',
                errorType: 'InvalidConnectionConfig'
            });
        }
        return finalPid;
    }

    private resolveRuntimeBundle(): string {
        const configured = vscode.workspace
            .getConfiguration('path.sniff')
            .get<string>('needleRuntimeBundle', '')
            .trim();
        if (!configured) {
            throw new StructuredError({
                error: '请先配置 path.sniff.needleRuntimeBundle。',
                errorType: 'NeedleRuntimeMissing'
            });
        }

        const runtimeBundle = path.resolve(configured);
        for (const fileName of ['needle-controller.exe', 'needle-probe.dll', 'needle-pythonhost.dll']) {
            const filePath = path.join(runtimeBundle, fileName);
            if (!fs.existsSync(filePath)) {
                throw new StructuredError({
                    error: `Needle runtime_bundle 缺少 ${fileName}: ${filePath}`,
                    errorType: 'NeedleRuntimeInvalid'
                });
            }
        }
        return runtimeBundle;
    }

    private getFallbackPythonRoot(): string {
        return vscode.workspace
            .getConfiguration('path.sniff')
            .get<string>('fallbackPythonRoot', '')
            .trim();
    }

    private getRuntimePolicy(): string {
        const configured = vscode.workspace
            .getConfiguration('path.sniff')
            .get<string>('runtimePolicy', 'auto');
        return normalizeRuntimePolicy(configured);
    }

    private getTargetProfile(): string {
        const configured = vscode.workspace
            .getConfiguration('path.sniff')
            .get<string>('targetProfile', 'auto');
        return normalizeTargetProfile(configured);
    }

    private createRuntimeEnv(runtimeBundle: string): NodeJS.ProcessEnv {
        const env = { ...process.env };
        env['PATH'] = [runtimeBundle, env['PATH'] || ''].filter(Boolean).join(';');
        return env;
    }

    private createLoadappEnv(targetExe: string): NodeJS.ProcessEnv {
        const runtimeBundle = this.resolveRuntimeBundle();
        const env = { ...process.env };
        delete env['QT_QPA_PLATFORMTHEME'];

        if (!this.targetHasEmbeddedQtLayout(targetExe)) {
            env['QT_PLUGIN_PATH'] = path.join(runtimeBundle, 'plugins');
            env['QT_QPA_PLATFORM_PLUGIN_PATH'] = path.join(runtimeBundle, 'plugins', 'platforms');
        } else {
            delete env['QT_PLUGIN_PATH'];
            delete env['QT_QPA_PLATFORM_PLUGIN_PATH'];
        }

        env['PATH'] = [path.dirname(targetExe), runtimeBundle, env['PATH'] || ''].filter(Boolean).join(';');
        return env;
    }

    private targetHasEmbeddedQtLayout(targetExe: string): boolean {
        const targetDir = path.dirname(targetExe);
        return [
            path.join(targetDir, 'qt.conf'),
            path.join(targetDir, 'platforms', 'qwindows.dll'),
            path.join(targetDir, 'plugins', 'platforms', 'qwindows.dll')
        ].some(candidate => fs.existsSync(candidate));
    }
}

export const needleRuntimeServiceTestOnly = {
    parseControllerStdout,
    splitCommandLineArgs,
    normalizeRuntimePolicy,
    normalizeTargetProfile
};
