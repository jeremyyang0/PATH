import type { SymbolDescriptor } from './symbol-descriptor';

export interface FileIndex {
  readonly path: string;
  readonly symbols: readonly SymbolDescriptor[];
}

export interface CodeIndex {
  readonly files: readonly FileIndex[];
  readonly generatedAt: Date;
}
