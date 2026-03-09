import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { type MethodInfo, type MethodResult, PythonIndexService } from '../../../shared/indexing/pythonIndexService';
import { orderItemsByDirectoryFile } from '../../../shared/path/orderUtils';
import { DragAndDropController } from '../../../shared/tree/dragAndDropController';
import { ORDER_FILE_NAME } from '../../../shared/path/workspacePathUtils';
import { TreeItem } from '../../../shared/tree/treeItem';

export class MethodsDataProvider implements vscode.TreeDataProvider<TreeItem> {
    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TreeItem | undefined | null | void>();

    public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

    private data: TreeItem[] = [];
    private originalData: TreeItem[] = [];
    private searchKeyword = '';
    private packageNames: Record<string, string> = {};
    public readonly dragAndDropController = new DragAndDropController();

    public refresh(): void {
        void this.loadData();
    }

    public getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    public getChildren(element?: TreeItem): Promise<TreeItem[]> {
        return Promise.resolve(element ? (element.children || []) : this.data);
    }

    public async loadData(): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                this.data = [];
                this.originalData = [];
                this.onDidChangeTreeDataEmitter.fire();
                return;
            }

            const workspacePath = workspaceFolder.uri.fsPath;
            // 方法树和元素树共用同一份索引器，保证展示口径一致。
            const data = await this.parseMethodFiles(workspacePath);
            this.packageNames = data.packageNames;
            this.originalData = this.buildTreeData(workspacePath, data.methodResults);
            this.applySearch();
            this.onDidChangeTreeDataEmitter.fire();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`加载方法数据失败: ${message}`);
            this.data = [];
            this.originalData = [];
        }
    }

    public applySearchKeyword(keyword: string): void {
        this.searchKeyword = keyword;
        this.applySearch();
        this.onDidChangeTreeDataEmitter.fire();
    }

    public clearSearch(): void {
        this.searchKeyword = '';
        this.applySearch();
        this.onDidChangeTreeDataEmitter.fire();
    }

    public expandAll(): void {
        this.setAllNodesCollapsed(this.data, false);
        this.onDidChangeTreeDataEmitter.fire();
    }

    public collapseAll(): void {
        this.setAllNodesCollapsed(this.data, true);
        this.onDidChangeTreeDataEmitter.fire();
    }

    private async parseMethodFiles(workspacePath: string) {
        const parser = new PythonIndexService(workspacePath);
        return parser.parseAllFiles();
    }

    private buildTreeData(workspacePath: string, methodResults: MethodResult[]): TreeItem[] {
        const methodDir = path.join(workspacePath, 'method');
        if (!fs.existsSync(methodDir)) {
            return [];
        }

        const methodsByFile = new Map<string, MethodInfo[]>();
        for (const result of methodResults) {
            methodsByFile.set(path.normalize(result.filePath), result.methods);
        }

        return this.buildDirectoryChildren(methodDir, [], methodsByFile);
    }

    private buildDirectoryChildren(
        directoryPath: string,
        relativeParts: string[],
        methodsByFile: Map<string, MethodInfo[]>
    ): TreeItem[] {
        const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
        const relevantEntries = entries.filter(entry => {
            if (entry.name === ORDER_FILE_NAME) {
                return false;
            }

            return entry.isDirectory() || (entry.isFile() && entry.name.endsWith('.py'));
        });

        const orderedEntries = orderItemsByDirectoryFile(directoryPath, relevantEntries, entry => entry.name);
        const items: TreeItem[] = [];

        for (const entry of orderedEntries) {
            const fullEntryPath = path.join(directoryPath, entry.name);
            if (entry.isDirectory()) {
                items.push(this.createFolderItem(fullEntryPath, relativeParts, entry.name, methodsByFile));
            } else {
                items.push(...this.createMethodItemsForFile(fullEntryPath, relativeParts, methodsByFile));
            }
        }

        return items;
    }

    private createFolderItem(
        directoryPath: string,
        parentRelativeParts: string[],
        folderName: string,
        methodsByFile: Map<string, MethodInfo[]>
    ): TreeItem {
        const relativeParts = [...parentRelativeParts, folderName];
        const displayPath = relativeParts.join('/');
        const children = this.buildDirectoryChildren(directoryPath, relativeParts, methodsByFile);
        const collapsibleState = children.length > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None;

        const treeItem = new TreeItem(this.getDisplayName(folderName, displayPath), collapsibleState);
        treeItem.children = children;
        treeItem.filePath = directoryPath;
        treeItem.entryName = folderName;
        treeItem.fullPath = this.normalizeRelativePath(displayPath);
        treeItem.codePath = relativeParts.join('.');
        treeItem.isLeaf = false;
        treeItem.nodeType = 'folder';
        treeItem.contextValue = 'methodTreeFolder';
        return treeItem;
    }

    private createMethodItemsForFile(
        filePath: string,
        parentRelativeParts: string[],
        methodsByFile: Map<string, MethodInfo[]>
    ): TreeItem[] {
        const methods = methodsByFile.get(path.normalize(filePath)) || [];
        return methods.map(method => this.createMethodItem(filePath, parentRelativeParts, method));
    }

    private createMethodItem(filePath: string, parentRelativeParts: string[], method: MethodInfo): TreeItem {
        const label = method.doc || method.name;
        const treeItem = new TreeItem(label, vscode.TreeItemCollapsibleState.None);
        const relativeFilePath = this.normalizeRelativePath(path.join(...parentRelativeParts, path.basename(filePath)));
        // 叶子节点保留方法跳转所需的最小信息，避免在命令里二次解析文件。
        treeItem.tooltip = `第 ${method.line} 行: ${label}`;
        treeItem.children = [];
        treeItem.filePath = filePath;
        treeItem.entryName = method.name;
        treeItem.fullPath = `${relativeFilePath}#${method.name}:${method.line}`;
        treeItem.codePath = [...parentRelativeParts, method.name].filter(Boolean).join('.');
        treeItem.isLeaf = true;
        treeItem.nodeType = 'method';
        treeItem.contextValue = 'methodTreeLeaf';
        treeItem.methodFilePath = filePath;
        treeItem.methodName = method.name;
        treeItem.methodLine = method.line;
        treeItem.methodDoc = method.doc;
        return treeItem;
    }

    private getDisplayName(pathPart: string, fullPath: string): string {
        const packagePath = `method.${fullPath.replace(/\//g, '.')}`;
        return this.packageNames[packagePath] || this.packageNames[fullPath] || pathPart;
    }

    private normalizeRelativePath(relativePath: string): string {
        return relativePath.replace(/\\/g, '/');
    }

    private applySearch(): void {
        if (!this.searchKeyword) {
            this.data = this.originalData;
            return;
        }

        const filtered: TreeItem[] = [];
        for (const item of this.originalData) {
            const filteredItem = this.filterTreeItem(item, this.searchKeyword);
            if (filteredItem) {
                filtered.push(filteredItem);
            }
        }
        this.data = filtered;
    }

    private filterTreeItem(item: TreeItem, keyword: string): TreeItem | null {
        const keywordLower = keyword.toLowerCase();
        const itemLabel = typeof item.label === 'string' ? item.label : (item.label?.label || '');
        const currentMatches = itemLabel.toLowerCase().includes(keywordLower);

        const filteredChildren: TreeItem[] = [];
        if (item.children) {
            for (const child of item.children) {
                const filteredChild = this.filterTreeItem(child, keyword);
                if (filteredChild) {
                    filteredChildren.push(filteredChild);
                }
            }
        }

        if (!currentMatches && filteredChildren.length === 0) {
            return null;
        }

        const newItem = new TreeItem(
            itemLabel,
            filteredChildren.length > 0
                ? vscode.TreeItemCollapsibleState.Expanded
                : (item.collapsibleState ?? vscode.TreeItemCollapsibleState.None)
        );
        newItem.tooltip = item.tooltip;
        newItem.fullPath = item.fullPath;
        newItem.codePath = item.codePath;
        newItem.isLeaf = item.isLeaf;
        newItem.nodeType = item.nodeType;
        newItem.filePath = item.filePath;
        newItem.entryName = item.entryName;
        newItem.children = filteredChildren;
        newItem.methodFilePath = item.methodFilePath;
        newItem.methodName = item.methodName;
        newItem.methodLine = item.methodLine;
        newItem.methodDoc = item.methodDoc;
        newItem.contextValue = item.contextValue;
        return newItem;
    }

    private setAllNodesCollapsed(items: TreeItem[], collapsed: boolean): void {
        for (const item of items) {
            if (item.children && item.children.length > 0) {
                item.collapsibleState = collapsed
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.Expanded;
                this.setAllNodesCollapsed(item.children, collapsed);
            }
        }
    }
}
