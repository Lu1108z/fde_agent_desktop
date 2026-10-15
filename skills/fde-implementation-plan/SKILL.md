---
name: fde-implementation-plan
description: 依据阶段三已确认需求及资源准备情况，制定 FDE 产品实施任务、环境与 SDR 准备、依赖、日期和里程碑。
category: product-doc
---

# FDE 产品实施计划表（S3-3）

本 Skill 只负责阶段三这件正式交付。规范来源：`fde-handbook/03/3-产品实施计划表【交付】.md；同名 xlsx 模板`。先核对项目当前手册版本；把模板里的示例视为格式参考，不作为项目事实。

## 输入与产出

- 输入：现有 `project-record.json`、此前相关交付物及本项目真实记录。结构化字段见 [本件记录结构](references/record-section.json)。
- 产出：`stage3/impl-plan.md`；参考 [空白模板](assets/) 填入项目事实，移除全部占位符。同步更新记录结构；不得改写无关交付物或旧版确认凭据。

## 本件规则

- 以已确认的需求版本、环境资料和执行方资源为依据排期。写前期调研、网络/服务器/VPN、SDR 部署或复用、产品与智能体实施、联调、评测和交付里程碑；不照搬范例日期或姓名。
- `tasks` 每项都有唯一 ID、负责人、开始/结束、正工期、依赖 ID、交付物与状态；依赖无循环，日期顺序合理。`milestones` 指明日期、负责人、交付物和验收条件。
- 环境阻塞或未获执行方确认时明示风险，不假装排期已承诺。项目负责人和执行方的确认资料写入 `reviewEvidence`。

门禁 Skill 位于 `$HERMES_HOME/skills/fde-stage-gate`；若未设置 `HERMES_HOME`，使用 `~/.product-lobster/skills/fde-stage-gate`。

## 检查与交付

1. 读取正文和结构化记录，逐项比对编号、版本、路径、事实来源；项目内证据文件需真实存在，外部链接需人工打开。
2. 运行 `python3 <fde-stage-gate目录>/scripts/check_deliverable.py <项目目录> --item S3-3`，修复可核实的错误。检查不过则只交草稿，并直接说明缺哪些事实或确认。
3. 机器检查通过后仍需完成相应人工核对；真实签字、SQL、Eval 和原型走查均不得由文字生成代替。阶段放行再运行 `fde-stage-gate` 的整阶段检查。
