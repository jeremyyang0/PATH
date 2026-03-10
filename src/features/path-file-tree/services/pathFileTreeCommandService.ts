import * as path from 'path';
import * as vscode from 'vscode';
import { createCase } from '../../../shared/case/createCase';
import { getWorkspaceRootUri } from '../../../shared/path/workspacePathUtils';
import { TreeItem } from '../../../shared/tree/treeItem';
import { PathFileTreeDataProvider } from '../providers/pathFileTreeDataProvider';

export class PathFileTreeCommandService {
    private activeItem?: TreeItem;
    private clipboardItem?: {
        sourceUri: vscode.Uri;
        nodeType: 'file' | 'folder';
    };

    public constructor(
        private readonly dataProvider: PathFileTreeDataProvider,
        private readonly treeView: vscode.TreeView<TreeItem>
    ) {
        void this.updateClipboardContext();
    }

    public setActiveItem(item?: TreeItem): void {
        this.activeItem = item;
    }

    public refresh(): void {
        this.dataProvider.refresh();
    }

    public async revealFileInTree(filePath: string): Promise<void> {
        if (!this.treeView.visible) {
            return;
        }

        const item = this.dataProvider.findItemByPath(filePath);
        if (!item) {
            return;
        }

        try {
            await this.treeView.reveal(item, {
                select: true,
                focus: false,
                expand: true
            });
            this.activeItem = item;
        } catch (error) {
            console.error('Failed to reveal item in PATH file tree:', error);
        }
    }

    public async openItem(element?: TreeItem): Promise<void> {
        const targetItem = this.getTargetItem(element);
        if (targetItem?.filePath && targetItem.nodeType === 'file') {
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(targetItem.filePath));
        }
    }

    public async createNewFile(element?: TreeItem): Promise<void> {
        const targetUri = this.getTargetUri(element);
        if (!targetUri) {
            return;
        }

        const parentUri = element?.nodeType === 'file'
            ? vscode.Uri.file(path.dirname(targetUri.fsPath))
            : targetUri;
        const newFileUri = await this.promptForChildPath(parentUri, '输入新文件名', '例如: new_test.py 或 folder/new_test.py');
        if (!newFileUri) {
            return;
        }

        try {
            const parentDirUri = vscode.Uri.file(path.dirname(newFileUri.fsPath));
            await vscode.workspace.fs.createDirectory(parentDirUri);
            await vscode.workspace.fs.writeFile(newFileUri, new Uint8Array());
            this.refresh();
            await vscode.commands.executeCommand('vscode.open', newFileUri);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`创建文件失败: ${message}`);
        }
    }

    public async createNewFolder(element?: TreeItem): Promise<void> {
        const targetUri = this.getTargetUri(element);
        if (!targetUri) {
            return;
        }

        const parentUri = element?.nodeType === 'file'
            ? vscode.Uri.file(path.dirname(targetUri.fsPath))
            : targetUri;
        const newFolderUri = await this.promptForChildPath(parentUri, '输入新文件夹名', '例如: new_folder 或 parent/new_folder');
        if (!newFolderUri) {
            return;
        }

        try {
            await vscode.workspace.fs.createDirectory(newFolderUri);
            this.refresh();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`创建文件夹失败: ${message}`);
        }
    }

    public async renameItem(element?: TreeItem): Promise<void> {
        const targetItem = this.getTargetItem(element);
        if (!targetItem?.filePath) {
            return;
        }

        const targetUri = vscode.Uri.file(targetItem.filePath);
        const currentName = path.basename(targetUri.fsPath);
        const nextName = await vscode.window.showInputBox({
            prompt: '输入新名称',
            value: currentName,
            ignoreFocusOut: true
        });
        if (!nextName || nextName.trim() === currentName) {
            return;
        }

        const renamedUri = vscode.Uri.file(path.join(path.dirname(targetUri.fsPath), nextName.trim()));
        try {
            await vscode.workspace.fs.rename(targetUri, renamedUri, { overwrite: false });
            this.refresh();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`重命名失败: ${message}`);
        }
    }

    public async deleteItem(element?: TreeItem): Promise<void> {
        const targetItem = this.getTargetItem(element);
        if (!targetItem?.filePath) {
            return;
        }

        const targetUri = vscode.Uri.file(targetItem.filePath);
        const itemName = path.basename(targetUri.fsPath);
        const confirmed = await vscode.window.showWarningMessage(
            `确定要删除 ${itemName} 吗？`,
            { modal: true },
            '删除'
        );
        if (confirmed !== '删除') {
            return;
        }

        try {
            await vscode.workspace.fs.delete(targetUri, {
                recursive: targetItem.nodeType === 'folder',
                useTrash: true
            });
            this.refresh();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`删除失败: ${message}`);
        }
    }

    public async revealInOs(element?: TreeItem): Promise<void> {
        const targetUri = this.getTargetUri(element);
        if (targetUri) {
            await vscode.commands.executeCommand('revealFileInOS', targetUri);
        }
    }

    public async copyPath(element?: TreeItem): Promise<void> {
        const targetUri = this.getTargetUri(element);
        if (targetUri) {
            await vscode.env.clipboard.writeText(targetUri.fsPath);
        }
    }

    public async copyRelativePath(element?: TreeItem): Promise<void> {
        const targetUri = this.getTargetUri(element);
        if (!targetUri) {
            return;
        }

        const relativePath = vscode.workspace.asRelativePath(targetUri, false);
        await vscode.env.clipboard.writeText(relativePath || '.');
    }

    public async copyItem(element?: TreeItem): Promise<void> {
        const targetItem = this.getTargetItem(element);
        if (!targetItem?.filePath) {
            return;
        }

        this.clipboardItem = {
            sourceUri: vscode.Uri.file(targetItem.filePath),
            nodeType: targetItem.nodeType === 'folder' ? 'folder' : 'file'
        };
        await this.updateClipboardContext();
        vscode.window.setStatusBarMessage(`已复制 ${path.basename(targetItem.filePath)}`, 2000);
    }

    public async pasteItem(element?: TreeItem): Promise<void> {
        if (!this.clipboardItem) {
            vscode.window.showInformationMessage('PATH 文件树中没有可粘贴的项目。');
            return;
        }

        const destinationUri = this.getPasteTargetUri(element);
        if (!destinationUri) {
            return;
        }

        const { sourceUri, nodeType } = this.clipboardItem;
        if (nodeType === 'folder' && this.isSameOrDescendantPath(destinationUri.fsPath, sourceUri.fsPath)) {
            vscode.window.showErrorMessage('不能将文件夹粘贴到其自身或子目录中。');
            return;
        }

        const targetUri = await this.getAvailablePasteUri(sourceUri, destinationUri, nodeType);
        try {
            await vscode.workspace.fs.copy(sourceUri, targetUri, { overwrite: false });
            this.refresh();
            await this.revealFileInTree(targetUri.fsPath);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`粘贴失败: ${message}`);
        }
    }

    public async findInFolder(element?: TreeItem): Promise<void> {
        const targetUri = this.getTargetUri(element);
        if (!targetUri) {
            return;
        }

        const targetItem = this.getTargetItem(element);
        const searchUri = targetItem?.nodeType === 'file'
            ? vscode.Uri.file(path.dirname(targetUri.fsPath))
            : targetUri;
        const relativePath = vscode.workspace.asRelativePath(searchUri, false);
        await vscode.commands.executeCommand('workbench.action.findInFiles', {
            query: '',
            replace: '',
            triggerSearch: true,
            filesToInclude: relativePath
        });
    }

    public async createCaseForItem(element?: TreeItem): Promise<void> {
        const targetUri = this.getTargetUri(element);
        if (targetUri) {
            await createCase(targetUri);
        }
    }

    private getTargetItem(element?: TreeItem): TreeItem | undefined {
        return element ?? this.activeItem ?? this.treeView.selection[0];
    }

    private getTargetUri(element?: TreeItem): vscode.Uri | undefined {
        const targetItem = this.getTargetItem(element);
        if (targetItem?.filePath) {
            return vscode.Uri.file(targetItem.filePath);
        }

        return getWorkspaceRootUri();
    }

    // 统一处理“在目标目录下创建子路径”的输入逻辑，避免文件和目录命令各自拼路径。
    private async promptForChildPath(
        parentUri: vscode.Uri,
        prompt: string,
        placeHolder: string
    ): Promise<vscode.Uri | undefined> {
        const input = await vscode.window.showInputBox({
            prompt,
            placeHolder,
            ignoreFocusOut: true
        });

        if (!input) {
            return undefined;
        }

        const normalizedInput = input.trim().replace(/[\\/]+/g, path.sep);
        if (!normalizedInput) {
            return undefined;
        }

        return vscode.Uri.file(path.join(parentUri.fsPath, normalizedInput));
    }

    private getPasteTargetUri(element?: TreeItem): vscode.Uri | undefined {
        const targetItem = this.getTargetItem(element);
        if (!targetItem?.filePath) {
            return getWorkspaceRootUri();
        }

        if (targetItem.nodeType === 'file') {
            return vscode.Uri.file(path.dirname(targetItem.filePath));
        }

        return vscode.Uri.file(targetItem.filePath);
    }

    private async updateClipboardContext(): Promise<void> {
        await vscode.commands.executeCommand('setContext', 'pathFileTree.hasClipboardItem', Boolean(this.clipboardItem));
    }

    private isSameOrDescendantPath(candidatePath: string, sourcePath: string): boolean {
        const normalizedCandidate = path.resolve(candidatePath);
        const normalizedSource = path.resolve(sourcePath);
        if (normalizedCandidate === normalizedSource) {
            return true;
        }

        const relativePath = path.relative(normalizedSource, normalizedCandidate);
        return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
    }

    private async getAvailablePasteUri(
        sourceUri: vscode.Uri,
        destinationUri: vscode.Uri,
        nodeType: 'file' | 'folder'
    ): Promise<vscode.Uri> {
        const sourceName = path.basename(sourceUri.fsPath);

        for (let index = 0; ; index += 1) {
            const candidateName = index === 0
                ? sourceName
                : this.buildCopyName(sourceName, nodeType, index);
            const candidateUri = vscode.Uri.file(path.join(destinationUri.fsPath, candidateName));
            if (!await this.pathExists(candidateUri)) {
                return candidateUri;
            }
        }
    }

    private buildCopyName(sourceName: string, nodeType: 'file' | 'folder', index: number): string {
        const suffix = index === 1 ? ' - copy' : ` - copy ${index}`;
        if (nodeType === 'folder') {
            return `${sourceName}${suffix}`;
        }

        const parsedPath = path.parse(sourceName);
        return `${parsedPath.name}${suffix}${parsedPath.ext}`;
    }

    private async pathExists(targetUri: vscode.Uri): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(targetUri);
            return true;
        } catch {
            return false;
        }
    }
}
