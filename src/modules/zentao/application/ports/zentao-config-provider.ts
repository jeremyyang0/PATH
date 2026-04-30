export interface ZentaoConfig {
    readonly baseUrl: string;
    readonly account: string;
    readonly password?: string;
}

export interface ZentaoConfigProvider {
    read(): Promise<ZentaoConfig | null>;
}
