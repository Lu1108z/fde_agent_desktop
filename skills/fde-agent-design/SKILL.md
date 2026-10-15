---
name: fde-agent-design
description: 按 FDE 阶段三已签需求设计智能体矩阵，并为每个智能体编制完整设计表、六组件、A/B 和真实 Eval 记录。
category: product-doc
---

# FDE 智能体设计表（S3-1）

本 Skill 只负责阶段三这件正式交付。规范来源：`fde-handbook/03/1-智能体设计表【交付】.md；同阶段六组件、A/B、Eval 知识模板`。先核对项目当前手册版本；把模板里的示例视为格式参考，不作为项目事实。

## 输入与产出

- 输入：现有 `project-record.json`、此前相关交付物及本项目真实记录。结构化字段见 [本件记录结构](references/record-section.json)。
- 产出：`stage3/agent-design.md；stage3/agents/<agent-id>.md`；总览使用 `assets/agent-matrix.md`，逐个设计使用 `assets/agent-design.md`，填入项目事实并移除全部占位符。同步更新记录结构；不得改写无关交付物或旧版确认凭据。

## 本件规则

- 先确认最终需求签字版本。按业务链路画矩阵，一个环节一个智能体；标明需求/功能、上下游 ID、输入输出，确保无职责重叠和数据断点。未由智能体负责的需求或功能写明确不适用理由。
- 每个智能体单独保存 `stage3/agents/<ID>.md`：身份卡与项目验收项、Workflow、逐节点输入/处理/输出、Playbook、边界、异常转人工；六组件索引；第四部分写唯一的 Prompt 全文，第五/六部分写知识库、技能、连接器的明细与权限。
- A/B 有实际测试就附证据；未做则写 `not_applicable` 及理由。Eval 必须记录真实测试集、结果数值、证据与该项目签字验收线，不能默认采用手册示例的 90%。业务专家确认写真实证据；未评测时不能标通过。

门禁 Skill 位于 `$HERMES_HOME/skills/fde-stage-gate`；若未设置 `HERMES_HOME`，使用 `~/.product-lobster/skills/fde-stage-gate`。

## 检查与交付

1. 读取正文和结构化记录，逐项比对编号、版本、路径、事实来源；项目内证据文件需真实存在，外部链接需人工打开。
2. 运行 `python3 <fde-stage-gate目录>/scripts/check_deliverable.py <项目目录> --item S3-1`，修复可核实的错误。检查不过则只交草稿，并直接说明缺哪些事实或确认。
3. 机器检查通过后仍需完成相应人工核对；真实签字、SQL、Eval 和原型走查均不得由文字生成代替。阶段放行再运行 `fde-stage-gate` 的整阶段检查。
