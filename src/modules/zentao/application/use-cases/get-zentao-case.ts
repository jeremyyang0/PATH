import { ZentaoCase } from '../../domain/zentao-case';
import { ZentaoConfigProvider } from '../ports/zentao-config-provider';
import { ZentaoGateway } from '../ports/zentao-gateway';
import { ZentaoSessionResolver } from './zentao-session-resolver';

export class GetZentaoCase {
    private readonly sessionResolver: ZentaoSessionResolver;

    public constructor(
        private readonly gateway: ZentaoGateway,
        configProvider: ZentaoConfigProvider
    ) {
        this.sessionResolver = new ZentaoSessionResolver(configProvider, gateway);
    }

    /**
     * 获取用例详情时始终先确保会话可用，避免 PATH 文件树和保存同步逻辑重复处理登录细节。
     */
    public async execute(caseId: string): Promise<ZentaoCase> {
        return this.sessionResolver.executeWithSession(session => this.gateway.getCase(session, caseId));
    }
}
