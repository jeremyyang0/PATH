import { ParseStepOptions, StepInfo } from '../models/aiModels';

export function parseStepsFromFile(content: string, options: ParseStepOptions = {}): StepInfo[] {
    const includePreconditions = options.includePreconditions ?? false;
    const lines = content.split('\n');
    const steps: StepInfo[] = [];

    const preconditionPattern = /^\s*#\s*前置步骤\s*(\d+)?[:\s：]?\s*(.+)/;
    const stepPattern = /^\s*#\s*步骤\s*(\d+)?[:\s：]?\s*(.+)/;
    const expectPattern = /^\s*#\s*预期\s*(\d+)?[:\s：]?\s*(.+)/;

    let currentStep: StepInfo | null = null;

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index] || '';

        const preconditionMatch = line.match(preconditionPattern);
        if (includePreconditions && preconditionMatch) {
            if (currentStep) {
                steps.push(currentStep);
            }
            currentStep = {
                line: index,
                kind: 'precondition',
                desc: preconditionMatch[2]?.trim() || '',
                expect: ''
            };
            continue;
        }

        const stepMatch = line.match(stepPattern);
        if (stepMatch) {
            if (currentStep) {
                steps.push(currentStep);
            }
            currentStep = {
                line: index,
                kind: 'step',
                desc: stepMatch[2]?.trim() || '',
                expect: ''
            };
            continue;
        }

        const expectMatch = line.match(expectPattern);
        if (expectMatch && currentStep && currentStep.kind === 'step') {
            currentStep.expect = expectMatch[2]?.trim() || '';
            currentStep.expectLine = index;
        }
    }

    if (currentStep) {
        steps.push(currentStep);
    }

    for (let index = 0; index < steps.length; index++) {
        const step = steps[index]!;
        const nextStep = steps[index + 1];
        const startScan = step.line + 1;
        const endScan = nextStep ? nextStep.line : lines.length;

        let hasCode = false;
        const existingCode: string[] = [];
        for (let scanIndex = startScan; scanIndex < endScan; scanIndex++) {
            const lineContent = lines[scanIndex]?.trim();
            const isFixtureYield = step.kind === 'precondition' && !!lineContent && /^yield\b/.test(lineContent);
            if (isFixtureYield) {
                continue;
            }
            if (lineContent && !lineContent.startsWith('#')) {
                hasCode = true;
                existingCode.push(lineContent);
            }
        }

        step.hasCode = hasCode;
        if (hasCode) {
            step.existingCode = existingCode;
        }
    }

    return steps;
}
