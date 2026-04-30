import * as vscode from 'vscode';

import type { WorkspaceFileScanner } from '../../application/ports/workspace-file-scanner';

export class WorkspaceGlobScanner implements WorkspaceFileScanner {
  async scan(includeGlobs: readonly string[], excludeGlobs: readonly string[]): Promise<readonly string[]> {
    const include = includeGlobs.length > 0 ? `{${includeGlobs.join(',')}}` : '**/*';
    const exclude = excludeGlobs.length > 0 ? `{${excludeGlobs.join(',')}}` : undefined;
    const uris = await vscode.workspace.findFiles(include, exclude);
    return uris.map((uri) => uri.fsPath);
  }
}
