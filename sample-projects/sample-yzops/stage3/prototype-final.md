# 产品原型 Demo（定稿归档）

> 项目：云州一院运营决策智能体（示例）　原型版本：PROTO-v1.0　需求总签版本：REQ-v1.0　PRD版本：PRD-v1.0

> 本文件为 FDE 五阶段流程测试产物，人员、签字、数据均为模拟示例数据。

## 一、可运行原型本体

入口：stage3/prototype/index.html（由阶段二 prototype/ v0.2 按演示反馈修订后归档）

## 二、页面与功能覆盖

| 页面 | 功能编号 | 需求编号 | 主流程检查结果 |
| --- | --- | --- | --- |
| stage3/prototype/index.html | F-01 | REQ-05 | 走通 |
| stage3/prototype/report.html | F-02 | REQ-01 | 走通 |
| stage3/prototype/alerts.html | F-03 | REQ-02 | 走通 |
| stage3/prototype/ask.html | F-04 | REQ-03 | 走通 |
| stage3/prototype/drg.html | F-05 | REQ-04 | 走通 |
| stage3/prototype/admin.html | F-06 | REQ-08 | 走通 |
| stage3/prototype/agent-tools.html | F-01~F-05 智能体入口 | REQ-01~REQ-04 | 走通 |

## 三、运行检查

打开方式：stage3/prototype 目录下 `python3 -m http.server` 后访问 index.html。测试环境：macOS + Chrome headless。走查 5 条主流程（扫描推送、月报生成审核、异常确认、问数与拒答、DRG 测算）全部走通，无控制台报错。相对 v0.2 的修订：床位使用率口径改为不含加床；问数对临床科主任关闭；驾驶舱补充近 12 个月运营趋势、DRG 亏损病组 Top 4 与 4 个智能体运行状态。证据：stage3/evidence/prototype-smoke.md。

## 四、业务方定稿确认

2026-07-12 运营管理部陈立文主任确认定稿原型，结论"按此开发"，凭据 stage3/evidence/prototype-approval.md。
