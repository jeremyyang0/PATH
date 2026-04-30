import * as vscode from 'vscode';

export class DisposableStore implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];

  add<T extends vscode.Disposable>(disposable: T): T {
    this.disposables.push(disposable);
    return disposable;
  }

  dispose(): void {
    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }
}
