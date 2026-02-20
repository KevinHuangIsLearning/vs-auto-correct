# ⚡ VS Auto Correct

**VS Auto Correct** 是一款为你量身定制的“静默纠错与自动展开”引擎。它不仅仅能拯救你的拼写错误（如 `itn` -> `int`），还能通过强大的占位符和多行支持，将你的编码速度提升到新的维度。

## 核心特性

- **静默触发**：无需从繁琐的补全菜单中选择，输入错词/缩写后按 `空格` 或 `分号` 立即生效。
- **$1 光标跳转**：支持在替换后将光标自动定位到指定位置（如括号、尖括号内）。
- **多行智能缩进**：自动识别当前行缩进，完美支持复杂的代码块展开。
- **语言特定配置**：支持针对不同编程语言设置独立的纠错映射表。
- **状态栏开关**：一键切换插件启用状态，状态栏图标实时反馈。
- **视觉反馈**：多行展开时提供优雅的行内渐隐提示。

## 配置示例

[查看示例！](./example_config.json)

在 `settings.json` 中配置以下映射：

```json
"vsAutoCorrect.languageSpecific": {
  "cpp": {
    // for example: 
    "inc": "#include <$1>",
    "ll": "long long",
    "mian": "int main()",
    "fastio": "ios::sync_with_stdio(false); cin.tie(0); cout.tie(0);",
    "sort": "std::sort($1.begin(), $1.end());",
    "pqig": "std::priority_queue<int, std::vector<int>, std::greater<$1>>",
    "db": "std::cerr << \"Debug: \" << $1 << std::endl;",
    "itn": "int",
    "retunr": "return "
  }
}