---
name: fde-stage-gate
description: 初始化 FDE 阶段二、三项目交付结构，逐件检查九类正式交付物，并执行阶段放行校验。用于规范复核和验收，不能替代客户签字、信息科核对或真实 Eval。
category: product-doc
---

# FDE 阶段二、三交付门禁

九类正式交付按 `S2-1` 至 `S2-3`、`S3-1` 至 `S3-6` 计数。规范来源为项目当前 `fde-handbook/02`、`03` 的阶段说明和正式模板；[校验契约](references/contract.json) 是本套 Skill 的机器检查基线。

## 用法

- 新项目：`python3 <本目录>/scripts/init_fde_project.py <项目目录>`，仅创建不存在的空白文件；空白文件不算交付完成。
- 单件：`python3 <本目录>/scripts/check_deliverable.py <项目目录> --item S2-2`（按实际编号替换）。结果分 `automatedPassed` 和 `humanReviewRequired`。
- 阶段：`python3 <本目录>/scripts/run_stage_gate.py <项目目录> --stage 2` 或 `--stage 3`。只有机器检查无错误、人工确认和证据真实有效，才能报告阶段通过。

## 执行规则

1. 先核对项目当前手册版本、`project-record.json`、交付物和证据路径。不要把模板范例当项目事实。
2. 每个交付物生成后执行单件检查；修正错误或如实保留“未通过”。阶段二的智能体和数据依赖可以是 `proposed`，须有责任人。阶段三不能留待确认项。
3. 阶段门禁检查跨文档编号、版本、路径和部分内容；人工再核实客户确认、信息科 SQL、Eval 结果、原型操作。文件存在只说明有草稿，不说明通过。
4. 将机器错误、人工待核项和是否能放行直接用中文告知用户。不要代客户签字或伪造评测、SQL、原型运行记录。
