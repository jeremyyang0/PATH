import * as vscode from 'vscode';
import { registerAiFeature } from './features/ai/register/registerAiFeature';
import { registerEleTreeFeature } from './features/ele-tree/register/registerEleTreeFeature';
import { registerMethodsTreeFeature } from './features/methods-tree/register/registerMethodsTreeFeature';
import { registerPathFileTreeFeature } from './features/path-file-tree/register/registerPathFileTreeFeature';
import { registerSecondaryViewFeature } from './features/secondary-view/register/registerSecondaryViewFeature';
import { registerSniffFeature } from './features/sniff/register/registerSniffFeature';
import { registerWorkbenchFeature } from './features/workbench/register/registerWorkbenchFeature';
import { createZentaoSaveHandler } from './features/zentao/register/registerZentaoFeature';
import { registerWorkspaceRefresh } from './shared/workspace/registerWorkspaceRefresh';

export function activate(context: vscode.ExtensionContext): void {
    // 先注册基础树视图，后续 feature 通过依赖项互相联动。
    const pathFileTreeFeature = registerPathFileTreeFeature(context);
    const eleTreeFeature = registerEleTreeFeature(context, {
        revealFileInPathTree: pathFileTreeFeature.revealFileInTree
    });
    const methodsTreeFeature = registerMethodsTreeFeature(context, {
        revealFileInPathTree: pathFileTreeFeature.revealFileInTree
    });
    registerSecondaryViewFeature(context);
    registerAiFeature(context);
    registerWorkbenchFeature(context);
    registerSniffFeature(context);

    context.subscriptions.push(
        // 工作区刷新由共享层统一托管，避免每个 feature 各自监听文件事件。
        ...registerWorkspaceRefresh({
            refreshEleTree: eleTreeFeature.refresh,
            refreshMethodsTree: methodsTreeFeature.refresh,
            refreshPathFileTree: pathFileTreeFeature.refresh,
            onPythonTestFileSaved: createZentaoSaveHandler()
        })
    );

    setTimeout(() => {
        // 扩展启动后补一次首屏加载，确保开发宿主恢复时树视图能拿到数据。
        eleTreeFeature.refresh();
        methodsTreeFeature.refresh();
        pathFileTreeFeature.refresh();

        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document.uri.scheme === 'file') {
            void pathFileTreeFeature.revealFileInTree(activeEditor.document.uri.fsPath);
        }
    }, 500);

    console.log('PATH plugin activated');
}

export function deactivate(): void {
    console.log('PATH plugin deactivated');
}
