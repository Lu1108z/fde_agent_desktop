---
name: fde-ai-capabilities
description: 根据 FDE 阶段二逐轮需求确认表，构建 AI 需求能力清单并逐项定义效果指标、输入输出、数据依赖与人工兜底。适用于第二阶段第二类正式交付。
version: 0.2.0
category: product-doc
---

# FDE AI 需求能力清单（S2-2）

本 Skill 只负责阶段二这件正式交付。规范来源：`fde-handbook/02/3-AI需求能力清单【交付】.docx`。先核对项目当前手册版本；把模板里的示例视为格式参考，不作为项目事实。

## 输入与产出

- 输入：现有 `project-record.json`、此前相关交付物及本项目真实记录。结构化字段见 [本件记录结构](references/record-section.json)。
- 产出：`stage2/ai-capability.md`；参考 [空白模板](assets/) 填入项目事实，移除全部占位符。同步更新记录结构；不得改写无关交付物或旧版确认凭据。

## 本件规则

- 从 S2-1 已编号需求出发，只纳入本期 AI 需求；每项能力关联至少一条需求。若有本期 AI 需求不纳入，写明排除原因到 `excludedRequirementReasons`。
- 能力逐项写清做什么、输入、输出、边界、数据依赖、优先级、异常及转人工方式。效果指标必须有可核验目标值、测量方法、测试数据集和判定方；不能只写“智能”“好用”。
- `stage2.aiCapabilities.items` 与文档的能力编号一致，文档保留需求映射。业务方的范围和目标确认记录填 `reviewEvidence`；无证据时保持草稿。

门禁 Skill 位于 `$HERMES_HOME/skills/fde-stage-gate`；若未设置 `HERMES_HOME`，使用 `~/.product-lobster/skills/fde-stage-gate`。

## 检查与交付

1. 读取正文和结构化记录，逐项比对编号、版本、路径、事实来源；项目内证据文件需真实存在，外部链接需人工打开。
2. 运行 `python3 <fde-stage-gate目录>/scripts/check_deliverable.py <项目目录> --item S2-2`，修复可核实的错误。检查不过则只交草稿，并直接说明缺哪些事实或确认。
3. 机器检查通过后仍需完成相应人工核对；真实签字、SQL、Eval 和原型走查均不得由文字生成代替。阶段放行再运行 `fde-stage-gate` 的整阶段检查。


## 知识中心格式对齐（软件 2026-10-14）

生成前同时读取软件知识中心当前模板。保留其章节、表格列名、列顺序与填写行；本技能的示例和旧骨架不具有客户事实效力。对接表完整保留 4.1–4.6；AI能力清单必须包含第四章“AI验收口径汇总”，不得以业务方确认替代该表。PRD与功能清单属于第三件“产品原型 Demo”的配套文件，不在阶段二单独计数。

填好 project-record.json 的 stage2.aiCapabilities 后，运行 `python3 <本技能目录>/scripts/build_ai_capabilities.py <项目目录>`。旧稿须先读取核对；确定重整时加 `--replace`，脚本会先保存原稿备份。
