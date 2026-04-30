export interface WorkspaceFileScanner {
  scan(includeGlobs: readonly string[], excludeGlobs: readonly string[]): Promise<readonly string[]>;
}
