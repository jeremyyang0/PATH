export type SymbolKind = 'class' | 'function' | 'method';

export interface SymbolDescriptor {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly line: number;
  readonly path: string;
}
