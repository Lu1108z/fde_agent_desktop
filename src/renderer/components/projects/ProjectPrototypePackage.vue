<template>
  <section class="project-demo-package" aria-label="产品原型 Demo 交付包">
    <header><div><small>当前交付物 · 阶段 2 / 需求沟通</small><h2>产品原型 Demo</h2><p>根据需求与 AI 能力清单制作可交互原型；PRD 在阶段三生成。</p></div><button type="button" :disabled="streaming || loading" @click="$emit('generate')">{{ streaming ? '正在生成…' : hasAny ? '更新产品原型 Demo' : '生成产品原型 Demo' }}</button></header>
    <div v-if="error" class="demo-error" role="alert">{{ error }}<button @click="refresh">重新读取</button></div>
    <div class="demo-preview-actions"><strong>可交互原型</strong><span>prototype/index.html</span><button type="button" :disabled="!contents['prototype/index.html']" @click="openExternal">在浏览器打开</button><button type="button" :disabled="loading" @click="refresh">刷新</button></div>
    <p v-if="formatIssues.length" class="demo-notice">已有内容是草稿，仍需对齐知识中心格式：{{ formatIssues.slice(0,3).join('；') }}</p>
    <div v-if="loading" class="demo-empty">正在读取原型…</div>
    <iframe v-else-if="previewUrl" :src="previewUrl" title="产品原型 Demo 本体" class="demo-frame"></iframe>
    <div v-else class="demo-empty"><i class="fa-solid fa-window-maximize"></i><h3>{{ contents['prototype/index.html'] ? '原型预览暂不可用' : '还没有原型本体' }}</h3><p>{{ contents['prototype/index.html'] ? '可使用“在浏览器打开”查看实际文件。' : '说明文档不能替代原型。生成原型后，会在这里展示可点击的 HTML 原型。' }}</p></div>
  </section>
</template>
<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { stage2FormatIssues } from '@/data/stage2-contract.mjs';
const props=defineProps({slug:String,streaming:Boolean});defineEmits(['generate','open-document']);
const parts=[{name:'原型 Demo',path:'prototype/index.html',icon:'fa-solid fa-window-maximize'}];
const contents=ref({}),actualPaths=ref({}),previewUrl=ref(''),error=ref(''),loading=ref(false);
const hasAny=computed(()=>Object.values(contents.value).some(Boolean));
const formatIssues=computed(()=>parts.filter(file=>contents.value[file.path]).flatMap(file=>stage2FormatIssues(contents.value[file.path],file.path)));
let sequence=0;
async function refresh(){const seq=++sequence;loading.value=true;error.value='';try{const entries=await Promise.all(parts.map(async part=>{let path=part.path,result=await window.api.hermes.readFile(props.slug,path);if(!result?.success&&part.legacyPath&&/ENOENT|not found|不存在/i.test(result?.error||'')){path=part.legacyPath;result=await window.api.hermes.readFile(props.slug,path);}if(result?.success)return[part.path,String(result.content||''),path];if(/ENOENT|not found|不存在/i.test(result?.error||''))return[part.path,'',part.path];throw Error(result?.error||`无法读取 ${part.name}`);}));if(seq!==sequence)return;contents.value=Object.fromEntries(entries.map(([key,text])=>[key,text]));actualPaths.value=Object.fromEntries(entries.map(([key,,path])=>[key,path]));await openDemo();}catch(e){if(seq===sequence)error.value=e.message;}finally{if(seq===sequence)loading.value=false;}}
async function openDemo(){previewUrl.value='';if(!contents.value['prototype/index.html'])return;const result=await window.api.hermes.prototypeUrl(props.slug,'index.html');if(result?.success&&result.url)previewUrl.value=result.url;else error.value=result?.error||'原型预览服务未就绪';}
async function openExternal(){try{const result=await window.api.hermes.openInBrowser(props.slug,'prototype/index.html');if(!result?.success)throw Error(result?.error||'打开原型失败');}catch(e){error.value=e.message;}}
onMounted(refresh);watch(()=>props.slug,refresh);watch(()=>props.streaming,value=>{if(!value)refresh();});
</script>
<style>
.project-demo-package{display:flex;flex-direction:column;flex:1;min-height:0;background:white;color:#334155}.project-demo-package>header{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 22px;border-bottom:1px solid #e2e8f0;flex-shrink:0}.project-demo-package header small{font-size:11px;color:#64748b}.project-demo-package h2{font-size:18px;font-weight:600;line-height:1.5;color:#172036;margin:3px 0}.project-demo-package header p{font-size:12px;color:#64748b}.project-demo-package button{font-size:12px;line-height:1.5;cursor:pointer;border:1px solid #dce5f3;background:white;color:#475569;padding:7px 10px;border-radius:8px}.project-demo-package button:hover:not(:disabled){border-color:#93b4fb;color:#2563eb;background:#f5f8ff}.project-demo-package button:disabled{opacity:.5;cursor:not-allowed}.project-demo-package header>button{background:#2563eb;border-color:#2563eb;color:white;flex-shrink:0}.project-demo-package nav{display:flex;flex-wrap:wrap;gap:8px;padding:12px 22px;border-bottom:1px solid #edf1f7;flex-shrink:0}.project-demo-package nav button{display:flex;gap:8px;align-items:center}.project-demo-package nav .selected{color:#2563eb;background:#eff6ff;border-color:#bfdbfe}.project-demo-package nav small{font-size:10px;color:#94a3b8}.demo-preview-actions{display:flex;align-items:center;gap:10px;padding:10px 22px;flex-wrap:wrap;font-size:12px;flex-shrink:0}.demo-preview-actions strong{font-weight:500}.demo-preview-actions span{color:#94a3b8;margin-right:auto}.demo-frame{width:100%;border:0;flex:1;min-height:320px;background:#f8fafc}.demo-empty{flex:1;min-height:250px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:28px;text-align:center;color:#64748b;font-size:13px}.demo-empty>i{font-size:30px;color:#b6c6de}.demo-empty h3{font-size:15px;font-weight:500}.demo-notice,.demo-error{font-size:12px;line-height:1.7;padding:10px 22px;background:#fff8ed;color:#a16207;flex-shrink:0}.demo-error{color:#b91c1c;background:#fff1f2}.demo-error button{margin-left:10px}
</style>
