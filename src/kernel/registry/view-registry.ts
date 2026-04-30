import * as vscode from 'vscode';

import { DisposableStore } from '../../shared/core/disposable-store';
import type { ViewId } from '../ids/views';

export interface TreeViewSpec<T> {
  readonly id: ViewId;
  readonly provider: vscode.TreeDataProvider<T>;
  readonly options?: Omit<vscode.TreeViewOptions<T>, 'treeDataProvider'>;
}

export class ViewRegistry {
  constructor(private readonly disposables: DisposableStore) {}

  registerTreeView<T>(spec: TreeViewSpec<T>): vscode.TreeView<T> {
    const view = vscode.window.createTreeView(spec.id, {
      treeDataProvider: spec.provider,
      ...spec.options,
    });

    return this.disposables.add(view);
  }
}
