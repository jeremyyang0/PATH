export interface WorkspaceCodeIndex {
    readonly generatedAt: Date;
    readonly packageNames: Record<string, string>;
    readonly elementFiles: ElementFileIndex[];
    readonly methodFiles: MethodFileIndex[];
}

export interface ElementFileIndex {
    readonly filePath: string;
    readonly className: string;
    readonly classLine: number;
    readonly baseClasses: string[];
    readonly elements: ElementDescriptor[];
}

export interface ElementDescriptor {
    readonly name: string;
    readonly value: string;
    readonly line: number;
    readonly arguments: string[];
    readonly desc: string;
    readonly hierarchy: string[];
}

export interface MethodFileIndex {
    readonly filePath: string;
    readonly methods: MethodDescriptor[];
}

export interface MethodDescriptor {
    readonly name: string;
    readonly line: number;
    readonly doc: string;
    readonly className?: string;
}
