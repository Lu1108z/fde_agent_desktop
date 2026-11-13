# FDE 设计型场景陪练

## 页面与素材

- AI 助手：局部蓝紫柔光、居中 IP、完整输入区、四个任务快捷入口。
- 培训：雾蓝欢迎区、挥手教练 IP、四个具体场景，以及独立的自定义练习 / 已有对话复盘入口。
- 两张原图分别保存在 `src/renderer/assets/fde-assistant-laptop.png` 和 `fde-coach-training.png`。

## 内置场景

| ID | 情境 | 核心目标 |
| --- | --- | --- |
| hospital-ai-pilot | 领导让上 AI，但先做什么？ | 澄清建设压力、找到业务牵头和试点调研对象 |
| nursing-workflow | 系统已经很多，护士还是忙 | 还原交班流程，区分重复劳动与必要核对 |
| manufacturing-delivery | 报表每天都有，交期还是不准 | 沿具体订单识别信息滞后、口径及责任 |
| solution-review | 业务认可了，IT 为什么不同意？ | 协调三方的范围、前置条件和验收责任 |

这些案例均为虚构训练案例，不使用其他真实项目的数据充当客户事实。

## 数据与会话

- `src/shared/coach-scenarios.json`：仅包含公开简报、三份会前材料、目标、开场白及场景版本。
- `src/main/coach-scenarios.js`：主进程客户档案、逐步披露条件、冲突分支、推进标准、适用评分维度。客户回应由模型依据这些规则生成。
- `CoachScenarioRoom.vue`：简报、会谈、复盘与分支重练。开始会谈才创建项目；固定开场白不消耗模型请求。
- 会话元数据保存 `coachScenario: { id, version }`。每次 `coach:reply` 根据磁盘元数据查找场景，读取完整已保存对话；不使用普通教练的最近20条裁剪，也不混入知识中心其他客户案例。
- 客户文本流式显示；场景模式不要求公开分析说明，避免提前暴露隐藏线索。
- 复盘通过同一 IPC 的 `action: 'review'` 返回结构化对象，原始 JSON 不进入聊天流。逐字核对引用的用户话术，无法对应证据的评分降为未考察。按原六维权重对适用、有证据的项目重新归一，计算5分制加权分数。
- 最新复盘保存于 `coachReview`，与会谈正文分离，避免继续练习时把点评当客户事实。
- 从第 N 次提问前重练会新建项目，只复制该提问之前的记录，原提问填回草稿。`coachParent` 记录原会话和分支位置；原记录和复盘保留。
- 回复失败或停止后，已保存问题可重试；不会重复保存同一个问题。创建、存盘失败在页面明确显示。

## 验证

```sh
node scripts/test-coach-scenarios.cjs
node scripts/test-coach-knowledge.cjs
node scripts/test-coach-scenarios-ui.cjs
npx vite build --config vite.config.js
```

UI测试需要运行 Vite（默认43917端口）和 Playwright；通过 `FDE_PLAYWRIGHT` 指定安装路径，`FDE_SCREENSHOT_DIR` 指定截图目录。测试使用隔离的内存项目和模拟模型回复，不使用用户项目或 API Key。实际模型对角色一致性、披露节奏的表现仍需结合真实陪练验收。
