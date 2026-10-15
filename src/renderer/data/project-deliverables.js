// 阶段二三件正式交付物；PRD、功能清单是产品原型 Demo 的配套文件。
export const STAGE2_DELIVERABLES = [
  { key:'contact-form', name:'需求与数据对接确认表', short:'对接确认表', icon:'fa-solid fa-clipboard-list', file:'stage2/contact-form.md', skill:'fde-contact-form', templateFile:'2-需求与数据对接确认表【交付】（含组织关系）.docx', tplHtml:{stage:'02',html:'2-需求与数据对接确认表【交付】（含组织关系）.html'}, hint:'按知识中心原表逐轮填写，含基本信息、组织关系、当轮结论、场景概述、需求、流程、数据和验收初稿。' },
  { key:'ai-capability', name:'AI能力清单', short:'AI能力清单', icon:'fa-solid fa-wand-magic-sparkles', file:'stage2/ai-capability.md', skill:'fde-ai-capabilities', templateFile:'3-AI需求能力清单【交付】.docx', tplHtml:{stage:'02',html:'3-AI需求能力清单【交付】.html'}, hint:'能力总览、详细定义、需求映射和 AI 验收口径汇总；事实与待确认目标分别记录。' },
  { key:'prototype-demo', name:'产品原型 Demo', short:'产品原型 Demo', icon:'fa-solid fa-window-maximize', kind:'prototype-package', file:'prototype/index.html', skill:'fde-prototype-draft', templateFile:'3-产品原型Demo【交付】.Word.docx', tpl:{stage:'02',md:'3-产品原型Demo【交付】.md'}, files:['prototype/index.html'], hint:'根据需求与 AI 能力清单制作可点击的多页面原型；PRD 在阶段三生成。' },
];

// 阶段③交付物定义（AI 参照 FDE 手册模板生成）
export const STAGE3_DELIVERABLES = [
  {
    key: 'final-req', skill: 'fde-final-requirements', name: '需求最终确认表', short: '需求确认表',
    icon: 'fa-solid fa-file-signature', file: 'stage3/final-req.md',
    tplHtml: { stage: '03', html: '2-需求最终确认表【交付】.html' },
    hint: '把阶段②收敛后的需求签字定稿——项目概述/痛点/AI赋能方案/需求清单/验收口径。',
  },
  {
    key: 'agent-design', skill: 'fde-agent-design', name: '智能体设计表', short: '设计表',
    icon: 'fa-solid fa-diagram-project', file: 'stage3/agent-design.md',
    tplHtml: { stage: '03', html: '1-智能体设计表【交付】.html' },
    hint: '一个环节一个智能体：身份卡→五层拆解→六组件→提示词→知识库→技能→A/B→验收上线。',
  },
  {
    key: 'impl-plan', skill: 'fde-implementation-plan', name: '产品实施计划表', short: '实施计划',
    icon: 'fa-solid fa-calendar-check', file: 'stage3/impl-plan.md',
    tplHtml: { stage: '03', html: '3-产品实施计划表【交付】.html' },
    hint: '把签字定死的需求拆成可排期的实施计划：前期调研（网络/服务器/VPN/业务系统/数据库）、SDR 部署、里程碑节点，每项带责任人/工期/前置依赖/交付物，作为阶段④建工作台的排期依据。',
  },
  {
    key: 'data-metric', skill: 'fde-data-metrics', name: '业务数据口径模板', short: '数据口径',
    icon: 'fa-solid fa-ruler-combined', file: 'stage3/data-metric.md',
    tplHtml: { stage: '03', html: '4-业务数据口径模板【研发交付】.html' },
    hint: '按 章/节/指标/指标类型/取数SQL/数据来源表 把每个指标的取数出处与计算口径定死；数据集优先复用 SDR 标准库、新增部分登记数据集清单，作为阶段④建模、阶段⑤验收的对账依据。',
  },
  {
    key: 'prd', skill: 'fde-prd-final', name: '产品需求文档PRD(范例)', short: 'PRD',
    icon: 'fa-solid fa-file-lines', file: 'stage3/prd.md',
    tplHtml: { stage: '03', html: '5-PRD【交付】.html' },
    hint: '需求签字后升级为定稿版 PRD——目标/功能/交互三层，功能可追溯到需求。',
  },
];

// 当前阶段的交付物清单
export const deliverablesForStage = (id) => id === 2 ? STAGE2_DELIVERABLES : id === 3 ? STAGE3_DELIVERABLES : [];
