import type { ZentaoSession } from '../../domain/zentao-session';
import type { ZentaoCase, ZentaoCaseStep } from '../../domain/zentao-case';
import type { ZentaoWorkItem } from '../../domain/zentao-work-item';

export interface ZentaoGateway {
  login(baseUrl: string, account: string, password: string): Promise<ZentaoSession>;
  loadAssignedWorkItems(session: ZentaoSession): Promise<readonly ZentaoWorkItem[]>;
  getCase(session: ZentaoSession, caseId: string): Promise<ZentaoCase>;
  updateCaseSteps(session: ZentaoSession, caseId: string, steps: readonly ZentaoCaseStep[]): Promise<void>;
}
