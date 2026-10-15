---
name: fde-prd-final
description: 根据已签最终需求、智能体设计与数据口径，首次生成阶段三 PRD并检查六字段功能追溯。
category: product-doc
---

# FDE PRD 生成与定稿（S3-5）

本 Skill 只负责阶段三这件正式交付。规范来源：`fde-handbook/03/2.4-产品需求文档PRD(模板)【交付】.md；fde-handbook/03/5-PRD【交付】.docx`。先核对项目当前手册版本；把模板里的示例视为格式参考，不作为项目事实。

## 输入与产出

- 输入：现有 `project-record.json`、此前相关交付物及本项目真实记录。结构化字段见 [本件记录结构](references/record-section.json)。
- 产出：`stage3/prd.md`；参考 [空白模板](assets/) 填入项目事实，移除全部占位符。同步更新记录结构；不得改写无关交付物或旧版确认凭据。

## 本件规则

- 以 `stage3.finalRequirements.version` 为唯一需求基线，吸收阶段二原型演示反馈；保留目标层、功能层、交互层、业务规则、异常边界、数据字典和非功能要求。
- 六字段功能清单逐项关联已签需求，功能 ID 沿用阶段二或明确排除；关联智能体必须存在于矩阵，数据依赖必须能追溯到阶段三数据集。无智能体或无数据依赖写理由，不能留待确认。
- 页面路径与定稿原型一致；文档写 PRD 版本和需求版本。产品负责人与业务方评审证据填 `reviewEvidence`，未评审不能称定稿。

门禁 Skill 位于 `$HERMES_HOME/skills/fde-stage-gate`；若未设置 `HERMES_HOME`，使用 `~/.product-lobster/skills/fde-stage-gate`。

## 检查与交付

1. 读取正文和结构化记录，逐项比对编号、版本、路径、事实来源；项目内证据文件需真实存在，外部链接需人工打开。
2. 运行 `python3 <fde-stage-gate目录>/scripts/check_deliverable.py <项目目录> --item S3-5`，修复可核实的错误。检查不过则只交草稿，并直接说明缺哪些事实或确认。
3. 机器检查通过后仍需完成相应人工核对；真实签字、SQL、Eval 和原型走查均不得由文字生成代替。阶段放行再运行 `fde-stage-gate` 的整阶段检查。

阶段二只生成原型，没有阶段二 PRD。直接依据已签需求、AI 能力清单和现有原型生成本阶段 PRD；不得要求补 stage2/prd.md。
