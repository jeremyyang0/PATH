import type { ZentaoGateway } from '../ports/zentao-gateway';
import type { ZentaoSession } from '../../domain/zentao-session';

export interface LoginZentaoInput {
  readonly baseUrl: string;
  readonly account: string;
  readonly password: string;
}

export class LoginZentao {
  constructor(
    private readonly gateway: ZentaoGateway
  ) {}

  async execute(input: LoginZentaoInput): Promise<ZentaoSession> {
    // 登录命令只校验账号密码可用，不再持久化 token，后续请求会按当前设置重新登录。
    return this.gateway.login(input.baseUrl, input.account, input.password);
  }
}
