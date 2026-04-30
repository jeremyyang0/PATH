import type { SymbolDescriptor } from '../../domain/symbol-descriptor';

export interface LanguageSymbolExtractor {
  supports(path: string): boolean;
  extract(path: string, source: string): Promise<readonly SymbolDescriptor[]>;
}
