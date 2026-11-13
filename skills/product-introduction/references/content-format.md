# 单一内容源 product.json

用 `export` 导出一份成品的完整内容以理解实际结构；新产品需更新全部正文。图片路径相对于 JSON 所在目录。

## 顶层字段

```json
{
  "template": "operations",
  "title": "产品名称",
  "positioning": "一段产品定位",
  "audience": "适用客户群体",
  "pains": ["痛点一——具体业务场景与后果。"],
  "capabilities": ["能力一：动作、输出、业务价值。"],
  "deployments": ["订阅模式：本产品已确认的部署说明。"],
  "forbidden_terms": ["旧产品名称"],
  "evidence": ["工作底稿中的来源信息，不进入成品"]
}
```

- `filename` 可选，不含扩展名，默认 `<title>-产品介绍`。
- `headings` 可选，仅在用户要求不同业务用词时修改，如 `{"pains":"需求痛点与现状"}`；支持 audience、pains、capabilities、cases、deployments。不输入手工序号。
- `pains`、`capabilities` 是完整自然段字符串，不在脚本里新增加粗标签或拆成多级菜单。
- `deployments` 不带圆点，生成时使用原稿的 `• ` 及缩进。
- `forbidden_terms` 检查正文/元数据残留词；图片需额外目视或 OCR。
- `evidence` 不进入 Word，用于核对来源、实现状态与统计口径。

## 三类案例

### quality-risk：行内客户案例

增加 `case_paragraphs` 非空数组，第一段可用“客户案例：”开头。保持在能力段后、部署方式前，没有额外大节标题。

### hr：相关案例与图片

```json
"cases": [
  {
    "title": "案例一",
    "paragraphs": ["原有情况。", "应用过程与变化。"],
    "figures": [{"path":"screens/case.png","caption":"当前产品界面"}]
  }
]
```

`title` 不填时自动使用“案例一”等；`figures` 可为空。图号按整份文档连续生成，caption 不手写“图1”。图注保留在图上方。支持增减案例，不强制两个。

### perioperative：应用案例与前后表

增加非空 `case_paragraphs` 数组，并填写：

```json
"metrics": {
  "title":"实施后指标变化",
  "headers":["指标","实施前","实施后"],
  "rows":[["某指标","来源中的实施前数据","来源中的实施后数据"]]
}
```

列数固定三列，行数可变，直接复制原始表格属性。无真实数据不要为了用该版式填写占位结果，应改选其它模板。

## 运行

```bash
python scripts/product_intro.py inspect --template hr
python scripts/product_intro.py export --template hr --output-dir /path/work
python scripts/product_intro.py build /path/work/product.json --output-dir /path/output
python scripts/product_intro.py verify /path/work/product.json /path/output/产品名称-产品介绍.docx
```

为避免覆盖人工修订文件，构建只接受未存在的输出路径。再次修订时更换 filename 或交付目录。

生成报告记录：实际修改的 DOCX 部件、原样保留的样式/编号/页眉、正文图数量。验证报告不能替代 Office 实際分页检查。

## 依赖与便携性

只使用本技能自带模板和 `requirements.txt` 中的 lxml、Pillow；不依赖白皮书技能、操作手册项目脚本或原始附件绝对路径。
