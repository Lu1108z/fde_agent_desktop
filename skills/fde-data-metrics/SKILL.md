---
name: fde-data-metrics
description: 编制 FDE 阶段三业务数据集及指标口径，核对数据来源、SQL、过滤去重时间规则、敏感权限和研发交付证据。
category: product-doc
---

# FDE 业务数据口径（S3-4）

本 Skill 只负责阶段三这件正式交付。规范来源：`fde-handbook/03/4-业务数据口径模板【研发交付】.md`。先核对项目当前手册版本；把模板里的示例视为格式参考，不作为项目事实。

## 输入与产出

- 输入：现有 `project-record.json`、此前相关交付物及本项目真实记录。结构化字段见 [本件记录结构](references/record-section.json)。
- 产出：`stage3/data-metric.md`；参考 [空白模板](assets/) 填入项目事实，移除全部占位符。同步更新记录结构；不得改写无关交付物或旧版确认凭据。

## 本件规则

- 先登记项目真实数据源、责任人、过滤、去重、时间、单位精度及权限规则；优先查 SDR 标准库版本，再决定标准库复用或新增数据集。
- 每个数据集登记编码、类型、来源系统、粒度主键、更新频率、责任人。标准库写编码版本；新增数据集写信息科提供或核实的 SQL、最终输出字段与来源、敏感级别及访问策略。指标逐项写计算口径、物理库表字段、取数 SQL、真实样例值、核对方；核对字段与 SQL 输出是否一致。
- 任何 SQL、表字段或权限缺失都如实标待提供并保持不通过状态，绝不复制手册“示意”行或伪造 SQL。信息科、研发、业务方核对证据写入 `reviewEvidence`。

门禁 Skill 位于 `$HERMES_HOME/skills/fde-stage-gate`；若未设置 `HERMES_HOME`，使用 `~/.product-lobster/skills/fde-stage-gate`。

## 检查与交付

1. 读取正文和结构化记录，逐项比对编号、版本、路径、事实来源；项目内证据文件需真实存在，外部链接需人工打开。
2. 运行 `python3 <fde-stage-gate目录>/scripts/check_deliverable.py <项目目录> --item S3-4`，修复可核实的错误。检查不过则只交草稿，并直接说明缺哪些事实或确认。
3. 机器检查通过后仍需完成相应人工核对；真实签字、SQL、Eval 和原型走查均不得由文字生成代替。阶段放行再运行 `fde-stage-gate` 的整阶段检查。
