import type { CodeIndex, FileIndex } from '../../domain/file-index';
import type { FileTextReader } from '../ports/file-text-reader';
import type { LanguageSymbolExtractor } from '../ports/language-symbol-extractor';
import type { WorkspaceFileScanner } from '../ports/workspace-file-scanner';

export interface RebuildCodeIndexInput {
  readonly includeGlobs: readonly string[];
  readonly excludeGlobs: readonly string[];
}

export class RebuildCodeIndex {
  constructor(
    private readonly scanner: WorkspaceFileScanner,
    private readonly reader: FileTextReader,
    private readonly extractors: readonly LanguageSymbolExtractor[],
  ) {}

  async execute(input: RebuildCodeIndexInput): Promise<CodeIndex> {
    const files = await this.scanner.scan(input.includeGlobs, input.excludeGlobs);
    const indexedFiles: FileIndex[] = [];

    for (const path of files) {
      const extractor = this.extractors.find((candidate) => candidate.supports(path));
      if (!extractor) {
        continue;
      }

      const source = await this.reader.read(path);
      const symbols = await extractor.extract(path, source);
      indexedFiles.push({ path, symbols });
    }

    return {
      files: indexedFiles,
      generatedAt: new Date(),
    };
  }
}
