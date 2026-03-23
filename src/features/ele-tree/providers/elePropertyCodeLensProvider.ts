import * as vscode from 'vscode';
import { ParsedEleProperty, isEleDefinitionFile, parseEleProperties } from '../../../shared/python/elePropertyParser';

export class ElePropertyCodeLensProvider implements vscode.CodeLensProvider {
    private readonly onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();

    public readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

    /**
     * 主动刷新 `_ele.py` 文档上的 CodeLens，保证编辑器改动后按钮及时更新。
     */
    public refresh(): void {
        this.onDidChangeCodeLensesEmitter.fire();
    }

    public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        if (!isEleDefinitionFile(document.uri.fsPath)) {
            return [];
        }

        const properties = parseEleProperties(document.getText(), document.uri.fsPath);
        return properties.flatMap(property => this.buildPropertyCodeLenses(property));
    }

    /**
     * 每个属性提供两个原生小灰字入口，分别对应点击和双击生成。
     */
    private buildPropertyCodeLenses(property: ParsedEleProperty): vscode.CodeLens[] {
        const range = new vscode.Range(property.propertyLine - 1, 0, property.propertyLine - 1, 0);
        return [
            new vscode.CodeLens(range, {
                title: '生成点击',
                command: 'eleTreeViewer.generateClickForEleProperty',
                arguments: [property]
            }),
            new vscode.CodeLens(range, {
                title: '生成双击',
                command: 'eleTreeViewer.generateDoubleClickForEleProperty',
                arguments: [property]
            })
        ];
    }
}
