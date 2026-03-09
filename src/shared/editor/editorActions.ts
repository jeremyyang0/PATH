import * as vscode from 'vscode';

export async function insertTextAtCursor(text: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('没有打开的编辑器');
        return;
    }

    const position = editor.selection.active;
    const currentLine = editor.document.lineAt(position.line);

    let indent = '';
    if (position.line > 0) {
        const previousLine = editor.document.lineAt(position.line - 1);
        const previousIndent = previousLine.text.match(/^\s*/);
        indent = previousIndent ? previousIndent[0] : '';
    }

    if (currentLine.text.trim().length > 0) {
        const currentIndent = currentLine.text.match(/^\s*/);
        indent = currentIndent ? currentIndent[0] : indent;
    }

    const insertedText = `${indent}${text}()\n`;
    const succeeded = await editor.edit(editBuilder => {
        const insertPosition = new vscode.Position(position.line, 0);
        editBuilder.insert(insertPosition, insertedText);
    });

    if (!succeeded) {
        return;
    }

    const nextPosition = new vscode.Position(position.line + 1, indent.length);
    editor.selection = new vscode.Selection(nextPosition, nextPosition);
    editor.revealRange(new vscode.Range(nextPosition, nextPosition));
}

export async function openFileAtLine(filePath: string, lineNumber: number): Promise<void> {
    try {
        const document = await vscode.workspace.openTextDocument(filePath);
        const editor = await vscode.window.showTextDocument(document);
        const line = Math.max(0, lineNumber - 1);
        const position = new vscode.Position(line, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`打开文件失败: ${message}`);
    }
}
