import { PathFileTreeDataProvider } from '../providers/pathFileTreeDataProvider';

export type ExcludeConfig = Record<string, boolean | { when?: string }>;

export interface PathFileTreeFeature {
    dataProvider: PathFileTreeDataProvider;
    refresh(): void;
    revealFileInTree(filePath: string): Promise<void>;
}
