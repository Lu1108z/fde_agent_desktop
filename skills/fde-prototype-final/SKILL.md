---
name: fde-prototype-final
description: 把阶段二原型按已签需求和定稿 PRD 修订为阶段三可运行、可归档的产品原型 Demo，核对功能覆盖与主流程。
category: product-doc
---

# FDE 产品原型 Demo 定稿（S3-6）

本 Skill 只负责阶段三这件正式交付。规范来源：`fde-handbook/03/6-产品原型Demo【交付】.docx`。先核对项目当前手册版本；把模板里的示例视为格式参考，不作为项目事实。

## 输入与产出

- 输入：现有 `project-record.json`、此前相关交付物及本项目真实记录。结构化字段见 [本件记录结构](references/record-section.json)。
- 产出：`stage3/prototype-final.md；stage3/prototype/index.html`；参考 [空白模板](assets/) 填入项目事实，移除全部占位符。同步更新记录结构；不得改写无关交付物或旧版确认凭据。

## 本件规则

- 将阶段二原型修订并归档到 `stage3/prototype/`，入口 `index.html` 和资源必须实际存在、可打开、可交互；不能只交说明文档。若用在线平台，须同时记录有效访问方式并按项目归档要求留存可复核版本。
- `stage3/prototype-final.md` 写版本、已签需求版本、PRD 版本、页面清单、功能/需求映射、打开方式和主流程走查结果。`featureIds` 与定稿 PRD 一致，页面链接与静态资源可达。
- 实际运行检查证据填 `smokeTestEvidence`，业务方确认填 `businessApprovalEvidence`；二者均不能由生成文件代替。需求变更时回查 PRD、智能体和数据口径。

门禁 Skill 位于 `$HERMES_HOME/skills/fde-stage-gate`；若未设置 `HERMES_HOME`，使用 `~/.product-lobster/skills/fde-stage-gate`。

## 检查与交付

1. 读取正文和结构化记录，逐项比对编号、版本、路径、事实来源；项目内证据文件需真实存在，外部链接需人工打开。
2. 运行 `python3 <fde-stage-gate目录>/scripts/check_deliverable.py <项目目录> --item S3-6`，修复可核实的错误。检查不过则只交草稿，并直接说明缺哪些事实或确认。
3. 机器检查通过后仍需完成相应人工核对；真实签字、SQL、Eval 和原型走查均不得由文字生成代替。阶段放行再运行 `fde-stage-gate` 的整阶段检查。
