# manual.json 格式与运行说明

UTF-8 JSON 是唯一内容源。所有图片路径相对于 JSON 所在目录；也接受绝对路径，但共享文件时建议使用相对路径。

## 顶层字段

| 字段 | 含义 |
|---|---|
| title | 必填，手册标题 |
| product | 必填，封面适用系统 |
| english_title | 可选，封面英文上标题 |
| subtitle | 可选，面向对象与用途 |
| version | 默认 V1.0 |
| date | 默认本机当前年月，可显式覆盖 |
| filename | 不含扩展名的安全文件名，默认 title_通用版_version |
| page_size | Letter（默认）或 A4 |
| forbidden_terms | 禁止出现在文本/属性中的字符串数组；另行核对图片 |
| pages | 正文逻辑页列表，封面自动生成 |

每个正文页包含 `chapter`（整数）、`title`（不含编号）、可选 `continued`（布尔）及 `blocks`。
章节从 1 连续递增；同章的后续逻辑页可重复 chapter，并设 continued 为 true。
工具自动生成“一、标题”和“图3-1 …”，删除整章后重排 chapter 即可，不手写旧图号。

## 内容块

```json
{"type":"text","text":"一段正文。"}
{"type":"sub","text":"【功能项】报告查询"}
{"type":"steps","items":["点击「报告」。","选择一份已完成报告。"]}
{"type":"bullets","items":["核心价值一。","核心价值二。"]}
{"type":"note","label":"提示","text":"需要说明的操作限制。"}
{"type":"table","headers":["角色","场景"],"rows":[["用户","查看信息"]],"widths":[0.25,0.75]}
{"type":"images","height_pt":250,"items":[{"path":"screens/report.png","caption":"报告查询界面","source":"当前 Demo，机构标识已通用化"}]}
```

- `widths` 可省略，给出时各值为正且总和为 1。
- 图片块 1～2 张为宜；宽高按列宽与 height_pt 双重限制，保留比例。
- `height_pt` 默认 230，手机图可指定 280。大图拆页比文字过小更好。
- 所有纯文本自动转义；不在内容字段嵌入 HTML 或脚本。
- 预览文件位于 `<output-dir>/.manual-build/<filename>/`，交付目录只需提供 PDF/DOCX 链接。

## 命令

```bash
python scripts/build_manual.py /path/manual.json --output-dir /path/deliverables
python scripts/verify_manual.py /path/manual.json --output-dir /path/deliverables
```

输出默认不覆盖已有文件。修订自己的成品时加 `--overwrite`；先确认不是用户后来编辑的文档。

构建时生成 DOCX 和 HTML，用 Chromium 打印 PDF；PDF 固定逻辑分页，DOCX 保留可编辑内容与自然分页。相同内容在不同字体/Office 软件下页数可能不同。

校验会检查文本禁用词、PDF 页数/页边界/部分内容完整性、DOCX ZIP 完整性、图号和正文可提取文本，并生成 `contact-sheet.jpg` 和 `verification.json`。它不替代图片 OCR 或 DOCX 视觉排版验收。
