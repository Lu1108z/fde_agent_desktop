# 产品介绍制作 Skill

Skill ID：`product-introduction`。

已根据用户提供的四份产品介绍原稿建立模板，保留实际 DOCX 页眉Logo、样式、标题自动编号、自然段格式、案例图片和深蓝表头。第一页面直接开始产品介绍，不额外制作封面。

## 使用示例

> @product-introduction 根据这些资料制作一份产品介绍，沿用这四份成品的格式。

> @product-introduction 按人事管理产品介绍的结构制作，保留两个案例和对应截图。

> @product-introduction 按围术期产品介绍的版式补充案例和实施前后指标，数据使用附件中的统计结果。

## 文件

- `SKILL.md`：适用任务、写作与交付流程。
- `references/template-map.md`：原稿版式、模板选择和保真规则。
- `references/writing-guide.md`：定位、痛点、能力、案例与部署写法。
- `references/content-format.md`：内容源字段与运行命令。
- `templates/*.docx`：四份原始成品的完整模板副本。
- `templates/manifest.json`：模板来源文件名与原稿 SHA-256。
- `templates/starter.json`：虚构的结构起稿示例。
- `scripts/product_intro.py`：导出、生成及验证工具。

## 安装与验证范围

将本目录放入 `~/.config/opencode/skills/` 即可作为全局 Skill 使用。项目内也可放到 `.opencode/skills/`。

工具已用四份成品完成导出—重建验证，结果与原稿逐字节相同；另验证了文案段数变更、案例增减、PNG/JPEG 换图、图像比例、指标表行数变更及覆盖保护。文字和文档结构验证不等同于 Word/WPS 的实际分页视觉检查。
