import * as vscode from 'vscode';

let isProcessingEdit = false;
let isEnabled = true;

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

function updateStatusBarItem(statusBarItem: vscode.StatusBarItem) {
    statusBarItem.text = isEnabled ? "$(zap) AutoCorrect" : "$(circle-slash) AutoCorrect";
    statusBarItem.tooltip = isEnabled ? "点击禁用 AutoCorrect" : "点击启用 AutoCorrect";
}

async function applyCorrection(editor: vscode.TextEditor, wordRange: vscode.Range, replacement: string) {
    const cursorPlaceholder = "$1";
    const hasPlaceholder = replacement.includes(cursorPlaceholder);
    
    const finalText = hasPlaceholder ? replacement.replace(cursorPlaceholder, "") : replacement;

    const success = await editor.edit(editBuilder => {
        editBuilder.replace(wordRange, finalText);
    }, { 
        undoStopBefore: true, 
        undoStopAfter: true 
    });

    if (success && hasPlaceholder) {
        const offset = replacement.indexOf(cursorPlaceholder);
        // 将整个字符串按 $1 分割，看 $1 前面有多少行，多少个字符
        const parts = replacement.split(cursorPlaceholder)[0].split('\n');
        const lineOffset = parts.length - 1;
        const charOffset = parts[parts.length - 1].length;

        const newPosition = new vscode.Position(
            wordRange.start.line + lineOffset,
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
        vscode.window.showInformationMessage(isEnabled ? 'AutoCorrect 已启用' : 'AutoCorrect 已禁用');
    });
    statusBarItem.command = 'vsAutoCorrect.toggle';
    context.subscriptions.push(toggleCommand);

    const disposable = vscode.workspace.onDidChangeTextDocument(async event => {
        if (!isEnabled || isProcessingEdit) return;

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
                
                const success = await applyCorrection(editor, wordRange, finalCorrection);
                isProcessingEdit = false;

                if (success && isMultiLine) {
                    const newPosition = editor.selection.active;
                    const decorationRange = new vscode.Range(newPosition, newPosition);

                    editor.setDecorations(expandDecorationType, [decorationRange]);
                    
                    setTimeout(() => {
                        editor.setDecorations(expandDecorationType, []);
                    }, 1000);

                    vscode.window.setStatusBarMessage(`Expanded code block.`, 2500);
                } else if (success) {
                    vscode.window.setStatusBarMessage(`Corrected: "${typo}" -> "${correction}"`, 2500);
                }

                break;
            }
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}