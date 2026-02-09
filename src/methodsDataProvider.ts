import * as vscode from 'vscode';
import { TreeItem, TreeNode } from './treeItem';
import { DragAndDropController } from './dragAndDropController';
import { EleParser, ParseResult, MethodResult, MethodInfo } from './parseEle';

/**
 * Ele变量树形数据提供者
 */
export class MethodsDataProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    public readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private data: TreeItem[] = [];
    private originalData: TreeItem[] = []; // 存储原始数据
    private searchKeyword: string = ''; // 搜索关键词
    private packageNames: { [key: string]: string } = {}; // 存储包名的中文映射
    public readonly dragAndDropController = new DragAndDropController();

    public refresh(): void {
        this.loadData();
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

            const data = await this.parseEleFiles(workspaceFolder.uri.fsPath);
            this.packageNames = data.package_names || {};
            this.originalData = this.buildTreeData(data.method_results || []);
            this.applySearch();
            this._onDidChangeTreeData.fire();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage('加载方法数据失败: ' + errorMessage);
            this.data = [];
            this.originalData = [];
        }
    }

    private async parseEleFiles(workspacePath: string): Promise<ParseResult> {
        const parser = new EleParser(workspacePath);
        return parser.parseAllFiles();
    }


    private buildTreeData(method_results: MethodResult[]): TreeItem[] {
        const rootNodes: { [key: string]: TreeNode } = {};
        // 构建树形结构
        for (const result of method_results) {
            const filePath = result.file_path;
            const pathParts = this.parseFilePath(filePath);
            let currentLevel = rootNodes;
            let currentParent: TreeItem | null = null;
            let currentPath = '';
            let currentCodePath = '';
            // 1. 按路径层级递归创建/查找文件夹节点
            for (let i = 0; i < pathParts.length; i++) {
                const part = pathParts[i];
                if (!part) { continue; }
                currentPath = currentPath ? `${currentPath}.${part}` : part;
                currentCodePath = currentCodePath ? `${currentCodePath}.${part}` : part;
                if (!currentLevel[part]) {
                    const displayName = this.getDisplayName(part, pathParts.slice(0, i + 1).join('/'));
                    const treeItem = new TreeItem(
                        displayName,
                        vscode.TreeItemCollapsibleState.Collapsed
                    );
                    treeItem.children = [];
                    treeItem.fullPath = currentPath;
                    treeItem.codePath = currentCodePath;
                    treeItem.isLeaf = false;
                    treeItem.contextValue = 'methodTreeFolder';
                    currentLevel[part] = {
                        item: treeItem,
                        children: {}
                    };
                    if (currentParent) {
                        currentParent.children!.push(treeItem);
                    }
                }
                currentParent = currentLevel[part]!.item;
                currentLevel = currentLevel[part]!.children;
            }
            // 2. 处理ele_variables，区分根级变量和子变量
            const rootItems: { [key: string]: TreeItem } = {};
            for (const method of result.methods) {
                const displayName = method.doc || method.name;
                // 根级变量，直接作为叶子节点
                const treeItem = new TreeItem(
                    displayName,
                    vscode.TreeItemCollapsibleState.None
                );
                treeItem.tooltip = `第${method.line}行: ${method.doc}`;
                treeItem.children = [];
                treeItem.fullPath = currentParent ? `${currentParent.fullPath}.${displayName}` : displayName;
                treeItem.codePath = currentParent ? `${currentParent.codePath}.${method.name}` : method.name;
                treeItem.isLeaf = true;
                treeItem.contextValue = 'methodTreeLeaf';
                treeItem.methodFilePath = filePath;
                treeItem.methodName = method.name;
                treeItem.methodLine = method.line;
                treeItem.methodDoc = method.doc;
                rootItems[displayName] = treeItem;
                if (currentParent) {
                    currentParent.children!.push(treeItem);
                }
            }
        }
        // 4. 返回所有根节点TreeItem数组
        return this.flattenTree(rootNodes);
    }

    private parseFilePath(filePath: string): string[] {
        const pathParts = filePath.split(/[\/\\]/);
        const methodIndex = pathParts.indexOf('method');
        if (methodIndex !== -1) {
            return pathParts.slice(methodIndex + 1, -1);
        }
        return pathParts.slice(0, -1);
    }

    /**
     * 获取路径部分的中文显示名称
     */
    private getDisplayName(pathPart: string, fullPath: string): string {
        if (this.packageNames[pathPart]) {
            return this.packageNames[pathPart];
        }
        if (this.packageNames[fullPath]) {
            return this.packageNames[fullPath];
        }
        const packagePath = 'method.' + fullPath.replace(/\//g, '.');
        if (this.packageNames[packagePath]) {
            return this.packageNames[packagePath];
        }
        return pathPart;
    }

    private flattenTree(nodeDict: { [key: string]: TreeNode }): TreeItem[] {
        const result: TreeItem[] = [];
        for (const key in nodeDict) {
            const node = nodeDict[key];
            if (node) {
                result.push(node.item);
            }
        }
        return result;
    }

    /**
     * 应用搜索过滤
     */
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

    /**
     * 递归过滤树项
     */
    private filterTreeItem(item: TreeItem, keyword: string): TreeItem | null {
        if (!item) { return null; }

        const keywordLower = keyword.toLowerCase();
        const itemLabel = typeof item.label === 'string' ? item.label : (item.label?.label || '');
        const itemLabelLower = itemLabel.toLowerCase();

        // 检查当前项是否匹配
        const currentMatches = itemLabelLower.includes(keywordLower);

        // 递归过滤子项
        const filteredChildren: TreeItem[] = [];
        if (item.children) {
            for (const child of item.children) {
                const filteredChild = this.filterTreeItem(child, keyword);
                if (filteredChild) {
                    filteredChildren.push(filteredChild);
                }
            }
        }

        // 如果当前项匹配或有匹配的子项，则包含此项
        if (currentMatches || filteredChildren.length > 0) {
            const newItem = new TreeItem(
                itemLabel,
                item.collapsibleState || vscode.TreeItemCollapsibleState.None
            );
            newItem.tooltip = item.tooltip;
            newItem.fullPath = item.fullPath;
            newItem.codePath = item.codePath;
            newItem.isLeaf = item.isLeaf;
            newItem.children = filteredChildren;
            newItem.methodFilePath = item.methodFilePath; // 复制Ele文件路径
            newItem.methodName = item.methodName; // 复制Ele变量名
            newItem.methodLine = item.methodLine; // 复制Ele变量行号
            newItem.methodDoc = item.methodDoc; // 复制方法文档
            newItem.eleFilePath = item.eleFilePath; // 复制Ele文件路径
            newItem.eleVariableName = item.eleVariableName; // 复制Ele变量名
            newItem.eleLineNumber = item.eleLineNumber; // 复制Ele变量行号
            // 根据是否为叶子节点设置contextValue
            newItem.contextValue = item.isLeaf ? 'methodTreeLeaf' : 'methodTreeFolder';

            // 如果有匹配的子项，设置为展开状态
            if (filteredChildren.length > 0) {
                newItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            }

            return newItem;
        }

        return null;
    }

    /**
     * 搜索功能
     */
    public async search(): Promise<void> {
        const keyword = await vscode.window.showInputBox({
            prompt: '请输入搜索关键词',
            placeHolder: '搜索方法（支持中文描述或方法名）',
            value: this.searchKeyword
        });
        if (keyword !== undefined) {
            this.searchKeyword = keyword;
            this.applySearch();
            this._onDidChangeTreeData.fire();
        }
    }

    /**
     * 清除搜索
     */
    public clearSearch(): void {
        this.searchKeyword = '';
        this.applySearch();
        this._onDidChangeTreeData.fire();
    }

    /**
     * 展开所有节点
     */
    public expandAll(): void {
        this.setAllNodesCollapsed(this.data, false);
        this._onDidChangeTreeData.fire();
    }

    /**
     * 收起所有节点
     */
    public collapseAll(): void {
        this.setAllNodesCollapsed(this.data, true);
        this._onDidChangeTreeData.fire();
    }

    /**
     * 递归设置节点的展开/收起状态
     */
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