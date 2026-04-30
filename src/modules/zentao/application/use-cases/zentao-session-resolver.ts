import { CredentialStore } from '../ports/credential-store';
import { ZentaoConfigProvider } from '../ports/zentao-config-provider';
import { ZentaoGateway } from '../ports/zentao-gateway';
import { ZentaoSession } from '../../domain/zentao-session';

/**
 * 统一解析当前可用的禅道会话，优先复用 SecretStorage 中的 token，必要时再走密码登录。
 */
export class ZentaoSessionResolver {
    public constructor(
        private readonly configProvider: ZentaoConfigProvider,
        private readonly credentials: CredentialStore,
        private readonly gateway: ZentaoGateway
    ) {}

    public async resolve(): Promise<ZentaoSession> {
        const config = await this.configProvider.read();
        if (!config) {
            throw new Error('请先在 PATH 设置中配置禅道地址和用户名。');
        }

        const session = await this.credentials.read();
        if (session && session.baseUrl === config.baseUrl && session.account === config.account) {
            return session;
        }

        if (!config.password) {
            throw new Error('禅道密码缺失，请先执行登录命令或在设置中提供密码。');
        }

        const nextSession = await this.gateway.login(config.baseUrl, config.account, config.password);
        await this.credentials.write(nextSession);
        return nextSession;
    }
}
