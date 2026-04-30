import * as vscode from 'vscode';
import { ZentaoConfig, ZentaoConfigProvider } from '../../application/ports/zentao-config-provider';

function normalizeBaseUrl(rawHost: string): string {
    const trimmedHost = rawHost.trim();
    const base = /^https?:\/\//i.test(trimmedHost) ? trimmedHost : `http://${trimmedHost}`;
    return base.replace(/\/+$/, '');
}

export class VscodeZentaoConfigProvider implements ZentaoConfigProvider {
    /**
     * 禅道配置继续从公开设置项读取，密码仅作为 SecretStorage 会话缺失时的兜底输入。
     */
    public async read(): Promise<ZentaoConfig | null> {
        const config = vscode.workspace.getConfiguration('path.zentao');
        const host = config.get<string>('host') || '';
        const account = config.get<string>('username') || '';
        const password = config.get<string>('password') || '';

        if (!host.trim() || !account.trim()) {
            return null;
        }

        return {
            baseUrl: normalizeBaseUrl(host),
            account: account.trim(),
            password: password.trim() || undefined
        };
    }
}
