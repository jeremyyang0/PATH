export interface ZentaoStep {
    desc: string;
    expect: string;
}

export interface ZentaoCaseInfo {
    id: number;
    title: string;
    precondition: string;
    steps: ZentaoStep[];
}
