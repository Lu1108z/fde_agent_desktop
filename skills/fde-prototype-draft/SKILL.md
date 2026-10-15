---
name: fde-prototype-draft
description: 根据阶段二需求与 AI 能力清单，调用 prototype-generator 生成可交互、多页面产品原型；PRD 在阶段三生成。
version: 0.3.0
category: product-doc
---

# 阶段二产品原型 Demo（S2-3）

## 输入

读取本项目 stage2/contact-form.md、stage2/ai-capability.md、project-record.json 与原始资料。没有 PRD 也应继续制作原型；不得先生成 PRD 作为中间步骤。

## 设计技能

必须完整读取 prototype-generator/SKILL.md，执行其中的原型设计规则和技术栈。使用其 vben-visual-reference.html、references/agent-tools.html、references/loop-tray.html、references/annotator.html 和 images/ 中的真实资源。不能只引用技能名称，不能用普通后台模板代替。

## 产出

实际写入 prototype/index.html、业务页面、agent-tools.html、js/、data/ 与 image/ 资源。原型应能打开、导航、走通主流程，关联真实需求与 AI 能力。

同步 [原型记录](references/record-section.json) 的版本、页面、功能与需求映射；拟定智能体和数据依赖标注责任人及状态。没有实际演示或客户认可证据时保持待确认，不编造。

阶段二只交原型，不生成或要求 stage2/prd.md、spec.md、stage2/prototype-handoff.md。PRD 在阶段三依据收敛需求与原型生成。已有旧文件保留，不擅自删除或覆盖。

## 检查

核对原型入口、页面链接、真实图片和可点击流程。运行 fde-stage-gate/scripts/check_deliverable.py <项目目录> --item S2-3；机器检查结果与客户确认分开报告。缺少事实和确认时交草稿，不能宣称验收通过。
