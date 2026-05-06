import type { ZentaoConfigProvider } from '../ports/zentao-config-provider';
import type { ZentaoGateway } from '../ports/zentao-gateway';
import type { ZentaoWorkItem } from '../../domain/zentao-work-item';
import { ZentaoSessionResolver } from './zentao-session-resolver';

export class LoadMyZentaoWorkItems {
  private readonly sessionResolver: ZentaoSessionResolver;

  constructor(
    private readonly gateway: ZentaoGateway,
    configProvider: ZentaoConfigProvider,
  ) {
    this.sessionResolver = new ZentaoSessionResolver(configProvider, gateway);
  }

  async execute(): Promise<readonly ZentaoWorkItem[]> {
    return this.sessionResolver.executeWithSession(session => this.gateway.loadAssignedWorkItems(session));
  }
}
