import * as vscode from 'vscode';

import type { SymbolDescriptor } from '../../domain/symbol-descriptor';

export class CodeIndexTreeNode extends vscode.TreeItem {
  constructor(public readonly symbol: SymbolDescriptor) {
    super(symbol.name, vscode.TreeItemCollapsibleState.None);
    this.description = `${symbol.kind}:${symbol.line}`;
    this.tooltip = `${symbol.path}:${symbol.line}`;
  }
}
