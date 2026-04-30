import type { CredentialStore } from '../ports/credential-store';
import type { ZentaoConfigProvider } from '../ports/zentao-config-provider';
import type { ZentaoGateway } from '../ports/zentao-gateway';
import type { ZentaoWorkItem } from '../../domain/zentao-work-item';
import { ZentaoSessionResolver } from './zentao-session-resolver';

export class LoadMyZentaoWorkItems {
  private readonly sessionResolver: ZentaoSessionResolver;

  constructor(
    private readonly gateway: ZentaoGateway,
    credentials: CredentialStore,
    configProvider: ZentaoConfigProvider,
  ) {
    this.sessionResolver = new ZentaoSessionResolver(configProvider, credentials, gateway);
  }

  async execute(): Promise<readonly ZentaoWorkItem[]> {
    const session = await this.sessionResolver.resolve();
    return this.gateway.loadAssignedWorkItems(session);
  }
}
