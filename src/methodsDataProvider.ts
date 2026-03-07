import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { DragAndDropController } from './dragAndDropController';
import { orderItemsByDirectoryFile, ORDER_FILE_NAME } from './orderUtils';
import { EleParser, MethodInfo, MethodResult, ParseResult } from './parseEle';
import { TreeItem } from './treeItem';

/**
 * Methods tree data provider.
 */
export class MethodsDataProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    public readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private data: TreeItem[] = [];
    private originalData: TreeItem[] = [];
    private searchKeyword: string = '';
    private packageNames: { [key: string]: string } = {};
    public readonly dragAndDropController = new DragAndDropController();

    public refresh(): void {
        void this.loadData();
    }

    public getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    public getChildren(element?: TreeItem): Promise<TreeItem[]> {
        if (!element) {
            return Promise.resolve(this.data);
        }
        return Promise.resolve(element.children || []);
    }

    public async loadData(): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                this.data = [];
                this.originalData = [];
                this._onDidChangeTreeData.fire();
                return;
            }

            const workspacePath = workspaceFolder.uri.fsPath;
            const data = await this.parseEleFiles(workspacePath);
            this.packageNames = data.package_names || {};
            this.originalData = this.buildTreeData(workspacePath, data.method_results || []);
            this.applySearch();
            this._onDidChangeTreeData.fire();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage('加载方法数据失败: ' + errorMessage);
            this.data = [];
            this.originalData = [];
        }
    }

    public applySearchKeyword(keyword: string): void {
        this.searchKeyword = keyword;
        this.applySearch();
        this._onDidChangeTreeData.fire();
    }

    public clearSearch(): void {
        this.searchKeyword = '';
        this.applySearch();
        this._onDidChangeTreeData.fire();
    }

    public expandAll(): void {
        this.setAllNodesCollapsed(this.data, false);
        this._onDidChangeTreeData.fire();
    }

    public collapseAll(): void {
        this.setAllNodesCollapsed(this.data, true);
        this._onDidChangeTreeData.fire();
    }

    public async search(): Promise<void> {
        const keyword = await vscode.window.showInputBox({
            prompt: '请输入搜索关键词',
            placeHolder: '搜索方法或目录',
            value: this.searchKeyword
        });
        if (keyword !== undefined) {
            this.searchKeyword = keyword;
            this.applySearch();
            this._onDidChangeTreeData.fire();
        }
    }

    private async parseEleFiles(workspacePath: string): Promise<ParseResult> {
        const parser = new EleParser(workspacePath);
        return parser.parseAllFiles();
    }

    private buildTreeData(workspacePath: string, methodResults: MethodResult[]): TreeItem[] {
        const methodDir = path.join(workspacePath, 'method');
        if (!fs.existsSync(methodDir)) {
            return [];
        }

        const methodsByFile = new Map<string, MethodInfo[]>();
        for (const result of methodResults) {
            methodsByFile.set(path.normalize(result.file_path), result.methods);
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

            if (entry.isDirectory()) {
                return true;
            }

            return entry.isFile() && entry.name.endsWith('.py');
        });

        const orderedEntries = orderItemsByDirectoryFile(directoryPath, relevantEntries, entry => entry.name);
        const items: TreeItem[] = [];

        for (const entry of orderedEntries) {
            const fullEntryPath = path.join(directoryPath, entry.name);
            if (entry.isDirectory()) {
                items.push(this.createFolderItem(fullEntryPath, relativeParts, entry.name, methodsByFile));
                continue;
            }

            items.push(...this.createMethodItemsForFile(fullEntryPath, relativeParts, methodsByFile));
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
        const normalizedFilePath = path.normalize(filePath);
        const methods = methodsByFile.get(normalizedFilePath) || [];
        return methods.map(method => this.createMethodItem(filePath, parentRelativeParts, method));
    }

    private createMethodItem(filePath: string, parentRelativeParts: string[], method: MethodInfo): TreeItem {
        const label = method.doc || method.name;
        const treeItem = new TreeItem(label, vscode.TreeItemCollapsibleState.None);
        const relativeFilePath = this.normalizeRelativePath(path.join(...parentRelativeParts, path.basename(filePath)));

        treeItem.tooltip = `第${method.line}行: ${label}`;
        treeItem.children = [];
        treeItem.filePath = filePath;
        treeItem.entryName = method.name;
        treeItem.fullPath = `${relativeFilePath}#${method.name}:${method.line}`;
        treeItem.codePath = this.buildMethodCodePath(parentRelativeParts, method.name);
        treeItem.isLeaf = true;
        treeItem.nodeType = 'method';
        treeItem.contextValue = 'methodTreeLeaf';
        treeItem.methodFilePath = filePath;
        treeItem.methodName = method.name;
        treeItem.methodLine = method.line;
        treeItem.methodDoc = method.doc;
        return treeItem;
    }

    private buildMethodCodePath(relativeFolderParts: string[], methodName: string): string {
        return [...relativeFolderParts, methodName].filter(Boolean).join('.');
    }

    private getDisplayName(pathPart: string, fullPath: string): string {
        const packagePath = 'method.' + fullPath.replace(/\//g, '.');
        if (this.packageNames[packagePath]) {
            return this.packageNames[packagePath];
        }
        if (this.packageNames[fullPath]) {
            return this.packageNames[fullPath];
        }
        return pathPart;
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
