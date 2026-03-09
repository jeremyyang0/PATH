import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { orderItemsByDirectoryFile } from '../../../shared/path/orderUtils';
import { DragAndDropController } from '../../../shared/tree/dragAndDropController';
import { type EleVariable, type FileResult, PythonIndexService } from '../../../shared/indexing/pythonIndexService';
import { ORDER_FILE_NAME } from '../../../shared/path/workspacePathUtils';
import { TreeItem } from '../../../shared/tree/treeItem';

export class EleTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
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
            // 先构建完整树，再做搜索裁剪，避免搜索模式下丢失原始结构。
            const data = await this.parseEleFiles(workspacePath);
            this.packageNames = data.packageNames;
            this.originalData = this.buildTreeData(workspacePath, data.results);
            this.applySearch();
            this.onDidChangeTreeDataEmitter.fire();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`加载 Ele 变量数据失败: ${message}`);
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

    private async parseEleFiles(workspacePath: string) {
        const parser = new PythonIndexService(workspacePath);
        return parser.parseAllFiles();
    }

    private buildTreeData(workspacePath: string, results: FileResult[]): TreeItem[] {
        const methodDir = path.join(workspacePath, 'method');
        if (!fs.existsSync(methodDir)) {
            return [];
        }

        const resultsByFile = new Map<string, FileResult[]>();
        for (const result of results) {
            const fileName = path.basename(result.filePath).toLowerCase();
            if (!this.isElementFileName(fileName)) {
                continue;
            }

            const key = path.normalize(result.filePath);
            const bucket = resultsByFile.get(key);
            if (bucket) {
                bucket.push(result);
            } else {
                resultsByFile.set(key, [result]);
            }
        }

        return this.buildDirectoryChildren(methodDir, [], resultsByFile);
    }

    private buildDirectoryChildren(
        directoryPath: string,
        relativeParts: string[],
        resultsByFile: Map<string, FileResult[]>
    ): TreeItem[] {
        // 目录节点只负责表达结构，真正的元素节点在文件级别统一组装。
        const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
        const relevantEntries = entries.filter(entry => {
            if (entry.name === ORDER_FILE_NAME) {
                return false;
            }

            return entry.isDirectory() || (entry.isFile() && this.isElementFileName(entry.name));
        });

        const orderedEntries = orderItemsByDirectoryFile(directoryPath, relevantEntries, entry => entry.name);
        const items: TreeItem[] = [];

        for (const entry of orderedEntries) {
            const fullEntryPath = path.join(directoryPath, entry.name);
            if (entry.isDirectory()) {
                items.push(this.createFolderItem(fullEntryPath, relativeParts, entry.name, resultsByFile));
            } else {
                items.push(...this.createElementItemsForFile(fullEntryPath, relativeParts, resultsByFile));
            }
        }

        return items;
    }

    private createFolderItem(
        directoryPath: string,
        parentRelativeParts: string[],
        folderName: string,
        resultsByFile: Map<string, FileResult[]>
    ): TreeItem {
        const relativeParts = [...parentRelativeParts, folderName];
        const displayPath = relativeParts.join('/');
        const children = this.buildDirectoryChildren(directoryPath, relativeParts, resultsByFile);
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
        treeItem.contextValue = 'eleTreeFolder';
        return treeItem;
    }

    private createElementItemsForFile(
        filePath: string,
        parentRelativeParts: string[],
        resultsByFile: Map<string, FileResult[]>
    ): TreeItem[] {
        const results = resultsByFile.get(path.normalize(filePath)) || [];
        const parentFullPath = parentRelativeParts.join('.');
        const parentCodePath = parentRelativeParts.join('.');
        const items: TreeItem[] = [];

        for (const result of results) {
            items.push(...this.createElementItemsForResult(result, parentFullPath, parentCodePath));
        }

        return items;
    }

    private createElementItemsForResult(result: FileResult, parentFullPath: string, parentCodePath: string): TreeItem[] {
        const rootItems = new Map<string, TreeItem>();
        const childItems: EleVariable[] = [];
        const items: TreeItem[] = [];

        for (const eleVar of result.eleVariables) {
            const displayName = eleVar.desc || eleVar.name;
            const hierarchy = eleVar.hierarchy || [];
            if (hierarchy.length === 1) {
                const treeItem = new TreeItem(displayName, vscode.TreeItemCollapsibleState.None, {
                    command: 'eleTreeViewer.openFile',
                    title: '打开文件',
                    arguments: [result.filePath, eleVar.line]
                });
                treeItem.tooltip = `第 ${eleVar.line} 行: ${eleVar.value}`;
                treeItem.children = [];
                treeItem.fullPath = parentFullPath ? `${parentFullPath}.${displayName}` : displayName;
                treeItem.codePath = parentCodePath ? `${parentCodePath}.${eleVar.name}` : eleVar.name;
                treeItem.isLeaf = true;
                treeItem.nodeType = 'element';
                treeItem.contextValue = 'eleTreeLeaf';
                treeItem.eleFilePath = result.filePath;
                treeItem.eleVariableName = eleVar.name;
                treeItem.eleLineNumber = eleVar.line;
                treeItem.filePath = result.filePath;
                treeItem.entryName = eleVar.name;
                rootItems.set(displayName, treeItem);
                items.push(treeItem);
            } else if (hierarchy.length > 1) {
                childItems.push(eleVar);
            }
        }

        // 第二轮把层级元素挂回父节点，避免在扫描阶段就做多次查找和重排。
        for (const eleVar of childItems) {
            const hierarchy = eleVar.hierarchy || [];
            const parentName = hierarchy[0];
            const childName = hierarchy[hierarchy.length - 1];
            if (!parentName || !childName) {
                continue;
            }

            const parentItem = rootItems.get(parentName);
            if (!parentItem) {
                continue;
            }

            const childItem = new TreeItem(childName, vscode.TreeItemCollapsibleState.None, {
                command: 'eleTreeViewer.openFile',
                title: '打开文件',
                arguments: [result.filePath, eleVar.line]
            });
            childItem.tooltip = `第 ${eleVar.line} 行: ${eleVar.value}`;
            childItem.fullPath = `${parentItem.fullPath}.${childName}`;
            childItem.codePath = parentCodePath ? `${parentCodePath}.${eleVar.name}` : eleVar.name;
            childItem.isLeaf = true;
            childItem.nodeType = 'element';
            childItem.contextValue = 'eleTreeLeaf';
            childItem.eleFilePath = result.filePath;
            childItem.eleVariableName = eleVar.name;
            childItem.eleLineNumber = eleVar.line;
            childItem.filePath = result.filePath;
            childItem.entryName = eleVar.name;

            if ((parentItem.children || []).length === 0) {
                parentItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            }

            parentItem.children = parentItem.children || [];
            parentItem.children.push(childItem);
        }

        return items;
    }

    private isElementFileName(fileName: string): boolean {
        return fileName.toLowerCase().endsWith('ele.py');
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
        newItem.eleFilePath = item.eleFilePath;
        newItem.eleVariableName = item.eleVariableName;
        newItem.eleLineNumber = item.eleLineNumber;
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
