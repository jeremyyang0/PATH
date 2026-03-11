export interface TreeSelectionSnapshot {
    view: 'eleTree' | 'methodsTree';
    path: string;
    label: string;
    codePath?: string;
    filePath?: string;
    lineNumber?: number;
    methodName?: string;
    methodDoc?: string;
    eleVariableName?: string;
}

class TreeSelectionStore {
    private eleTreeSelection?: TreeSelectionSnapshot;
    private methodsTreeSelection?: TreeSelectionSnapshot;

    public setEleTreeSelection(selection: TreeSelectionSnapshot | undefined): void {
        this.eleTreeSelection = selection;
    }

    public setMethodsTreeSelection(selection: TreeSelectionSnapshot | undefined): void {
        this.methodsTreeSelection = selection;
    }

    public getEleTreeSelection(): TreeSelectionSnapshot | undefined {
        return this.eleTreeSelection ? { ...this.eleTreeSelection } : undefined;
    }

    public getMethodsTreeSelection(): TreeSelectionSnapshot | undefined {
        return this.methodsTreeSelection ? { ...this.methodsTreeSelection } : undefined;
    }
}

export const treeSelectionStore = new TreeSelectionStore();
