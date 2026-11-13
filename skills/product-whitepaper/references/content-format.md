# 内容源与脚本

**默认流程已变更：使用 build_from_template.py 和 template-fidelity.md 中的逐段替换格式。下述 JSON 与 build_whitepaper.py 仅用于用户明确要求全新设计的 --free-layout 模式，不得用于复用原稿版式的任务。**

使用 UTF-8 JSON。相对图片路径以 JSON 所在目录为基准。

顶层字段：

- `title`：白皮书封面产品名，必填。
- `filename`：不带扩展名的输出名称；默认 `<title>白皮书`。
- `team`、`team_en`：可选，明确授权的编制团队。
- `intro`：产品定位正文，必填。
- `sections`：章节数组，每章有 `title`、`blocks`。
- `forbidden_terms`：禁止在成品文本出现的词；图片需人工/OCR 单独检查。

块类型：

```json
{"type":"paragraph","text":"正文"}
{"type":"heading","text":"患者侧"}
{"type":"capability","name":"能力名称","text":"业务动作、输出与价值。"}
{"type":"bullets","items":["第一项","第二项"]}
{"type":"image","path":"screens/product.png","caption":"产品界面示例","source":"当前 Demo，机构标识已通用化"}
```

图号自动生成。`capability` 名称会加粗，正文保持可编辑；此类型也适合痛点短标题。

生成器默认拒绝覆盖既有成品。确认文件是本次生成且没有用户后续手改后，可用 `--overwrite`。

依赖：`python -m pip install -r <skill目录>/requirements.txt`。

Word 是主要交付格式。使用 Office 转换生成 PDF 后，务必检查 PDF 页面，不把 ZIP/XML 检查当成排版验收。
