import { GetZentaoCase } from './get-zentao-case';
import { UpdateZentaoCaseSteps } from './update-zentao-case-steps';
import { ZentaoCaseStep } from '../../domain/zentao-case';

export interface DocumentStep {
    readonly desc: string;
    readonly expect: string;
}

export interface SyncCaseStepsApproval {
    approve(caseId: string): Promise<boolean>;
    notifySynced(caseId: string): Promise<void>;
}

export type SyncCaseStepsResult =
    | { status: 'no-local-steps' | 'no-changes' }
    | { status: 'skipped' }
    | { status: 'synced'; steps: readonly ZentaoCaseStep[] };

function stripIndex(text: string): string {
    return text.replace(/^\d+[:：\s]*/, '').trim();
}

function hasStepChanges(localSteps: readonly DocumentStep[], remoteSteps: readonly ZentaoCaseStep[]): boolean {
    if (localSteps.length !== remoteSteps.length) {
        return true;
    }

    for (let index = 0; index < localSteps.length; index++) {
        const localStep = localSteps[index];
        const remoteStep = remoteSteps[index];
        if (!localStep || !remoteStep) {
            return true;
        }

        if (localStep.desc !== stripIndex(remoteStep.desc) || localStep.expect !== stripIndex(remoteStep.expect)) {
            return true;
        }
    }

    return false;
}

export class SyncCaseStepsFromDocument {
    public constructor(
        private readonly getCase: GetZentaoCase,
        private readonly updateCaseSteps: UpdateZentaoCaseSteps
    ) {}

    /**
     * 保存测试文件时只在本地步骤和禅道远端确实有差异时才触发确认与回写。
     */
    public async execute(
        caseId: string,
        localSteps: readonly DocumentStep[],
        approval: SyncCaseStepsApproval
    ): Promise<SyncCaseStepsResult> {
        if (localSteps.length === 0) {
            return { status: 'no-local-steps' };
        }

        const remoteCase = await this.getCase.execute(caseId);
        if (!hasStepChanges(localSteps, remoteCase.steps)) {
            return { status: 'no-changes' };
        }

        const approved = await approval.approve(caseId);
        if (!approved) {
            return { status: 'skipped' };
        }

        const steps = localSteps.map(step => ({
            desc: step.desc,
            expect: step.expect
        }));
        await this.updateCaseSteps.execute(caseId, steps);
        await approval.notifySynced(caseId);
        return { status: 'synced', steps };
    }
}
