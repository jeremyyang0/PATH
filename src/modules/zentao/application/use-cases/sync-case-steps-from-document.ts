import { GetZentaoCase } from './get-zentao-case';
import { UpdateZentaoCaseSteps } from './update-zentao-case-steps';
import { ZentaoCaseStep, ZentaoCaseUpdate } from '../../domain/zentao-case';

export interface DocumentStep {
    readonly desc: string;
    readonly expect: string;
}

export interface DocumentCase {
    readonly precondition: string;
    readonly steps: readonly DocumentStep[];
}

export interface SyncCaseStepsApproval {
    approve(caseId: string): Promise<boolean>;
    notifySynced(caseId: string): Promise<void>;
}

export type SyncCaseStepsResult =
    | { status: 'no-local-steps' | 'no-changes' }
    | { status: 'skipped' }
    | { status: 'synced'; update: ZentaoCaseUpdate };

function stripIndex(text: string): string {
    return text.replace(/^\d+[:：\s]*/, '').trim();
}

function normalizeMultilineText(text: string): string {
    return text
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');
}

function normalizePreconditionForCompare(text: string): string {
    return normalizeMultilineText(text)
        .split('\n')
        .map(line => line.replace(/^(\d+)\s*[.、:：]\s*/, '$1. '))
        .join('\n');
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

function hasCaseChanges(localCase: DocumentCase, remotePrecondition: string, remoteSteps: readonly ZentaoCaseStep[]): boolean {
    return normalizePreconditionForCompare(localCase.precondition) !== normalizePreconditionForCompare(remotePrecondition)
        || hasStepChanges(localCase.steps, remoteSteps);
}

export class SyncCaseStepsFromDocument {
    public constructor(
        private readonly getCase: GetZentaoCase,
        private readonly updateCaseSteps: UpdateZentaoCaseSteps
    ) {}

    /**
     * 保存测试文件时同时比较前置条件和步骤，只有本地内容与禅道远端确实有差异才触发确认与回写。
     */
    public async execute(
        caseId: string,
        localCase: DocumentCase,
        approval: SyncCaseStepsApproval
    ): Promise<SyncCaseStepsResult> {
        if (localCase.steps.length === 0 && normalizeMultilineText(localCase.precondition).length === 0) {
            return { status: 'no-local-steps' };
        }

        const remoteCase = await this.getCase.execute(caseId);
        if (!hasCaseChanges(localCase, remoteCase.precondition, remoteCase.steps)) {
            return { status: 'no-changes' };
        }

        const approved = await approval.approve(caseId);
        if (!approved) {
            return { status: 'skipped' };
        }

        const update = {
            precondition: localCase.precondition,
            steps: localCase.steps.map(step => ({
                desc: step.desc,
                expect: step.expect
            }))
        };
        await this.updateCaseSteps.execute(caseId, update);
        await approval.notifySynced(caseId);
        return { status: 'synced', update };
    }
}
