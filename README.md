# VS Auto Correct

**静默纠错，拒绝干扰。** 这是一个高效的代码纠错插件，能在不打断思路的前提下修正拼写错误。

## 功能特性
- **静默纠错**：输入触发字符（空格、分号等）时自动修正（如 `itn` -> `int`）。
- **短语匹配**：支持带空格的词组（如 `auto correct` -> `AutoCorrect`）。
- **代码块展开**：支持将简写展开为带缩进的多行块。
- **动态提示**：展开多行时会在光标后显示 `⤢ Expanding Block...`。

## ⚙️ 配置示例
在 `settings.json` 中配置你的个性化词库：

```json
"vsAutoCorrect.languageSpecific": {
  "*": {
    "itn": "int",
    "auto correct": "AutoCorrect"
  },
  "go": {
    "iferr": "if err != nil {\n\treturn err\n}"
  }
}
```