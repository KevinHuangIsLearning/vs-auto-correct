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
    
    // 1. 准备真正要插入的文本
    const textToInsert = hasPlaceholder ? finalTextWithIndentation.replace(cursorPlaceholder, "") : finalTextWithIndentation;

    // 2. 执行编辑
    const success = await editor.edit(editBuilder => {
        editBuilder.replace(wordRange, textToInsert);
    }, { 
        undoStopBefore: false, 
        undoStopAfter: false 
    });

    if (success) {
        let newPosition: vscode.Position;

        if (hasPlaceholder) {
            // 情况 A：有占位符，计算 $1 的位置
            const parts = finalTextWithIndentation.split(cursorPlaceholder)[0].split('\n');
            const lineOffset = parts.length - 1;
            const charOffset = parts[parts.length - 1].length;

            newPosition = new vscode.Position(
                wordRange.start.line + lineOffset,
                (lineOffset === 0 ? wordRange.start.character : 0) + charOffset
            );
        } else {
            // 情况 B：没有占位符，强制跳到替换文本的末尾
            const parts = textToInsert.split('\n');
            const lineOffset = parts.length - 1;
            const charOffset = parts[parts.length - 1].length;

            newPosition = new vscode.Position(
                wordRange.start.line + lineOffset,
                (lineOffset === 0 ? wordRange.start.character : 0) + charOffset
            );
        }

        // 3. 强制移动光标并确保视图可见
        editor.selection = new vscode.Selection(newPosition, newPosition);
        editor.revealRange(new vscode.Range(newPosition, newPosition));
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
                const charBeforeIndex = triggerPosition.character - typo.length - 1;
                        if (charBeforeIndex >= 0) {
                            const charBefore = line.text[charBeforeIndex];
                            // 如果前面是字母、数字或下划线，说明它是单词的一部分（如 cin 中的 in），跳过
                            if (/[a-zA-Z0-9_]/.test(charBefore)) {
                                continue;
                            }
                        }
                        // 如果 charBeforeIndex < 0，说明是在行首，直接允许替换

                        const wordStart = triggerPosition.translate(0, -typo.length);
                        
                        // --- 2. 空格冗余优化 ---
                        let finalCorrection = correction;
                        // 如果触发字符（change.text）是空格，且我们的 correction 结尾也是空格
                        // 我们就把 correction 结尾的空格去掉，防止出现双空格
                        if (change.text === ' ' && finalCorrection.endsWith(' ')) {
                            finalCorrection = finalCorrection.slice(0, -1);
                        }

                        const isMultiLine = finalCorrection.includes('\n');
                        if (isMultiLine) {
                            const indentation = line.text.match(/^\s*/)?.[0] || '';
                            finalCorrection = finalCorrection.split('\n').join('\n' + indentation);
                        }

                        isProcessingEdit = true;
                        try {
                            // 注意：这里替换的 Range 应该包含那个已经敲出来的 typo
                            const wordRange = new vscode.Range(wordStart, triggerPosition);
                            const success = await applyCorrection(editor, wordRange, finalCorrection);                    if (success) {
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