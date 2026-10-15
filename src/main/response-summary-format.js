'use strict';
// A public explanation of the approach, separate from the model's private reasoning.
const RESPONSE_SUMMARY_INSTRUCTION = `每一轮都先流式输出给用户可见的中文分析说明，再给正式回答。不能只输出“正在思考”或跳过分析区。
格式必须是：<response_summary>两到四条有具体内容的简短中文说明，每条一行</response_summary>，随后输出正式回答。
分析说明要结合本轮具体问题，说明处理方向、资料依据、关键约束或检查结果。使用清晰中文短句，随生成逐步输出；不要输出内部推理、逐步心路历程、原始思维链、英文长段落或工具参数。没有查阅或执行的操作不能写成已完成，资料不足要明确说明。不要用复述最终答案替代分析说明。总长不超过240个汉字。正式回答照常回应用户。模拟客户时也保留分析说明，正式回答继续客户角色；语音只播放正式回答。`;
module.exports = { RESPONSE_SUMMARY_INSTRUCTION };
