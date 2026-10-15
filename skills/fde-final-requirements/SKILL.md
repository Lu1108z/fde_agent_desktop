---
name: fde-final-requirements
description: 根据阶段二逐轮沟通和原型收敛结果，编制阶段三最终需求确认表，固定范围、验收口径、版本与真实确认凭据。
category: product-doc
---

# FDE 需求最终确认表（S3-2）

本 Skill 只负责阶段三这件正式交付。规范来源：`fde-handbook/03/2-需求最终确认表【交付】.docx`。先核对项目当前手册版本；把模板里的示例视为格式参考，不作为项目事实。

## 输入与产出

- 输入：现有 `project-record.json`、此前相关交付物及本项目真实记录。结构化字段见 [本件记录结构](references/record-section.json)。
- 产出：`stage3/final-req.md`；参考 [空白模板](assets/) 填入项目事实，移除全部占位符。同步更新记录结构；不得改写无关交付物或旧版确认凭据。

## 本件规则

- 这是阶段三第一件事。逐项核对阶段二需求，决定纳入或明确排除；保留原需求 ID 与来源，不因整理表述而失去追溯。阶段二未决事项逐项结案或转为明确排除。
- 写项目概述、痛点、目标场景、AI 赋能方案、最终需求范围、非目标、配合约束及量化验收标准。`requirementIds`、`excludedRequirementIds` 合起来覆盖阶段二需求；验收项有 ID、目标和测量方法。
- 被排除的需求逐项在 `excludedRequirementReasons` 写明理由。版本写到文档及 `stage3.finalRequirements.version`。四方确认记录与真实签字或约定有效证据填 `approval`；AI 不代签。签字前只能标待确认，不能把后续设计当作已确定基线。

门禁 Skill 位于 `$HERMES_HOME/skills/fde-stage-gate`；若未设置 `HERMES_HOME`，使用 `~/.product-lobster/skills/fde-stage-gate`。

## 检查与交付

1. 读取正文和结构化记录，逐项比对编号、版本、路径、事实来源；项目内证据文件需真实存在，外部链接需人工打开。
2. 运行 `python3 <fde-stage-gate目录>/scripts/check_deliverable.py <项目目录> --item S3-2`，修复可核实的错误。检查不过则只交草稿，并直接说明缺哪些事实或确认。
3. 机器检查通过后仍需完成相应人工核对；真实签字、SQL、Eval 和原型走查均不得由文字生成代替。阶段放行再运行 `fde-stage-gate` 的整阶段检查。
