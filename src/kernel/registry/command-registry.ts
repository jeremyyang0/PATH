import * as vscode from 'vscode';

import { DisposableStore } from '../../shared/core/disposable-store';
import type { CommandId } from '../ids/commands';

export type CommandHandler = (...args: readonly unknown[]) => unknown | Promise<unknown>;

export class CommandRegistry {
  constructor(private readonly disposables: DisposableStore) {}

  register(id: CommandId, handler: CommandHandler, thisArg?: unknown): void {
    this.disposables.add(vscode.commands.registerCommand(id, handler, thisArg));
  }
}
