# 字段与判定规则

权威来源：`fde-handbook/02/0-阶段二规范说明.md` 与 `fde-handbook/02/2-需求与数据对接确认表【交付】（含组织关系）.docx`。本文件只说明生成器的结构和检查口径。

- `project.id/name/client`：项目标识、名称、客户单位。已有项目记录时不得悄悄改动。
- `organization`：关键人清单，每人填写姓名、职务、项目角色、关注点、是否决策人、联系或确认方式。第一轮应尽力识别决策人、业务推动者、需求负责人、操作员、信息科或数据联系人；尚未识别的人写进 `openItems` 并指定跟进人。
- `round.id/date/topic/participants`：每轮独立编号、ISO 日期、议题、参会人员。`decisionMaker/businessOwner/operator/itContact` 指明确角色的姓名或“待确认（责任人：姓名）”。
- `businessGoal/asIs/pain/desiredOutcome/scenario`：目标、现状量化基线、痛点、期望改变及场景概述。未知数据不得编造数字。
- `conclusion/nextActions`：本轮达成结论与下一步行动。未被确认的观点不能放入已确认结论。
- `requirements`：每项 `id/description/priority/inScope/involvesAi`；本期范围和是否涉及 AI 用布尔值；可增补 `constraint`。同一编号跨轮复用表示追踪或修订同一需求。
- `processNodes`：每项 `id/name/role/input/action/output/system/exception/aiInsertion`。无 AI 点或异常时填写明确的“不涉及”或“无”，不能留空。
- `dataItems`：每项 `id/name/sourceSystem/vendor/content/method/availability/frequency/owner/readinessAiImpact`。未知来源或责任人写入待确认事项；不得虚构。
- `acceptanceDraft` 是初稿说明；`acceptanceMetrics` 可列 `name/target/judge/aiCriterion`。正式验收口径在阶段三定稿后另编验收标准表。
- `openItems`：每项 `item/owner/status`。待确认项不可标“已确认”。
- `confirmation.status` 取 `pending` 或 `confirmed`；`confirmed` 必须附项目内证据相对路径或 http(s) 链接及确认日期。群确认可作为当轮证据，阶段三仍需总签。

生成路径：`stage2/contact-rounds/<轮次编号>.md` 保留每轮表；`stage2/contact-form.md` 汇总全部轮次供后续 Skill 和校验器读取；`project-record.json` 保存结构化记录。生成器不会覆盖非本工具生成的汇总表，也不会静默替换已有轮次。
