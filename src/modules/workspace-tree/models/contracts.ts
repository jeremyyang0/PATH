import { PathFileTreeDataProvider } from '../providers/pathFileTreeDataProvider';
import { ZentaoCase } from '../../zentao';

export type ExcludeConfig = Record<string, boolean | { when?: string }>;

export interface WorkspaceTreeFeatureDependencies {
    loadZentaoCaseById(caseId: string): Promise<ZentaoCase | null>;
}

export interface PathFileTreeFeature {
    dataProvider: PathFileTreeDataProvider;
    refresh(): void;
    revealFileInTree(filePath: string): Promise<void>;
}
