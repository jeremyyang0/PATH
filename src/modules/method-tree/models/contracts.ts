export interface MethodsTreeFeature {
    refresh(): void;
}

export interface MethodsTreeFeatureDependencies {
    revealFileInPathTree(filePath: string): Promise<void>;
}
