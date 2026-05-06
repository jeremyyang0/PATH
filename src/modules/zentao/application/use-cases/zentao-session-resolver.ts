import type { ZentaoConfig, ZentaoConfigProvider } from '../ports/zentao-config-provider';
import type { ZentaoGateway } from '../ports/zentao-gateway';
import type { ZentaoSession } from '../../domain/zentao-session';

/**
 * 每次禅道操作都基于当前 VS Code 设置重新登录，避免复用过期 token 或旧用户名。
 */
export class ZentaoSessionResolver {
    public constructor(
        private readonly configProvider: ZentaoConfigProvider,
        private readonly gateway: ZentaoGateway
    ) {}

    public async resolve(): Promise<ZentaoSession> {
        const config = await this.readRequiredConfig();
        return this.loginFromConfig(config);
    }

    public async executeWithSession<T>(operation: (session: ZentaoSession) => Promise<T>): Promise<T> {
        const config = await this.readRequiredConfig();
        const session = await this.loginFromConfig(config);
        return operation(session);
    }

    private async readRequiredConfig(): Promise<ZentaoConfig> {
        const config = await this.configProvider.read();
        if (!config) {
            throw new Error('请先在 PATH 设置中配置禅道地址和用户名。');
        }
        return config;
    }

    private async loginFromConfig(config: ZentaoConfig): Promise<ZentaoSession> {
        if (!config.password) {
            throw new Error('禅道密码缺失，请在 PATH 设置中提供密码。');
        }
        return this.gateway.login(config.baseUrl, config.account, config.password);
    }
}
