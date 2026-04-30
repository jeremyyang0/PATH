import * as vscode from 'vscode';
import { createKernelContext } from './kernel/bootstrap/extension-bootstrap';
import { registerAiFeature } from './modules/ai';
import { registerEleTreeFeature } from './modules/element-tree';
import { registerMethodsTreeFeature } from './modules/method-tree';
import { registerPathFileTreeFeature } from './modules/workspace-tree';
import { registerSecondaryViewFeature, registerWorkbenchFeature } from './modules/workbench';
import { registerZentaoModule } from './modules/zentao';
import { registerSniffFeature } from './modules/sniff';
import { registerWorkspaceRefresh } from './platform/workspace/registerWorkspaceRefresh';

export function activate(context: vscode.ExtensionContext): void {
    // 扩展入口只负责装配模块与生命周期，避免业务逻辑继续堆进 composition root。
    createKernelContext(context);

    // 先注册基础树视图，后续 feature 通过依赖项互相联动。
    const zentaoModule = registerZentaoModule(context);
    const pathFileTreeFeature = registerPathFileTreeFeature(context, {
        loadZentaoCaseById: zentaoModule.getCase
    });
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
            onPythonTestFileSaved: zentaoModule.onPythonTestFileSaved
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
