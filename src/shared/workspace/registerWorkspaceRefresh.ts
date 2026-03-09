import * as vscode from 'vscode';
import { isMethodRelatedPath, isOrderFile, isPythonFile } from '../path/workspacePathUtils';

export interface WorkspaceRefreshHandlers {
    refreshEleTree(): void;
    refreshMethodsTree(): void;
    refreshPathFileTree(): void;
    onPythonTestFileSaved?(document: vscode.TextDocument): Promise<void>;
}

export function registerWorkspaceRefresh(handlers: WorkspaceRefreshHandlers): vscode.Disposable[] {
    const refreshForChangedPath = (changedPath: string): void => {
        if (isPythonFile(changedPath)) {
            handlers.refreshEleTree();
        }

        if (isMethodRelatedPath(changedPath)) {
            handlers.refreshMethodsTree();
        }

        if (isOrderFile(changedPath)) {
            handlers.refreshPathFileTree();
        }
    };

    const refreshForStructureChanges = (changedPaths: string[]): void => {
        let shouldRefreshEleTree = false;
        let shouldRefreshMethodsTree = false;
        let shouldRefreshPathFileTree = changedPaths.length > 0;

        for (const changedPath of changedPaths) {
            if (isPythonFile(changedPath)) {
                shouldRefreshEleTree = true;
            }

            if (isMethodRelatedPath(changedPath)) {
                shouldRefreshMethodsTree = true;
            }

            if (isOrderFile(changedPath)) {
                shouldRefreshPathFileTree = true;
            }
        }

        if (shouldRefreshEleTree) {
            handlers.refreshEleTree();
        }

        if (shouldRefreshMethodsTree) {
            handlers.refreshMethodsTree();
        }

        if (shouldRefreshPathFileTree) {
            handlers.refreshPathFileTree();
        }
    };

    const pythonWatcher = vscode.workspace.createFileSystemWatcher('**/*.py');
    pythonWatcher.onDidChange(uri => {
        refreshForChangedPath(uri.fsPath);
    });
    pythonWatcher.onDidCreate(uri => {
        refreshForStructureChanges([uri.fsPath]);
    });
    pythonWatcher.onDidDelete(uri => {
        refreshForStructureChanges([uri.fsPath]);
    });

    const orderWatcher = vscode.workspace.createFileSystemWatcher('**/.order');
    orderWatcher.onDidChange(uri => {
        refreshForChangedPath(uri.fsPath);
    });
    orderWatcher.onDidCreate(uri => {
        refreshForStructureChanges([uri.fsPath]);
    });
    orderWatcher.onDidDelete(uri => {
        refreshForStructureChanges([uri.fsPath]);
    });

    return [
        pythonWatcher,
        orderWatcher,
        vscode.workspace.onDidCreateFiles(event => {
            refreshForStructureChanges(event.files.map(file => file.fsPath));
        }),
        vscode.workspace.onDidDeleteFiles(event => {
            refreshForStructureChanges(event.files.map(file => file.fsPath));
        }),
        vscode.workspace.onDidRenameFiles(event => {
            const changedPaths = event.files.flatMap(file => [file.oldUri.fsPath, file.newUri.fsPath]);
            refreshForStructureChanges(changedPaths);
        }),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('files.exclude')) {
                handlers.refreshPathFileTree();
            }
        }),
        vscode.workspace.onDidSaveTextDocument(async document => {
            const filePath = document.fileName;

            if (isPythonFile(filePath) || isOrderFile(filePath)) {
                refreshForChangedPath(filePath);
            }

            if (handlers.onPythonTestFileSaved) {
                await handlers.onPythonTestFileSaved(document);
            }
        })
    ];
}
