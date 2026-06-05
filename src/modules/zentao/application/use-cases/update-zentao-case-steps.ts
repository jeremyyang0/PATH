import { ZentaoCaseUpdate } from '../../domain/zentao-case';
import { ZentaoConfigProvider } from '../ports/zentao-config-provider';
import { ZentaoGateway } from '../ports/zentao-gateway';
import { ZentaoSessionResolver } from './zentao-session-resolver';

export class UpdateZentaoCaseSteps {
    private readonly sessionResolver: ZentaoSessionResolver;

    public constructor(
        private readonly gateway: ZentaoGateway,
        configProvider: ZentaoConfigProvider
    ) {
        this.sessionResolver = new ZentaoSessionResolver(configProvider, gateway);
    }

    public async execute(caseId: string, update: ZentaoCaseUpdate): Promise<void> {
        await this.sessionResolver.executeWithSession(session => this.gateway.updateCaseSteps(session, caseId, update));
    }
}
