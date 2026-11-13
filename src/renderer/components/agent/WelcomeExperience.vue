<template>
  <div ref="rootEl" class="welcome-experience">
  <div class="experience-stage" :class="coachMode ? 'experience-coach' : 'experience-assistant'" :style="stageStyle">
    <div class="experience-topline"><span>{{ coachMode ? '培训 / 教练陪练' : 'AI 助手' }}</span><button @click="showGuide = !showGuide" :aria-expanded="showGuide"><i class="fa-regular fa-circle-question"></i>{{ coachMode ? '陪练指南' : '使用指南' }}</button></div>
    <div v-if="showGuide" class="experience-guide" role="region" aria-label="使用指南">
      <strong>{{ coachMode ? '一次完整的练习' : '你的产品设计搭档' }}</strong>
      <p>{{ coachMode ? '选择具体情境，阅读会前材料，再以 FDE 身份与客户交谈。客户会根据你的提问逐步透露信息。结束后查看证据复盘，或从某次提问前创建新练习。所有内置案例均为虚构。' : '介绍目标和项目背景，或添加文档、图片。下方任务入口会先填入建议问题，你可以补充材料再发送。支持 Ctrl / ⌘ + Enter 发送。' }}</p>
    </div>
    <section class="experience-hero">
      <div class="experience-character"><img :src="coachMode ? coachImage : assistantImage" :alt="coachMode ? 'FDE 沟通教练，挥手并手持笔记板' : 'FDE 协作助手与笔记本电脑'" /><span class="character-bubble"><i class="fa-solid fa-check"></i>{{ coachMode ? '准备好了？我们来试试。' : '交给我，一起搞定' }}</span></div>
      <div class="experience-copy">
        <span v-if="coachMode" class="experience-badge"><i class="fa-solid fa-headset"></i>FDE 沟通教练</span>
        <h2 v-if="coachMode">练好下一次<br />重要的客户沟通。</h2><h2 v-else>今天，想一起完成什么？</h2>
        <p>{{ coachMode ? '我来扮演客户，你来发现需求。' : '我是 FDE，陪你梳理需求、打磨方案，把想法变成清晰的成果。' }}<br v-if="coachMode" /><template v-if="coachMode">在真实场景里放心试，找到属于你的沟通节奏。</template></p>
        <div v-if="coachMode" class="experience-promises"><span v-for="item in ['真实场景', '即时反馈', '证据复盘']" :key="item"><i class="fa-solid fa-check"></i>{{ item }}</span></div>
      </div>
    </section>
    <section v-if="coachMode" class="experience-scenarios">
      <div class="experience-heading"><div><h3>选择今天的练习</h3><span>四个情境，四种真实挑战</span></div><button @click="$emit('fill', '帮我复盘一段客户沟通。我会提供对话记录，请引用原话分析需求挖掘、回应与信息确认，并给出可以重练的问法。')"><i class="fa-solid fa-magnifying-glass"></i>复盘已有对话</button></div>
      <div class="experience-scenario-grid">
        <button v-for="scene in scenarios" :key="scene.id" class="experience-scenario-card" :data-scenario="scene.id" @click="$emit('scenario', scene.id)">
          <span class="scenario-icon" :class="scene.tone"><i :class="scene.icon"></i></span>
          <span class="scenario-copy"><span class="scenario-category">{{ scene.category }}</span><strong>{{ scene.title }}</strong><span class="scenario-description">{{ scene.description }}</span></span>
          <span class="scenario-bottom"><span>{{ scene.customer }}</span><span>{{ scene.difficulty }} · {{ scene.duration }}<i class="fa-solid fa-arrow-right"></i></span></span>
        </button>
      </div>
    </section>
    <section class="experience-composer"><h3 v-if="coachMode">想练习你自己的场景？</h3><slot /></section>
    <section v-if="!coachMode" class="experience-shortcuts"><h3>从一个具体任务开始</h3><div><button v-for="card in cards" :key="card.key" @click="$emit('fill', card.prompt)"><i :class="card.icon"></i>{{ card.label }}</button></div><p>试试问我：如何把这份会议纪要整理成需求清单？</p></section>
    <p class="experience-footnote">{{ coachMode ? '先读简报，再进会谈。随时复盘，让每次练习都有收获。' : '需求梳理 / 方案共创 / 文档生成' }}</p>
  </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import scenarios from '../../../shared/coach-scenarios.json';
import assistantImage from '@/assets/fde-assistant-laptop.png';
import coachImage from '@/assets/fde-coach-training.png';
defineProps({ coachMode: Boolean, cards: { type: Array, default: () => [] } });
defineEmits(['fill', 'scenario']);
const showGuide = ref(false);

// 按高度等比缩放，保证一屏放下且铺满；宽度跟着窗口走（卡片变宽变窄，但字和图不变形）。
// 窗口太窄时改按宽度缩小，避免排版挤坏；剩余的竖向空间上下均分。
const STAGE_H = 750, MIN_W = 920, MAX_W = 1280, MIN_SCALE = 0.6, MAX_SCALE = 1.3;
const rootEl = ref(null), box = ref({ w: 0, h: 0 });
const stageStyle = computed(() => {
  const { w, h } = box.value;
  if (!w || !h) return {};
  const scale = Math.floor(Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(h / STAGE_H, w / MIN_W))) * 100) / 100;
  return { zoom: scale, width: `${Math.min(MAX_W, w / scale)}px`, minHeight: `${h / scale}px` };
});
let observer = null;
onMounted(() => {
  observer = new ResizeObserver(([entry]) => { box.value = { w: entry.contentRect.width, h: entry.contentRect.height }; });
  observer.observe(rootEl.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<style scoped>
.welcome-experience{width:100%;height:100%;overflow:auto;scrollbar-width:none;color:#26364f}
.experience-stage{display:flex;flex-direction:column;width:1280px;min-height:740px;margin:0 auto;padding:22px 40px 18px}
/* 面包屑贴顶，其余内容在剩余高度里居中 */
.experience-hero{margin-top:auto}.experience-coach .experience-composer{margin-bottom:auto}
.experience-assistant .experience-shortcuts{margin-bottom:auto}.experience-assistant .experience-footnote{margin-top:0;margin-bottom:0}
.experience-topline{display:flex;justify-content:space-between;align-items:center;color:#8290a5;font-size:12px;margin-bottom:26px}.experience-topline button,.experience-heading button{display:flex;align-items:center;gap:7px;background:none;border:0;color:#7d8ba2;font-size:12px;cursor:pointer}.experience-guide{padding:16px 20px;background:#fff;border:1px solid #dce5f4;border-radius:12px;margin-bottom:18px;font-size:13px;line-height:1.8}.experience-guide p{color:#70819a;margin:6px 0 0}
.experience-hero{position:relative}.experience-character{position:relative}.experience-character img{display:block;object-fit:contain}.experience-copy h2{font-size:clamp(25px,2.3vw,34px);font-weight:600;line-height:1.45;letter-spacing:-.7px;margin:0 0 14px}.experience-copy p{font-size:14px;line-height:1.9;color:#6b7c95;margin:0}.character-bubble{position:absolute;display:flex;align-items:center;gap:8px;white-space:nowrap;background:#ffffffeb;border:1px solid #edf1f8;border-radius:12px;padding:12px 14px;font-size:11px;color:#7b8da5;box-shadow:0 8px 22px #526ea00a}.character-bubble i{color:#63a98f}
.experience-assistant .experience-hero{text-align:center;padding:10px 0 30px}.experience-assistant .experience-character{height:230px;max-width:560px;margin:0 auto 13px;isolation:isolate}.experience-assistant .experience-character::before{content:'';position:absolute;inset:-45px -65px -32px;background:radial-gradient(ellipse at 38% 54%,#bcd1ff9c,transparent 60%),radial-gradient(ellipse at 71% 55%,#d9c8f280,transparent 59%);z-index:-1;pointer-events:none}.experience-assistant .experience-character::after{content:'';position:absolute;bottom:0;left:28%;width:44%;height:18px;background:radial-gradient(ellipse,#8199c933,transparent 70%);z-index:-1}.experience-assistant .experience-character img{height:100%;width:100%;margin:auto}.experience-assistant .character-bubble{right:-20px;top:76px}.experience-assistant .experience-composer{max-width:825px;margin:0 auto}.experience-shortcuts{text-align:center;margin:30px auto 0;max-width:760px}.experience-shortcuts h3{font-size:12px;color:#8796ae;font-weight:400;margin-bottom:15px}.experience-shortcuts>div{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.experience-shortcuts button{display:flex;align-items:center;justify-content:center;gap:14px;background:#fff;border:1px solid #dfe6f1;border-radius:11px;padding:18px 10px;color:#526681;font-size:13px;box-shadow:0 4px 12px #60739906;cursor:pointer}.experience-shortcuts i{color:#7b92c3;font-size:18px}.experience-shortcuts p{font-size:12px;color:#8c9bb0;margin-top:25px}.experience-footnote{text-align:center;font-size:11px;color:#a0adbf;margin:34px 0 0}
.experience-coach .experience-hero{display:flex;align-items:center;min-height:254px;border:1px solid #e0e8f5;border-radius:20px;background:radial-gradient(ellipse at 85% 60%,#bed6f68a,transparent 50%),radial-gradient(ellipse at 60% 80%,#ddd5f84a,transparent 40%),linear-gradient(120deg,#e9f0fc,#eff4fc);padding:25px 30px;margin-bottom:28px}.experience-coach .experience-copy{position:relative;width:64%;z-index:1}.experience-coach .experience-character{position:absolute;right:2%;bottom:0;height:265px;width:35%}.experience-coach .experience-character img{width:100%;height:100%;object-position:bottom}.experience-coach .character-bubble{left:-65px;top:84px;font-size:10px}.experience-coach .experience-copy h2{font-size:30px;margin:14px 0}.experience-badge{display:inline-flex;align-items:center;gap:7px;padding:5px 10px;background:#ffffffd9;border-radius:16px;font-size:10px;color:#7189ad}.experience-promises{display:flex;gap:24px;font-size:11px;color:#7f94b1;margin-top:17px}.experience-promises span{display:flex;gap:7px;align-items:center}.experience-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px}.experience-heading>div{display:flex;align-items:center;gap:20px}.experience-heading h3{font-size:18px;font-weight:600;margin:0}.experience-heading span{font-size:12px;color:#8797ae}.experience-scenario-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.experience-scenario-card{display:grid;grid-template-columns:42px 1fr;gap:14px;padding:20px;text-align:left;background:#fff;border:1px solid #dfe6f1;border-radius:14px;box-shadow:0 4px 14px #60739907;cursor:pointer;transition:transform .15s,border-color .15s,box-shadow .15s}.experience-scenario-card:hover{transform:translateY(-2px);border-color:#a6bbe8;box-shadow:0 8px 24px #506cad12}.scenario-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:11px;font-size:19px;background:#edf2fd;color:#6c88cf}.scenario-icon.green{background:#edf6f2;color:#70a18b}.scenario-icon.purple{background:#f2eefb;color:#9984bd}.scenario-icon.amber{background:#faf3e8;color:#b79462}.scenario-copy{display:flex;flex-direction:column;min-width:0;gap:6px}.scenario-category{font-size:10px;color:#8c9ab0}.scenario-copy strong{font-size:16px;line-height:1.6;font-weight:600;color:#2a3850}.scenario-description{font-size:12px;line-height:1.7;color:#72829a}.scenario-bottom{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:10px;color:#91a0b4;margin-top:2px}.scenario-bottom>span:last-child{white-space:nowrap}.scenario-bottom i{margin-left:12px;color:#879bc0}.experience-coach .experience-composer{margin-top:24px}.experience-composer h3{font-size:13px;font-weight:500;color:#687b96;margin:0 0 12px}button:focus-visible{outline:2px solid #4e70e5;outline-offset:3px}
.experience-assistant .experience-character::before{mask-image:radial-gradient(ellipse,black 25%,transparent 70%);-webkit-mask-image:radial-gradient(ellipse,black 25%,transparent 70%)}
/* 画布内全部用固定尺寸，缩放交给 zoom */
.experience-assistant .experience-composer,.experience-shortcuts{width:100%}
.experience-topline{margin-bottom:14px}
.experience-assistant .experience-hero{padding:0 0 24px}
.experience-assistant .experience-character{height:200px;margin-bottom:12px}
.experience-assistant .character-bubble{top:30%}
.experience-assistant .experience-copy h2{font-size:30px;line-height:1.3;margin:0 0 8px}
.experience-assistant .experience-copy p{font-size:13px;line-height:1.7}
.experience-shortcuts{margin-top:26px}
.experience-shortcuts h3{margin-bottom:14px}
.experience-shortcuts button{padding:16px 10px}
.experience-shortcuts p{margin-top:20px}
.experience-footnote{padding-top:20px}
.experience-coach .experience-hero{min-height:0;height:236px;padding:22px 30px;margin-bottom:22px}
.experience-coach .experience-character{height:100%}
.experience-coach .experience-copy h2{font-size:28px;line-height:1.35;margin:12px 0}
.experience-coach .experience-copy p{font-size:13px;line-height:1.75}
.experience-promises{margin-top:14px}
.experience-heading{margin-bottom:14px}
.experience-scenario-grid{gap:12px}
.experience-scenario-card{padding:18px;row-gap:8px}
.scenario-copy{gap:3px}
.scenario-copy strong{font-size:15px;line-height:1.5}
.scenario-description{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.experience-coach .experience-composer{margin-top:20px}
.experience-coach .experience-composer h3{margin-bottom:8px}
.experience-coach .experience-footnote{display:none}
@media(prefers-reduced-motion:reduce){.experience-scenario-card{transition:none}.experience-scenario-card:hover{transform:none}}
</style>
