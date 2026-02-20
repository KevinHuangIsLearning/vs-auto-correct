import * as vscode from 'vscode';

let isProcessingEdit = false;

// 定义多行展开时的行内提示样式
const expandDecorationType = vscode.window.createTextEditorDecorationType({
    after: {
        contentText: 'Code block expanded',
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
        fontStyle: 'italic',
        margin: '0 0 0 1em'
    }
});

function getConfig(languageId: string) {
    const config = vscode.workspace.getConfiguration('vsAutoCorrect');
    const langSpecific = config.get<Record<string, Record<string, string>>>('languageSpecific', {});
    const combinedMap = { ...(langSpecific['*'] || {}), ...(langSpecific[languageId] || {}) };
    const sortedTypos = Object.entries(combinedMap).sort((a, b) => b[0].length - a[0].length);
    const triggerCharsArray = config.get<string[]>('triggerChars', [' ', ';', '(', ')', '{', '}', '\n', '\t']);
    return { sortedTypos, triggerChars: new Set(triggerCharsArray) };
}

export function activate(context: vscode.ExtensionContext) {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(zap) AutoCorrect";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    const disposable = vscode.workspace.onDidChangeTextDocument(event => {
        if (isProcessingEdit) return;

        const { document, contentChanges } = event;
        if (contentChanges.length !== 1) return;

        const change = contentChanges[0];
        const { sortedTypos, triggerChars } = getConfig(document.languageId);
        
        if (!change.text || change.text.length !== 1 || !triggerChars.has(change.text)) return;

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== document) return;

        const triggerPosition = change.range.start;
        const line = document.lineAt(triggerPosition.line);
        const textBeforeTrigger = line.text.substring(0, triggerPosition.character);

        for (let [typo, correction] of sortedTypos) {
            if (textBeforeTrigger.endsWith(typo)) {
                const wordStart = triggerPosition.translate(0, -typo.length);
                const wordRange = new vscode.Range(wordStart, triggerPosition);

                const isMultiLine = correction.includes('\n');
                let finalCorrection = correction;

                if (isMultiLine) {
                    const indentation = line.text.match(/^\s*/)?.[0] || '';
                    finalCorrection = correction.split('\n').join('\n' + indentation);
                }

                isProcessingEdit = true;
                
                editor.edit(editBuilder => {
                    editBuilder.replace(wordRange, finalCorrection);
                }, { 
                    undoStopBefore: true, 
                    undoStopAfter: true 
                }).then(success => {
                    isProcessingEdit = false;
                    if (success && isMultiLine) {
                        const newPosition = editor.selection.active;
                        const decorationRange = new vscode.Range(newPosition, newPosition);

                        // 在新光标位置显示提示
                        editor.setDecorations(expandDecorationType, [decorationRange]);
                        
                        // 1秒后消失
                        setTimeout(() => {
                            editor.setDecorations(expandDecorationType, []);
                        }, 1000);

                        vscode.window.setStatusBarMessage(`Expanded code block.`, 2500);
                    } else if (success) {
                        vscode.window.setStatusBarMessage(`Corrected: "${typo}" -> "${correction}"`, 2500);
                    }
                }, () => isProcessingEdit = false);

                break;
            }
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}