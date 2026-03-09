import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { createExcludeMatcher } from '../../../shared/path/excludeMatcher';
import { orderItemsByDirectoryFile } from '../../../shared/path/orderUtils';
import { ORDER_FILE_NAME } from '../../../shared/path/workspacePathUtils';
import { TreeItem } from '../../../shared/tree/treeItem';
import { ExcludeConfig } from '../models/contracts';

export class PathFileTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    private readonly itemCache = new Map<string, TreeItem>();

    public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

    public refresh(): void {
        // 文件树完全依赖磁盘状态，刷新时直接清空缓存重新构建。
        this.itemCache.clear();
        this.onDidChangeTreeDataEmitter.fire();
    }

    public getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    public getParent(element: TreeItem): TreeItem | undefined {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder || !element.filePath) {
            return undefined;
        }

        const workspaceRoot = workspaceFolder.uri.fsPath;
        const parentPath = path.dirname(element.filePath);
        if (parentPath === workspaceRoot || parentPath === element.filePath) {
            return undefined;
        }

        return this.getItemForPath(parentPath, workspaceRoot);
    }

    public getChildren(element?: TreeItem): Promise<TreeItem[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return Promise.resolve([]);
        }

        const workspaceRoot = workspaceFolder.uri.fsPath;
        const directoryPath = element?.filePath || workspaceRoot;
        return Promise.resolve(this.readDirectoryItems(directoryPath, workspaceRoot));
    }

    public findItemByPath(targetPath: string): TreeItem | undefined {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return undefined;
        }

        const workspaceRoot = workspaceFolder.uri.fsPath;
        const normalizedTargetPath = path.normalize(targetPath);
        if (normalizedTargetPath === workspaceRoot || !normalizedTargetPath.startsWith(workspaceRoot)) {
            return undefined;
        }

        return this.getItemForPath(normalizedTargetPath, workspaceRoot);
    }

    private readDirectoryItems(directoryPath: string, workspaceRoot: string): TreeItem[] {
        const excludeConfig = vscode.workspace
            .getConfiguration('files', vscode.Uri.file(workspaceRoot))
            .get<ExcludeConfig>('exclude');
        const shouldExclude = createExcludeMatcher(workspaceRoot, excludeConfig);
        const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
        const visibleEntries = entries.filter(entry => {
            if (entry.name === ORDER_FILE_NAME) {
                return true;
            }

            const fullEntryPath = path.join(directoryPath, entry.name);
            return !shouldExclude(fullEntryPath, entry.isDirectory());
        });

        const orderFileEntry = visibleEntries.find(entry => entry.name === ORDER_FILE_NAME);
        const regularEntries = visibleEntries.filter(entry => entry.name !== ORDER_FILE_NAME);
        // 目录排序优先遵循 .order，其次才回退到默认的目录/文件分组规则。
        const orderedEntries = orderItemsByDirectoryFile(
            directoryPath,
            this.applyDefaultGrouping(regularEntries),
            entry => entry.name
        );
        const finalEntries = orderFileEntry ? [orderFileEntry, ...orderedEntries] : orderedEntries;
        return finalEntries.map(entry => this.createTreeItem(directoryPath, workspaceRoot, entry));
    }

    private applyDefaultGrouping(entries: fs.Dirent[]): fs.Dirent[] {
        const underscoreEntries: fs.Dirent[] = [];
        const directories: fs.Dirent[] = [];
        const dotFiles: fs.Dirent[] = [];
        const files: fs.Dirent[] = [];

        for (const entry of entries) {
            if (entry.name.startsWith('_')) {
                underscoreEntries.push(entry);
            } else if (entry.isDirectory()) {
                directories.push(entry);
            } else if (entry.name.startsWith('.')) {
                dotFiles.push(entry);
            } else {
                files.push(entry);
            }
        }

        return [...underscoreEntries, ...directories, ...dotFiles, ...files];
    }

    private createTreeItem(directoryPath: string, workspaceRoot: string, entry: fs.Dirent): TreeItem {
        const fullEntryPath = path.join(directoryPath, entry.name);
        const cachedItem = this.itemCache.get(fullEntryPath);
        const relativePath = path.relative(workspaceRoot, fullEntryPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
            const treeItem = cachedItem ?? new TreeItem(entry.name, vscode.TreeItemCollapsibleState.Collapsed);
            treeItem.label = entry.name;
            treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            treeItem.filePath = fullEntryPath;
            treeItem.entryName = entry.name;
            treeItem.fullPath = relativePath;
            treeItem.nodeType = 'folder';
            treeItem.isLeaf = false;
            treeItem.contextValue = 'pathFileTreeFolder';
            treeItem.resourceUri = vscode.Uri.file(fullEntryPath);
            treeItem.command = undefined;
            this.itemCache.set(fullEntryPath, treeItem);
            return treeItem;
        }

        const treeItem = cachedItem ?? new TreeItem(entry.name, vscode.TreeItemCollapsibleState.None);
        treeItem.label = entry.name;
        treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;
        treeItem.command = {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [vscode.Uri.file(fullEntryPath)]
        };
        treeItem.filePath = fullEntryPath;
        treeItem.entryName = entry.name;
        treeItem.fullPath = relativePath;
        treeItem.nodeType = 'file';
        treeItem.isLeaf = true;
        treeItem.contextValue = 'pathFileTreeFile';
        treeItem.resourceUri = vscode.Uri.file(fullEntryPath);
        this.itemCache.set(fullEntryPath, treeItem);
        return treeItem;
    }

    private getItemForPath(targetPath: string, workspaceRoot: string): TreeItem | undefined {
        const cachedItem = this.itemCache.get(targetPath);
        if (cachedItem) {
            return cachedItem;
        }

        if (!fs.existsSync(targetPath)) {
            return undefined;
        }

        const stat = fs.statSync(targetPath);
        const entryName = path.basename(targetPath);
        const direntLike = {
            name: entryName,
            isDirectory: () => stat.isDirectory(),
            isFile: () => stat.isFile()
        } as fs.Dirent;

        return this.createTreeItem(path.dirname(targetPath), workspaceRoot, direntLike);
    }
}
