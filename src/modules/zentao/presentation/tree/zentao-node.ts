import * as vscode from 'vscode';

import type { ZentaoWorkItem } from '../../domain/zentao-work-item';

export class ZentaoNode extends vscode.TreeItem {
  constructor(public readonly item: ZentaoWorkItem) {
    super(item.title, vscode.TreeItemCollapsibleState.None);
    this.description = item.status;
    this.tooltip = `${item.kind} #${item.id}`;
    this.contextValue = 'pathZentaoItem';
    this.command = {
      command: 'pathZentaoTree.openItem',
      title: '打开禅道工单',
      arguments: [this]
    };
  }
}
