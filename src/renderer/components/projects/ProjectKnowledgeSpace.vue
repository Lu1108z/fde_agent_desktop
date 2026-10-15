<template>
  <section class="knowledge-space" :class="{'is-embedded':embedded,'is-reading':embedded&&selected&&!editing}" :aria-label="embedded?'阶段一项目资料':'项目资料空间'">
    <header v-if="!embedded||!selected||editing" class="knowledge-header">
      <span v-if="embedded" class="preparation-icon"><i class="fa-regular fa-folder-open" aria-hidden="true"></i></span>
      <div><h2>{{embedded?'资料准备':'项目资料'}}</h2><p>{{embedded?'上传项目相关资料，便于后续对接和生成内容。':'客户沟通、会议纪要和需求文件，集中查看与提问'}}</p></div>
      <div class="header-actions"><button v-if="!embedded" :disabled="busy" @click="refresh"><i class="fa-solid fa-rotate"></i>刷新</button><button v-if="!embedded" @click="linkLibrary">关联资料库</button><button @click="startNote"><i class="fa-solid fa-pen-to-square"></i>{{embedded?'从记录导入':'录入沟通记录'}}</button><button class="primary" :disabled="busy" @click="upload()"><i class="fa-solid fa-arrow-up-from-bracket"></i>{{ busy ? '上传中…' : '上传资料' }}</button></div>
    </header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div v-if="embedded && !editing && !selected" class="preparation-content">
      <button type="button" class="upload-dropzone" :class="{'is-dragging':dropActive}" :disabled="busy" @click="upload()" @dragover.prevent="dropActive=true" @dragleave.prevent="dropActive=false" @drop.prevent="dropFiles">
        <span class="upload-cloud"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i></span>
        <strong>{{busy?'正在上传资料…':'拖拽文件到这里，或'}} <span v-if="!busy">点击上传</span></strong>
        <span class="upload-hint">支持 Word、PDF、表格、图片、视频等文件</span>
      </button>
      <div class="materials-heading"><h3>已上传资料 <span>({{files.length}})</span></h3><button type="button" class="sort-materials" @click="sortNewest=!sortNewest">{{sortNewest?'按上传时间':'按文件名称'}} <i class="fa-solid fa-arrow-down-short-wide" aria-hidden="true"></i></button></div>
      <div v-if="files.length" class="materials-table">
        <button v-for="file in orderedFiles" :key="file.path" type="button" class="source-item material-row" @click="selectFile(file)"><span class="material-icon"><i :class="fileIcon(file.type)" aria-hidden="true"></i></span><span class="material-name"><strong :title="file.name">{{file.name}}</strong><small>{{file.category}} · {{file.type.toUpperCase()}}</small></span><time v-if="file.updatedAt">{{formatFileDate(file.updatedAt)}}</time><span class="material-open">预览 <i class="fa-solid fa-chevron-right" aria-hidden="true"></i></span></button>
      </div>
      <div v-else class="materials-empty"><i class="fa-solid fa-folder-open" aria-hidden="true"></i><h3>暂无资料</h3><p>上传客户文件、需求文档或相关资料后会显示在这里</p></div>
    </div>
    <div v-else class="knowledge-columns">
      <aside v-if="!embedded" class="source-list">
        <label class="search"><i class="fa-solid fa-magnifying-glass"></i><input v-model="search" aria-label="搜索项目资料" placeholder="搜索资料名称…"></label>
        <div class="list-caption">{{ files.length }} 份资料 <span>项目资料与关联原件</span></div>
        <div class="source-scroll">
          <button v-for="file in filteredFiles" :key="file.path" class="source-item" :class="{selected:selected?.path === file.path}" @click="selectFile(file)"><i class="fa-regular fa-file-lines"></i><span><strong>{{ file.name }}</strong><small>{{ file.category }} · {{ file.type.toUpperCase() }} · {{parseState[file.path] || '未解析'}}</small></span></button>
          <p v-if="!filteredFiles.length" class="list-empty">{{ files.length ? '没有匹配的资料' : '还没有项目资料。导入客户文件，或录入一次沟通记录。' }}</p>
        </div>
      </aside>
      <main class="source-preview">
        <div v-if="embedded" class="back-to-materials"><button type="button" @click="backToMaterials"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i>返回资料列表</button><button v-if="selected&&['pdf','html','htm'].includes(selected.type)" type="button" @click="toggleTextReading">{{textReading?'原件预览':'文字阅读'}} <i class="fa-solid fa-align-left" aria-hidden="true"></i></button></div>
        <div v-if="linking" class="note-form"><h3>选择资料库原件</h3><p>关联后在本项目查看与提问，资料库更新会同步生效。</p><label v-for="item in libraryEntries" :key="item.id"><span><input type="checkbox" v-model="linkedIds" :value="item.id"> {{item.title}}</span></label><div class="header-actions"><button @click="linking=false">取消</button><button class="primary" :disabled="busy" @click="saveLinks">保存关联</button></div></div>
        <form v-else-if="editing" class="note-form" @submit.prevent="saveNote">
          <h3>录入客户沟通记录</h3><p>记录客户说了什么、达成了什么结论，还有哪些待确认事项。</p>
          <label>记录标题<input v-model="note.title" required maxlength="120" placeholder="例如：与运营办首次需求沟通"></label>
          <div class="form-row"><label>资料类型<UiSelect field v-model="note.category" :options="[{ value: '客户对接', label: '客户对接' }, { value: '会议纪要', label: '会议纪要' }, { value: '需求资料', label: '需求资料' }, { value: '业务知识', label: '业务知识' }]" /></label><label>沟通日期<input v-model="note.date" type="date" required></label></div>
          <label>参与人员<input v-model="note.people" placeholder="客户参与人、我方参与人"></label>
          <label class="note-content">沟通内容<textarea v-model="note.content" required placeholder="业务背景与痛点：&#10;&#10;客户提出的需求：&#10;&#10;已确认结论：&#10;&#10;待确认事项："></textarea></label>
          <div class="header-actions"><button type="button" @click="editing=false">取消</button><button class="primary" :disabled="saving || !note.title.trim() || !note.content.trim()">{{ saving ? '保存中…' : '保存到项目资料' }}</button></div>
        </form>
        <LibraryDocument @selection="captureExcerpt" v-else-if="selected" :key="selected.path+String(textReading)" :item="previewItem" :api="previewApi" readonly><template #navigation><strong>{{selected.name}}</strong></template></LibraryDocument>
        <div v-else class="empty-view"><span class="empty-icon"><i class="fa-regular fa-folder-open"></i></span><h3>先把项目背景放进来</h3><p>支持 Word、PDF、表格、图片等文件，也可以直接录入对接记录。<br>资料保存后会出现在左侧清单，可点击查看正文。</p><div class="header-actions" v-if="!embedded"><button @click="startNote">录入客户沟通</button><button class="primary" :disabled="busy" @click="upload()">导入文件</button></div></div>
      </main>
      <aside v-if="!embedded" class="knowledge-chat">
        <div class="chat-heading"><img :src="coachAvatar" alt="FDE 助手"><div><h3>资料问答</h3><p>结合项目资料，回答附来源</p></div></div>
        <div class="scope-picker"><label for="knowledge-scope">提问范围</label><UiSelect field id="knowledge-scope" v-model="scope" :options="[{ value: 'all', label: '全部项目资料（' + String(files.length) + '）' }, { value: 'selected', label: '当前资料' + String(selected ? `：${selected.name}` : ''), disabled: !selected }]" /></div>
        <div ref="chatScroll" class="chat-scroll" @click="followSource">
          <div v-if="!messages.length" class="chat-empty"><p>可以这样问</p><button :disabled="!files.length || streaming" @click="ask('根据资料梳理客户的核心需求，并列出依据和待确认事项。')">客户的核心需求是什么？</button><button :disabled="!files.length || streaming" @click="ask('汇总客户沟通中已确认的结论和仍有分歧的问题，逐项标明来源。')">哪些结论已经确认？</button><button :disabled="!files.length || streaming" @click="ask('检查现有资料缺少哪些信息，列出下一次客户沟通应追问的问题。')">下次沟通还要问什么？</button></div>
          <div v-for="(message,index) in messages" :key="index" class="knowledge-message" :class="message.role"><strong>{{ message.role==='user' ? '你' : 'FDE 助手' }}</strong><ThinkingSummary v-if="message.role==='assistant'" :message="message" :busy="streaming && index===messages.length-1" /><div class="knowledge-prose" v-html="safeMarkdown(message.role==='assistant'?cleanAssistantContent(message.typingContent || message.content || ''):message.content || (streaming && index===messages.length-1 ? '正在阅读资料…' : ''))"></div></div>
        </div>
        <div v-if="excerpt" class="inline-excerpt"><strong>已选中内容</strong><button type="button" aria-label="取消选中内容" @click="captureExcerpt({text:''})"><i class="fa-solid fa-xmark"></i></button><p>{{excerpt}}</p></div>
        <form class="ask-form" @submit.prevent="ask()"><label class="sr-only" for="knowledge-question">向项目资料提问</label><textarea id="knowledge-question" v-model="question" :placeholder="files.length ? '向项目资料提问…' : '先导入资料，再开始提问'" :disabled="!files.length" @keydown.ctrl.enter.prevent="ask()" @keydown.meta.enter.prevent="ask()"></textarea><div class="ask-footer"><span>{{ streaming ? '正在处理…' : 'Ctrl / ⌘ + Enter 发送' }}</span><button v-if="streaming" type="button" @click="$emit('cancel')" aria-label="停止回答"><i class="fa-solid fa-stop"></i></button><button v-else class="primary" :disabled="!question.trim() || !files.length" aria-label="发送问题"><i class="fa-solid fa-paper-plane"></i></button></div></form>
      </aside>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { marked } from 'marked';
import ThinkingSummary from '@/components/agent/ThinkingSummary.vue';
import { cleanAssistantContent } from '@/data/assistant-content';
import coachAvatar from '@/assets/fde-coach-avatar.png';
import LibraryDocument from '@/pages/library/LibraryDocument.vue';
import { onBeforeRouteLeave } from 'vue-router';
import { listProjectKnowledge, knowledgePassages } from '@/composables/projectKnowledge';
const props = defineProps({slug:{type:String,required:true},messages:{type:Array,default:()=>[]},streaming:Boolean,sourcePath:{type:String,default:''},embedded:Boolean});
const emit = defineEmits(['ask','cancel','changed','busy','view','selection']);
const files=ref([]), selected=ref(null), search=ref(''), scope=ref('all'), question=ref(''), busy=ref(false), saving=ref(false), error=ref(''), editing=ref(false);
const previewData=ref(''), previewKind=ref('text'), previewLoading=ref(false), previewError=ref(''), chatScroll=ref(null);
const note=ref({title:'',category:'客户对接',date:'',people:'',content:''});
const filteredFiles=computed(()=>files.value.filter(file=>`${file.name} ${file.category}`.toLowerCase().includes(search.value.trim().toLowerCase())));
const excerpt=ref(''),textReading=ref(false);
async function toggleTextReading(){textReading.value=!textReading.value;captureExcerpt({text:''});}

function captureExcerpt(value){excerpt.value=value.text||'';emit('selection',{text:excerpt.value,file:selected.value});}
watch(selected,file=>{excerpt.value='';textReading.value=false;emit('selection',{text:'',file});emit('view',file);if(file)scope.value='selected';else scope.value='all';},{immediate:true});
const sortNewest=ref(true),dropActive=ref(false);
const orderedFiles=computed(()=>[...files.value].sort((a,b)=>sortNewest.value?(Number(b.updatedAt)||0)-(Number(a.updatedAt)||0)||a.name.localeCompare(b.name,'zh-CN'):a.name.localeCompare(b.name,'zh-CN')));
function fileIcon(type){return {docx:'fa-solid fa-file-word',doc:'fa-solid fa-file-word',pdf:'fa-solid fa-file-pdf',xlsx:'fa-solid fa-file-excel',xls:'fa-solid fa-file-excel',csv:'fa-solid fa-file-csv',mp4:'fa-solid fa-file-video',mov:'fa-solid fa-file-video',png:'fa-solid fa-file-image',jpg:'fa-solid fa-file-image',jpeg:'fa-solid fa-file-image'}[type]||'fa-regular fa-file-lines';}
function formatFileDate(value){return new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});}
function backToMaterials(){if(!leaveNote())return;editing.value=false;selected.value=null;}
async function dropFiles(event){dropActive.value=false;if(busy.value)return;const dropped=Array.from(event.dataTransfer?.files||[]);if(dropped.length)await upload(dropped);}
const linking=ref(false),libraryEntries=ref([]),linkedIds=ref([]),parseState=ref({});
const previewItem=computed(()=>selected.value?{id:selected.value.libraryId||selected.value.path,title:selected.value.name,ext:selected.value.type,kind:'file'}:null);
const previewApi=computed(()=>{const file=selected.value;return {read:async()=>{if(textReading.value){const result=await knowledgePassages(props.slug,file);return result.status==='ready'?{success:true,document:{format:'text',ext:file.type,content:result.text}}:{success:false,error:result.notice||'此文件暂时没有可提取的正文'};}if(file.libraryId)return window.api.library.read(file.libraryId);if(file.type==='md'){const result=await window.api.hermes.readFile(props.slug,file.path);return result.success?{success:true,document:{format:'html',ext:'md',content:safeMarkdown(result.content)}}:result;}return window.api.hermes.previewMaterial(props.slug,file.path);},open:()=>file.libraryId?window.api.library.open(file.libraryId):window.api.hermes.openInBrowser(props.slug,file.path),export:()=>file.libraryId?window.api.library.export(file.libraryId):window.api.hermes.saveFile(props.slug,file.path)};});
const noteKey='fde-project-note:'+props.slug;
try{const draft=JSON.parse(localStorage.getItem(noteKey)||'null');if(draft){note.value=draft;editing.value=true;}}catch{}
watch(note,value=>{if(editing.value)try{localStorage.setItem(noteKey,JSON.stringify(value));}catch{}},{deep:true});
function leaveNote(){if(!editing.value||!note.value.content.trim())return true;return window.confirm('沟通记录尚未保存，草稿已保留在本机。离开编辑吗？');}
if(!props.embedded)onBeforeRouteLeave(leaveNote);
watch([editing,saving,busy],()=>emit('busy',editing.value||saving.value||busy.value),{immediate:true});
defineExpose({beforeLeave:leaveNote,refresh});
async function linkLibrary(){if(!leaveNote())return;editing.value=false;const result=await window.api.library.list();if(!result.success){error.value=result.error;return;}libraryEntries.value=result.entries.filter(e=>!e.deletedAt&&e.kind!=='link');linkedIds.value=libraryEntries.value.filter(e=>(e.projectSlugs||[]).includes(props.slug)).map(e=>e.id);linking.value=true;}
async function saveLinks(){busy.value=true;try{for(const item of libraryEntries.value){const slugs=(item.projectSlugs||[]).filter(s=>s!==props.slug);if(linkedIds.value.includes(item.id))slugs.push(props.slug);const result=await window.api.library.associate(item.id,slugs);if(!result.success)throw Error(result.error);}linking.value=false;await refresh();}catch(e){error.value=e.message;}finally{busy.value=false;}}
let previewSeq=0;
// 不执行上传资料或 AI 回复里的 HTML、脚本和外部图片。
function safeHtml(html) {
  const doc=new DOMParser().parseFromString(html,'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,form,input,button,link,meta,svg,img').forEach(node=>node.remove());
  doc.querySelectorAll('*').forEach(node=>Array.from(node.attributes).forEach(attr=>{
    if (!['href','colspan','rowspan'].includes(attr.name)) node.removeAttribute(attr.name);
    else if(attr.name==='href' && !attr.value.startsWith('#knowledge/')) node.removeAttribute('href');
  }));
  return doc.body.innerHTML;
}
function safeMarkdown(text) { return safeHtml(marked.parse(String(text).replace(/</g,'&lt;').replace(/>/g,'&gt;'),{breaks:true})); }
async function refresh() {
  error.value='';
  try { files.value=await listProjectKnowledge(props.slug);emit('changed',files.value); if(selected.value && !files.value.some(file=>file.path===selected.value.path)) selected.value=null; }
  catch(e) {error.value=e.message || '资料读取失败';emit('changed',null);}
}
async function upload(dropped) {
  if(!leaveNote())return;
  busy.value=true; error.value='';
  try { const result=dropped?.length?await window.api.hermes.uploadKnowledgeFromDrop(props.slug,dropped):await window.api.hermes.uploadKnowledge(props.slug); if(result?.canceled)return; if(!result?.success)throw new Error(result?.error||'导入失败'); await refresh(); const file=files.value.find(file=>file.path===`knowledge/${result.files?.[0]}`); if(file&&!props.embedded)await selectFile(file); selected.value=props.embedded?null:selected.value; editing.value=false; }
  catch(e){error.value=e.message;}
  finally{busy.value=false;}
}
function startNote() { if(!leaveNote())return;linking.value=false;editing.value=true; note.value={title:'',category:'客户对接',date:new Date().toLocaleDateString('sv-SE'),people:'',content:''}; }
async function saveNote() {
  if(saving.value || !note.value.title.trim() || !note.value.content.trim())return;
  saving.value=true; error.value='';
  const record={...note.value};
  const name=record.title.trim().replace(/[\\/:*?"<>|\x00-\x1f]/g,'-');
  const path=`knowledge/${record.category}/${record.date}-${name}-${Date.now()}.md`;
  const content=`# ${record.title.trim()}\n\n- 资料类型：${record.category}\n- 沟通日期：${record.date}\n- 参与人员：${record.people.trim()||'未填写'}\n\n## 沟通记录\n\n${record.content.trim()}\n`;
  try {const result=await window.api.hermes.writeFile(props.slug,path,content); if(!result?.success)throw new Error(result?.error||'保存失败'); editing.value=false;localStorage.removeItem(noteKey); await refresh(); if(!props.embedded)await selectFile(files.value.find(file=>file.path===path));else selected.value=null;}
  catch(e){error.value=e.message;}
  finally{saving.value=false;}
}
async function selectFile(file){if(!file||!leaveNote())return;selected.value=file;editing.value=false;linking.value=false;const result=await knowledgePassages(props.slug,file);parseState.value={...parseState.value,[file.path]:result.status==='ready'?'可检索':result.status==='error'?'解析失败':'需读取原件'};}
async function openOriginal(){error.value='';try{const result=await window.api.hermes.openInBrowser(props.slug,selected.value.path);if(!result?.success)throw new Error(result?.error||'打开失败');}catch(e){error.value=e.message;}}
function ask(text){const value=(typeof text==='string'?text:question.value).trim();if(!value || props.streaming || !files.value.length)return;question.value='';emit('ask',{text:value,paths:scope.value==='selected' && selected.value?[selected.value.path]:undefined,excerpt:scope.value==='selected'?excerpt.value:undefined,reference:selected.value?.name});}
function followSource(event){const link=event.target.closest('a[href^="#knowledge/"]');if(!link)return;event.preventDefault();event.stopPropagation();try{const path=decodeURIComponent(link.getAttribute('href').slice('#knowledge/'.length));const file=files.value.find(file=>file.path===path);if(file)selectFile(file);}catch{error.value='来源链接无法识别';}}
watch(()=>props.messages.map(message=>message.typingContent||message.content).join(''),()=>nextTick(()=>{if(chatScroll.value)chatScroll.value.scrollTop=chatScroll.value.scrollHeight;}));
async function openSourcePath(){if(!props.sourcePath)return;await refresh();const file=files.value.find(file=>file.path===props.sourcePath);if(file)await selectFile(file);else error.value='此来源已移除或不再关联本项目';}
watch(()=>props.sourcePath,openSourcePath);
onMounted(async()=>{await refresh();await openSourcePath();});
</script>

<style scoped>
.knowledge-space{display:flex;flex:1;min-width:0;min-height:0;flex-direction:column;background:#f7f9fd;color:#334155;font-size:13px}.knowledge-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 24px;border-bottom:1px solid #e4eaf3;background:#fff}.knowledge-header h2{font-size:18px;font-weight:600;color:#172036}.knowledge-header p,.note-form>p{margin-top:4px;font-size:12px;color:#64748b}.header-actions{display:flex;align-items:center;gap:8px}button{cursor:pointer;transition:background .15s,border-color .15s}button:disabled{cursor:default;opacity:.5}.header-actions button,.preview-heading button,.empty-view>button,.ask-footer button{border:1px solid #dde5f0;border-radius:8px;padding:8px 12px;background:#fff;white-space:nowrap}button:hover:not(:disabled){background:#f0f5ff}button i{margin-right:6px}.header-actions button.primary,.ask-footer button.primary{background:#2563eb;color:#fff;border-color:#2563eb}.knowledge-columns{display:flex;min-height:0;flex:1;overflow:hidden}.source-list{display:flex;flex-direction:column;width:205px;flex-shrink:0;padding:16px 12px;border-right:1px solid #e4eaf3;background:#f7faff}.search{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #dce4f0;border-radius:8px;padding:8px;color:#94a3b8}.search input{width:100%;min-width:0;outline:none;background:transparent;font-size:12px}.list-caption{display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin:14px 2px 9px}.list-caption span{color:#94a3b8}.source-scroll{overflow-y:auto;min-height:0}.source-item{display:flex;gap:9px;align-items:flex-start;padding:11px 9px;width:100%;text-align:left;border-radius:8px;margin-bottom:4px}.source-item>i{color:#6b8cc4;margin-top:3px}.source-item span{min-width:0}.source-item strong{display:block;font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.source-item small{display:block;font-size:11px;color:#8394ad;margin-top:4px}.source-item.selected{background:#e8efff;color:#1d4ed8}.list-empty{font-size:12px;line-height:1.8;padding:16px 4px;color:#8291a8}.source-preview{display:flex;flex:1;min-width:0;min-height:0;flex-direction:column;background:#fff;margin:14px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}.preview-heading{padding:16px 20px;border-bottom:1px solid #e9eef5;display:flex;gap:12px;align-items:center;justify-content:space-between}.preview-heading>div{min-width:0}.preview-heading h3{font-size:15px;font-weight:550;overflow-wrap:anywhere;color:#172036}.preview-heading p{font-size:11px;color:#8b9ab1;margin-top:4px;overflow-wrap:anywhere}.preview-heading button{font-size:11px}.preview-heading button i{margin:0 0 0 6px}.preview-scroll{overflow:auto;padding:24px;min-height:0;flex:1}.preview-scroll pre{font-family:inherit;font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.9}.image-preview{max-width:100%;height:auto;margin:auto}.pdf-preview{flex:1;min-height:0;width:100%;border:0}.empty-view{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px;gap:14px;color:#758399}.empty-view h3{font-size:16px;font-weight:550;color:#334155}.empty-view p{line-height:1.9;font-size:13px}.empty-icon{display:grid;place-items:center;width:56px;height:56px;background:#eff5ff;color:#5083e7;border-radius:14px;font-size:23px}.knowledge-chat{width:310px;min-width:260px;max-width:34%;flex-shrink:0;background:#fff;border-left:1px solid #e4eaf3;display:flex;flex-direction:column;min-height:0}.chat-heading{display:flex;align-items:center;gap:10px;padding:18px 16px 12px}.chat-heading img{width:36px;height:36px;object-fit:cover;border-radius:50%}.chat-heading h3{font-size:14px;font-weight:550;color:#172036}.chat-heading p{font-size:11px;color:#8391a8;margin-top:3px}.scope-picker{padding:0 16px 12px;border-bottom:1px solid #edf1f6}.scope-picker label{font-size:11px;color:#64748b;display:block;margin-bottom:5px}.scope-picker .ui-select{width:100%;border:1px solid #e1e7f0;border-radius:7px;padding:7px;background:#f8faff;font-size:12px}.chat-scroll{flex:1;min-height:0;overflow-y:auto;padding:16px}.chat-empty p{font-size:12px;color:#8a98ac;margin:12px 0}.chat-empty button{display:block;border:1px solid #e4eaf3;border-radius:8px;background:#fff;padding:10px;margin:8px 0;width:100%;text-align:left;font-size:12px;color:#526784}.knowledge-message{padding:12px 0 16px;border-bottom:1px solid #edf1f7;margin-bottom:12px;overflow-wrap:anywhere}.knowledge-message>strong{font-size:11px;font-weight:550;color:#2563eb}.knowledge-message.user{padding:10px 12px;background:#f0f5ff;border:0;border-radius:10px}.knowledge-message.user>strong{color:#64748b}.knowledge-message .knowledge-prose{font-size:13px;margin-top:7px}.ask-form{margin:10px 14px 14px;padding:11px;background:#fff;border:1px solid #dbe5f4;border-radius:12px}.ask-form textarea{width:100%;resize:none;outline:none;min-height:54px;font-size:13px;line-height:1.6}.ask-footer{display:flex;align-items:center;justify-content:space-between;margin-top:5px}.ask-footer span{font-size:10px;color:#94a3b8}.ask-footer button{padding:6px 9px!important}.ask-footer button i{margin:0}.note-form{display:flex;flex-direction:column;gap:14px;padding:24px;overflow:auto;flex:1}.note-form h3{font-size:16px;font-weight:550;color:#172036}.note-form label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:#64748b}.note-form input,.note-form textarea,.note-form .ui-select{border:1px solid #dbe3ef;border-radius:8px;padding:9px 11px;color:#334155;background:#fff;font-size:13px}.note-content{flex:1;min-height:160px}.note-content textarea{flex:1;resize:vertical;line-height:1.8}.form-row{display:flex;gap:12px}.form-row label{flex:1;min-width:0}.error{padding:8px 24px;background:#fff1f2;color:#b91c1c;font-size:12px}.knowledge-prose{font-size:14px;line-height:1.85;overflow-wrap:anywhere}.knowledge-prose :deep(h1){font-size:22px;line-height:1.5;margin-bottom:20px;color:#172036}.knowledge-prose :deep(h2){font-size:17px;margin:22px 0 12px;font-weight:550;color:#172036}.knowledge-prose :deep(h3){font-size:15px;margin:16px 0 8px;font-weight:550}.knowledge-prose :deep(p){margin:8px 0}.knowledge-prose :deep(ul),.knowledge-prose :deep(ol){padding-left:22px;margin:8px 0}.knowledge-prose :deep(table){width:100%;border-collapse:collapse;font-size:12px;margin:12px 0}.knowledge-prose :deep(td),.knowledge-prose :deep(th){padding:8px;border:1px solid #e2e8f0}.knowledge-prose :deep(th){background:#f4f7fc}.knowledge-prose :deep(a){color:#2563eb;text-decoration:underline}.knowledge-prose :deep(pre){white-space:pre-wrap;background:#f5f7fb;padding:12px;border-radius:8px}

.form-row label>.ui-select{display:flex;width:100%}
.is-embedded{background:#fff;border:1px solid #e5ebf4;border-radius:16px;box-shadow:0 4px 18px #18355e03;flex:none;overflow:hidden}.is-embedded .knowledge-header{padding:22px 24px 18px;border:0;gap:16px;flex-wrap:wrap}.preparation-icon{display:grid;place-items:center;width:46px;height:46px;flex-shrink:0;border-radius:12px;background:#eff4ff;color:#2563eb;font-size:21px}.is-embedded .knowledge-header>div:first-of-type{flex:1;min-width:180px}.is-embedded .knowledge-header h2{font-size:18px}.is-embedded .knowledge-header p{line-height:1.7}.is-embedded .knowledge-header .header-actions{margin-left:auto}.is-embedded .header-actions button{min-height:40px;padding:9px 14px}.preparation-content{padding:0 24px 24px}.upload-dropzone{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;min-height:162px;gap:12px;border:1px dashed #c9d9f5;border-radius:12px;background:#f9fbff;padding:24px;cursor:pointer}.upload-dropzone:hover:not(:disabled),.upload-dropzone.is-dragging{border-color:#2563eb;background:#eff5ff}.upload-cloud{display:grid;place-items:center;width:48px;height:48px;background:#eef4ff;border-radius:50%;font-size:24px;color:#2563eb}.upload-dropzone strong{font-size:14px;font-weight:550;color:#334155}.upload-dropzone strong>span{color:#2563eb}.upload-hint{font-size:12px;color:#64748b;line-height:1.7}.materials-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:24px;padding-bottom:14px;border-bottom:1px solid #edf1f7}.materials-heading h3{font-size:14px;font-weight:550;color:#334155}.materials-heading h3 span{margin-left:4px;color:#64748b;font-size:12px;font-weight:400}.sort-materials{font-size:12px;color:#64748b;padding:6px;border-radius:6px}.sort-materials i{margin-left:6px;margin-right:0}.materials-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:160px;text-align:center;gap:12px;color:#64748b;padding:24px}.materials-empty>i{color:#c8d4e7;font-size:42px}.materials-empty h3{font-size:14px;font-weight:500}.materials-empty p{font-size:12px;line-height:1.8}.material-row{align-items:center;padding:13px 8px;border-bottom:1px solid #edf1f7;margin:0;border-radius:0;gap:12px}.material-icon{display:grid;place-items:center;width:34px;height:38px;flex-shrink:0;font-size:21px;color:#5f80bb}.material-name{flex:1;min-width:0}.material-row strong{font-size:13px}.material-row small{font-size:11px}.material-row time,.material-open{font-size:11px;color:#64748b;flex-shrink:0}.material-open{margin-left:12px;color:#2563eb}.material-open i{margin:0 0 0 4px;font-size:9px}.back-to-materials{padding:14px 24px;border-bottom:1px solid #e9eef5}.back-to-materials button{font-size:12px;color:#2563eb;padding:4px 0}.is-embedded .knowledge-columns{min-height:400px}.is-embedded .source-preview{margin:0;border:0;border-radius:0;min-height:400px}.is-embedded .note-form{overflow-y:visible;min-height:420px}.is-embedded :deep(.library-document){min-height:440px}.is-embedded :deep(.document-toolbar){padding:12px 24px}.is-embedded :deep(.document-paper){width:100%;border:0;border-radius:0;padding:24px}.is-embedded :deep(.document-scroll){max-height:65vh}
@media(max-width:1100px){.is-embedded .knowledge-header .header-actions{margin-left:0;flex-wrap:wrap}.is-embedded .knowledge-header,.preparation-content{padding-left:18px;padding-right:18px}.material-row time{display:none}.upload-hint{max-width:280px}}
.is-embedded.is-reading{display:flex;flex:1;height:100%;min-height:0;border:0;border-radius:0;box-shadow:none}.is-reading .knowledge-columns,.is-reading .source-preview{flex:1;min-height:0}.is-reading :deep(.library-document){min-height:0;flex:1}.is-reading :deep(.document-scroll){max-height:none;flex:1}.is-reading .back-to-materials{display:flex;justify-content:space-between;gap:12px;padding:10px 20px;flex-shrink:0}.inline-excerpt{margin:0 14px 4px;padding:10px 12px;border:1px solid #dbe6fa;border-radius:10px;background:#f5f8ff;font-size:12px}.inline-excerpt button{float:right}.inline-excerpt p{margin-top:6px;max-height:72px;overflow:auto;white-space:pre-wrap;color:#64748b}
</style>
