export interface EleTreeFeature {
    refresh(): void;
}

export interface EleTreeFeatureDependencies {
    revealFileInPathTree(filePath: string): Promise<void>;
}

export interface EleTreeRevealTarget {
    eleFilePath: string;
    eleVariableName?: string;
    eleLineNumber?: number;
}

export interface WebviewElementPayload {
    label?: string;
    fullPath?: string;
    eleFilePath?: string;
    eleVariableName?: string;
}
