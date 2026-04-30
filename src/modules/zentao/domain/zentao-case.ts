export interface ZentaoCaseStep {
    readonly desc: string;
    readonly expect: string;
}

export interface ZentaoCase {
    readonly id: string;
    readonly title: string;
    readonly precondition: string;
    readonly steps: readonly ZentaoCaseStep[];
    readonly url?: string;
}
