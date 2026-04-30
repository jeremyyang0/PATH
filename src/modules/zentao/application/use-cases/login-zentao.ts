import type { CredentialStore } from '../ports/credential-store';
import type { ZentaoGateway } from '../ports/zentao-gateway';
import type { ZentaoSession } from '../../domain/zentao-session';

export interface LoginZentaoInput {
  readonly baseUrl: string;
  readonly account: string;
  readonly password: string;
}

export class LoginZentao {
  constructor(
    private readonly gateway: ZentaoGateway,
    private readonly credentials: CredentialStore,
  ) {}

  async execute(input: LoginZentaoInput): Promise<ZentaoSession> {
    // 登录命令只关心“拿到 token 并持久化”，其它功能统一复用已保存会话。
    const session = await this.gateway.login(input.baseUrl, input.account, input.password);
    await this.credentials.write(session);
    return session;
  }
}
