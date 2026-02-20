import * as vscode from 'vscode';

let isProcessingEdit = false;
let isEnabled = true;

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

function updateStatusBarItem(statusBarItem: vscode.StatusBarItem) {
    statusBarItem.text = isEnabled ? "$(zap) AutoCorrect" : "$(circle-slash) AutoCorrect";
    statusBarItem.tooltip = isEnabled ? "点击禁用 AutoCorrect" : "点击启用 AutoCorrect";
}

// 核心修正：传入最终带有缩进的字符串进行计算
async function applyCorrection(editor: vscode.TextEditor, wordRange: vscode.Range, finalTextWithIndentation: string) {
    const cursorPlaceholder = "$1";
    const hasPlaceholder = finalTextWithIndentation.includes(cursorPlaceholder);
    
    // 真正写入文档的文本（去掉 $1）
    const textToInsert = hasPlaceholder ? finalTextWithIndentation.replace(cursorPlaceholder, "") : finalTextWithIndentation;

    const success = await editor.edit(editBuilder => {
        editBuilder.replace(wordRange, textToInsert);
    }, { 
        undoStopBefore: true, 
        undoStopAfter: true 
    });

    if (success && hasPlaceholder) {
        // 基于已经处理过缩进的文本计算位置
        const parts = finalTextWithIndentation.split(cursorPlaceholder)[0].split('\n');
        const lineOffset = parts.length - 1;
        const charOffset = parts[parts.length - 1].length;

        const newPosition = new vscode.Position(
            wordRange.start.line + lineOffset,
            // 如果是第一行，要加上起始位置的 character；如果是后续行，直接就是 charOffset
            (lineOffset === 0 ? wordRange.start.character : 0) + charOffset
        );
        editor.selection = new vscode.Selection(newPosition, newPosition);
    }
    
    return success;
}

export function activate(context: vscode.ExtensionContext) {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    updateStatusBarItem(statusBarItem);
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    const toggleCommand = vscode.commands.registerCommand('vsAutoCorrect.toggle', () => {
        isEnabled = !isEnabled;
        updateStatusBarItem(statusBarItem);
    });
    statusBarItem.command = 'vsAutoCorrect.toggle';
    context.subscriptions.push(toggleCommand);

    const disposable = vscode.workspace.onDidChangeTextDocument(async event => {
        if (!isEnabled || isProcessingEdit) return;

        const { document, contentChanges } = event;
        if (contentChanges.length !== 1) return;

        const change = contentChanges[0];
        const { sortedTypos, triggerChars } = getConfig(document.languageId);
        
        // 允许空格、分号等触发，但不处理删除操作
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
                    // 只有从第二行开始才加缩进
                    finalCorrection = correction.split('\n').join('\n' + indentation);
                }

                // 使用 try-finally 确保发生错误时也能重置 isProcessingEdit
                isProcessingEdit = true;
                try {
                    const success = await applyCorrection(editor, wordRange, finalCorrection);
                    
                    if (success) {
                        if (isMultiLine) {
                            const newPosition = editor.selection.active;
                            editor.setDecorations(expandDecorationType, [new vscode.Range(newPosition, newPosition)]);
                            setTimeout(() => editor.setDecorations(expandDecorationType, []), 1000);
                        } else {
                            vscode.window.setStatusBarMessage(`Corrected: "${typo}"`, 2000);
                        }
                    }
                } catch (err) {
                    console.error('AutoCorrect Error:', err);
                } finally {
                    isProcessingEdit = false;
                }

                break;
            }
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}