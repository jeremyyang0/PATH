import * as vscode from 'vscode';

import { DisposableStore } from '../../shared/core/disposable-store';
import { CommandRegistry } from '../registry/command-registry';
import { ViewRegistry } from '../registry/view-registry';

export interface KernelContext {
  readonly extension: vscode.ExtensionContext;
  readonly disposables: DisposableStore;
  readonly commands: CommandRegistry;
  readonly views: ViewRegistry;
}

export function createKernelContext(extension: vscode.ExtensionContext): KernelContext {
  const disposables = new DisposableStore();
  extension.subscriptions.push(disposables);

  return {
    extension,
    disposables,
    commands: new CommandRegistry(disposables),
    views: new ViewRegistry(disposables),
  };
}
