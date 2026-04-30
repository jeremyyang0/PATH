import { ZentaoCaseStep } from '../../domain/zentao-case';
import { CredentialStore } from '../ports/credential-store';
import { ZentaoConfigProvider } from '../ports/zentao-config-provider';
import { ZentaoGateway } from '../ports/zentao-gateway';
import { ZentaoSessionResolver } from './zentao-session-resolver';

export class UpdateZentaoCaseSteps {
    private readonly sessionResolver: ZentaoSessionResolver;

    public constructor(
        private readonly gateway: ZentaoGateway,
        credentials: CredentialStore,
        configProvider: ZentaoConfigProvider
    ) {
        this.sessionResolver = new ZentaoSessionResolver(configProvider, credentials, gateway);
    }

    public async execute(caseId: string, steps: readonly ZentaoCaseStep[]): Promise<void> {
        const session = await this.sessionResolver.resolve();
        await this.gateway.updateCaseSteps(session, caseId, steps);
    }
}
