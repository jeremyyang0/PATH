import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';
import { TreeItem, TreeNode } from './treeItem';
import { DragAndDropController } from './dragAndDropController';

/**
 * 解析结果接口
 */
export interface ParseResult {
    results: FileResult[];
    package_names: { [key: string]: string };
}

/**
 * 文件解析结果接口
 */
export interface FileResult {
    file_path: string;
    class_name: string;
    class_line: number;
    base_classes: string[];
    ele_variables: EleVariable[];
}

/**
 * Ele变量接口
 */
export interface EleVariable {
    name: string;
    value: string;
    line: number;
    arguments: string[];
    desc: string;
    hierarchy: string[];
}

/**
 * Ele变量树形数据提供者
 */
export class EleTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
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
            this.originalData = this.buildTreeData(data.results || []);
            this.applySearch();
            this._onDidChangeTreeData.fire();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage('加载Ele变量数据失败: ' + errorMessage);
            this.data = [];
            this.originalData = [];
        }
    }

    private parseEleFiles(workspacePath: string): Promise<ParseResult> {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__filename, '..', '..', 'parse_ele.py');
            const command = `python "${pythonScript}" "${workspacePath}"`;
            
            // 设置环境变量确保UTF-8编码
            const env = { 
                ...process.env,
                PYTHONIOENCODING: 'utf-8',
                PYTHONUTF8: '1'
            };
            
            exec(command, { encoding: 'utf8', env }, (error: any, stdout: string, stderr: string) => {
                if (error) {
                    reject(error);
                    return;
                }
                
                try {
                    const results = JSON.parse(stdout) as ParseResult;
                    resolve(results);
                } catch (parseError) {
                    const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
                    reject(new Error('解析Python输出失败: ' + errorMessage));
                }
            });
        });
    }

    private buildTreeData(results: FileResult[]): TreeItem[] {
        const rootNodes: { [key: string]: TreeNode } = {};
        // 构建树形结构
        for (const result of results) {
            const filePath = result.file_path;
            const pathParts = this.parseFilePath(filePath);
            let currentLevel = rootNodes;
            let currentParent: TreeItem | null = null;
            let currentPath = '';
            let currentCodePath = '';
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
                    treeItem.contextValue = 'eleTreeFolder';
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
            const rootItems: { [key: string]: TreeItem } = {};
            const childItems: EleVariable[] = [];
            for (const eleVar of result.ele_variables) {
                const displayName = eleVar.desc || eleVar.name;
                const hierarchy = eleVar.hierarchy || [];
                if (hierarchy.length === 1) {
                    const treeItem = new TreeItem(
                        displayName,
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: 'eleTreeViewer.openFile',
                            title: '打开文件',
                            arguments: [result.file_path, eleVar.line]
                        }
                    );
                    treeItem.tooltip = `第${eleVar.line}行: ${eleVar.value}`;
                    treeItem.children = [];
                    treeItem.fullPath = currentParent ? `${currentParent.fullPath}.${displayName}` : displayName;
                    treeItem.codePath = currentParent ? `${currentParent.codePath}.${eleVar.name}` : eleVar.name;
                    treeItem.isLeaf = true;
                    treeItem.contextValue = 'eleTreeLeaf';
                    treeItem.eleFilePath = result.file_path;
                    treeItem.eleVariableName = eleVar.name;
                    treeItem.eleLineNumber = eleVar.line;
                    rootItems[displayName] = treeItem;
                    if (currentParent) {
                        currentParent.children!.push(treeItem);
                    }
                } else if (hierarchy.length > 1) {
                    childItems.push(eleVar);
                }
            }
            for (const eleVar of childItems) {
                const hierarchy = eleVar.hierarchy || [];
                if (hierarchy.length > 1) {
                    const parentName = hierarchy[0];
                    const childName = hierarchy[hierarchy.length - 1];
                    if (parentName && childName && rootItems[parentName]) {
                        const childItem = new TreeItem(
                            childName,
                            vscode.TreeItemCollapsibleState.None,
                            {
                                command: 'eleTreeViewer.openFile',
                                title: '打开文件',
                                arguments: [result.file_path, eleVar.line]
                            }
                        );
                        childItem.tooltip = `第${eleVar.line}行: ${eleVar.value}`;
                        childItem.fullPath = rootItems[parentName]!.fullPath + '.' + childName;
                        childItem.codePath = currentParent ? `${currentParent.codePath}.${eleVar.name}` : eleVar.name;
                        childItem.isLeaf = true;
                        childItem.contextValue = 'eleTreeLeaf';
                        childItem.eleFilePath = result.file_path;
                        childItem.eleVariableName = eleVar.name;
                        childItem.eleLineNumber = eleVar.line;
                        if (rootItems[parentName]!.children!.length === 0) {
                            rootItems[parentName]!.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
                        }
                        rootItems[parentName]!.children!.push(childItem);
                    }
                }
            }
        }
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
            newItem.eleFilePath = item.eleFilePath; // 复制Ele文件路径
            newItem.eleVariableName = item.eleVariableName; // 复制Ele变量名
            newItem.eleLineNumber = item.eleLineNumber; // 复制Ele变量行号
            // 根据是否为叶子节点设置contextValue
            newItem.contextValue = item.isLeaf ? 'eleTreeLeaf' : 'eleTreeFolder';
            
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
            placeHolder: '搜索Ele变量（支持中文描述或变量名）',
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