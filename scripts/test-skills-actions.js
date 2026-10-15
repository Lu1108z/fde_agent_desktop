const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const JSZip = require('jszip');

// Exercise the application's actual skill handlers against disposable disk data.
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fde-skills-actions-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const skillsDir = path.join(root, 'skills');
  fs.mkdirSync(skillsDir);
  const handlers = new Map();
  const opened = [];
  const source = fs.readFileSync(path.join(__dirname, '../src/main/index.js'), 'utf8');
  const library = source.slice(source.indexOf('function resolveSkillPath('), source.indexOf('// 供 handbook:upload'));
  const installer = source.slice(source.indexOf('async function installSkillFromZipBuffer('), source.indexOf('// 下载文件到内存 buffer'));
  const context = vm.createContext({
    fs, path, require, console, SKILLS_DIR: skillsDir, SKILLS_GROUPS_FILE: path.join(skillsDir, 'groups.json'),
    app: { isPackaged: false, getAppPath: () => root }, mainWindow: null,
    shell: { openPath: async value => { opened.push(value); return ''; } },
    dialog: { showMessageBox: async () => ({ response: 0 }) },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
  });
  vm.runInContext(library + '\n' + installer, context);
  const invoke = (name, payload) => handlers.get(`skills:${name}`)(null, structuredClone(payload));
  return { root, skillsDir, context, opened, invoke, install: context.installSkillFromZipBuffer };
}
async function zipFor(content, files = {}) {
  const zip = new JSZip();
  zip.file('demo-skill/SKILL.md', content);
  for (const [name, body] of Object.entries(files)) zip.file(`demo-skill/${name}`, body);
  return zip.generateAsync({ type: 'nodebuffer' });
}
const content = '---\nname: 演示技能\ndescription: 真实技能说明\n---\n# 工作流程\n读取输入资料，再生成结果。\n';

test('new empty group appears, persists across rescans, rejects duplicates and supports updating', async t => {
  const f = fixture(t);
  const created = await f.invoke('create-group', { name: '客户交付', icon: 'folder', color: '#2465ea' });
  assert.equal(created.success, true);
  assert.equal((await f.invoke('get-manifest')).data.groups.find(g => g.id === created.group.id).count, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.skillsDir, 'groups.json')))[0].name, '客户交付');
  assert.equal((await f.invoke('create-group', { name: '客户交付' })).success, false);
  assert.equal((await f.invoke('create-group', { name: ' ' })).success, false);
  await f.invoke('update-group', { id: created.group.id, name: '客户交付资料' });
  assert.equal((await f.invoke('get-manifest')).data.groups.find(g => g.id === created.group.id).name, '客户交付资料');
});

test('import creates real entry/assets, moves to a custom group, edits and rereads saved body', async t => {
  const f = fixture(t);
  const installed = await f.install(await zipFor(content, { 'references/example.txt': '真实附件' }));
  assert.equal(installed.success, true);
  assert.equal(fs.readFileSync(path.join(f.skillsDir, installed.skillId, 'references/example.txt'), 'utf8'), '真实附件');
  const created = await f.invoke('create-group', { name: '客户交付' });
  const saved = await f.invoke('write', { skill: installed.skillId, name: '已编辑技能', category: created.group.id, body: '# 已保存\n只根据真实材料工作。' });
  assert.equal(saved.success, true);
  const manifest = (await f.invoke('get-manifest')).data;
  assert.equal(manifest.skills[0].group, created.group.id);
  assert.equal(manifest.skills[0].categoryExplicit, true);
  assert.equal(manifest.groups.find(g => g.id === created.group.id).count, 1);
  assert.match((await f.invoke('read', { skill: installed.skillId })).content, /只根据真实材料工作/);
  const beforeDelete = fs.readFileSync(path.join(f.skillsDir, installed.skillId, 'SKILL.md'), 'utf8');
  assert.equal((await f.invoke('delete-group', { id: created.group.id })).success, true);
  assert.equal((await f.invoke('get-manifest')).data.skills[0].group, 'general');
  assert.equal(fs.readFileSync(path.join(f.skillsDir, installed.skillId, 'SKILL.md'), 'utf8'), beforeDelete);
  await f.invoke('create-group', { id: created.group.id, name: '客户交付' });
  assert.equal((await f.invoke('get-manifest')).data.skills[0].group, created.group.id);
  await f.invoke('open', { skill: installed.skillId });
  assert.equal(f.opened[0], path.join(f.skillsDir, installed.skillId));
  await f.invoke('delete', { skill: installed.skillId });
  assert.equal(fs.existsSync(path.join(f.skillsDir, installed.skillId)), false);
  assert.equal((await f.invoke('delete-group', { id: created.group.id })).success, true);
});

test('invalid packages and invalid edits never destroy an existing skill', async t => {
  const f = fixture(t);
  await f.install(await zipFor(content));
  const before = fs.readFileSync(path.join(f.skillsDir, 'demo-skill/SKILL.md'), 'utf8');
  assert.equal((await f.install(await zipFor('---\nname: ""\n---\n'))).success, false);
  assert.equal((await f.invoke('write', { skill: 'demo-skill', body: '' })).success, false);
  assert.equal((await f.invoke('write', { skill: 'demo-skill', category: 'missing' })).success, false);
  assert.equal(fs.readFileSync(path.join(f.skillsDir, 'demo-skill/SKILL.md'), 'utf8'), before);
  assert.equal((await f.invoke('read', { skill: '..', file: 'private.txt' })).success, false);
  assert.equal((await f.invoke('open', { skill: '../outside' })).success, false);
});

test('failed disk commit restores the previous skill and cleans staging directories', async t => {
  const f = fixture(t);
  await f.install(await zipFor(content));
  const before = fs.readFileSync(path.join(f.skillsDir, 'demo-skill/SKILL.md'), 'utf8');
  const write = fs.writeFileSync;
  f.context.fs = { ...fs, writeFileSync(file, ...args) {
    if (file === path.join(f.skillsDir, 'manifest.json')) throw new Error('simulated disk failure');
    return write(file, ...args);
  } };
  await assert.rejects(f.install(await zipFor(content.replace('真实技能说明', '覆盖测试'))), /disk failure/);
  assert.equal(fs.readFileSync(path.join(f.skillsDir, 'demo-skill/SKILL.md'), 'utf8'), before);
  assert.equal(fs.readdirSync(f.skillsDir).some(name => name.startsWith('.skill-install-')), false);
});

test('lowercase entry is normalized and bundled imports keep an edit marker after overwrite', async t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, 'skills/demo-skill'));
  const zip = new JSZip(); zip.file('demo-skill/skill.md', content);
  await f.install(await zip.generateAsync({ type: 'nodebuffer' }));
  assert.equal(fs.existsSync(path.join(f.skillsDir, 'demo-skill/SKILL.md')), true);
  assert.equal(fs.existsSync(path.join(f.skillsDir, 'demo-skill/.edited')), true);
});

test('frontend creation sends cloneable IPC data and includes custom groups in editing choices', async t => {
  const f = fixture(t);
  const vue = require('vue');
  let script = fs.readFileSync(path.join(__dirname, '../src/renderer/pages/skills/Skills.vue'), 'utf8').split('<script setup>')[1].split('</script>')[0];
  script = script.replace(/^import .*;\r?\n/gm, '');
  const context = vm.createContext({
    ...vue, console, setTimeout: () => 0, clearTimeout() {},
    onMounted() {}, onUnmounted() {},
    useAccentColor: () => ({ accent: value => value }), useDrawerResize: () => ({ width: vue.ref(400) }), useRouter: () => ({ push() {} }),
    skillPresentation: skill => skill, skillDestination: () => '/chat', marked: { parse: value => value },
    window: { api: { skills: {
      createGroup: payload => f.invoke('create-group', payload), deleteGroup: id => f.invoke('delete-group', { id }),
      getManifest: () => f.invoke('get-manifest'), read: (skill, file) => f.invoke('read', {skill, file}), write: payload => f.invoke('write', payload),
    } } },
  });
  vm.runInContext(script + '\nglobalThis.controls = { openCreateGroup,createGroup,newGroup,groups,skillGroupOptions,creatingGroup,groupError,active,loadManifest,skills,selected,openSkill,startEdit,saveEdit,form,rendered,saving,requestDeleteGroup,confirmDeleteGroup,undoDeleteGroup,lastDeletedGroup,deleteGroupTarget,openGroupContextMenu,groupContextMenu };', context);
  const c = context.controls;
  c.openCreateGroup(); c.newGroup.value.name = '前端分组';
  await c.createGroup();
  assert.equal(c.groupError.value, '');
  assert.equal(c.creatingGroup.value, false);
  assert.equal(c.groups.value.find(g => g.id === c.active.value).name, '前端分组');
  assert.equal(c.skillGroupOptions.value.some(g => g.name === '前端分组'), true);
  await c.loadManifest();
  assert.equal(c.groups.value.some(g => g.name === '前端分组'), true);
  await f.install(await zipFor(content));
  await c.loadManifest();
  await c.openSkill(c.skills.value.find(skill => skill.id === 'demo-skill'));
  await c.startEdit();
  c.form.value.body = '# 已编辑正文\nFDE_EDIT_BODY_OK';
  await c.saveEdit();
  assert.match(c.rendered.value, /FDE_EDIT_BODY_OK/);
  assert.equal(c.saving.value, false);
  const group = c.groups.value.find(g => g.name === '前端分组');
  c.openGroupContextMenu({ clientX: 100, clientY: 180 }, group);
  assert.equal(c.groupContextMenu.value.group.id, group.id);
  c.requestDeleteGroup(group);
  assert.equal(c.groupContextMenu.value, null);
  assert.equal(c.deleteGroupTarget.value.id, group.id);
  await c.confirmDeleteGroup();
  assert.equal(c.groups.value.some(g => g.id === group.id), false);
  assert.equal(c.lastDeletedGroup.value.id, group.id);
  await c.undoDeleteGroup();
  assert.equal(c.groups.value.some(g => g.id === group.id), true);
  assert.equal(c.lastDeletedGroup.value, null);
});


test('immediate use loads the complete saved skill into a real session directory', async t => {
  const f = fixture(t);
  await f.install(await zipFor(content));
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/pages/projects/AgentHome.vue'), 'utf8').split('<script setup>')[1].split('</script>')[0];
  const ast = require('@babel/parser').parse(source, { sourceType: 'module' });
  const launch = ast.program.body.find(node => node.type === 'FunctionDeclaration' && ['startSkillSession', 'consumeSkillRoute'].includes(node.id.name));
  assert.ok(launch, 'A real skill session launcher must exist');
  const vue = require('vue');
  let prompt = '';
  const context = vm.createContext({
    console, Date, skillRouteReady: true, skillRouteBusy: false,
    route: { query: { skill: 'demo-skill' } }, router: { replace: async () => {} }, props: { coachMode: false },
    isStreaming: vue.ref(false), isToolRunning: vue.ref(false), currentSlug: vue.ref(''), currentMeta: vue.ref({}), currentProjectName: vue.ref(''), messages: vue.ref([]), skillLaunchNotice: vue.ref(''), chatPanelRef: vue.ref(null),
    startNewChat() {}, startElapsed() {}, stopElapsed() {}, loadProjects: async () => {}, nextTick: async () => {}, finalizeLastAssistantMessage() {}, finishResponse() { context.isStreaming.value = false; }, createMessage: (role, content, extra) => ({ role, content, ...extra }),
    skillPresentation: skill => ({ name: skill.name }), skillOpeningPrompt: (skill, body) => body,
    window: { api: { skills: {
      getManifest: () => f.invoke('get-manifest'), read: (skill, file) => f.invoke('read', { skill, file }), scanLocal: async () => ({ basePath: f.skillsDir }),
    }, hermes: {
      createProject: async ({ slug, name }) => { fs.mkdirSync(path.join(f.root, slug)); return { slug, name }; },
      writeFile: async (slug, file, body) => { fs.writeFileSync(path.join(f.root, slug, file), body); return { success: true }; },
      updateProjectMeta: async (slug, meta) => { fs.writeFileSync(path.join(f.root, slug, 'meta.json'), JSON.stringify(meta)); return { success: true }; },
      saveMessage: async () => ({ success: true }), prompt: async (slug, body) => { prompt = body; },
    } } },
  });
  vm.runInContext(source.slice(launch.start, launch.end), context);
  await context[launch.id.name]('demo-skill');
  assert.match(prompt, /读取输入资料，再生成结果/);
  assert.equal(context.currentMeta.value.activeSkill.id, 'demo-skill');
  assert.match(fs.readFileSync(path.join(f.root, context.currentSlug.value, 'CLAUDE.md'), 'utf8'), /真实技能说明/);
  assert.equal(context.isStreaming.value, false);
});


test('group deletion rejects builtins and missing groups and keeps data on disk failure', async t => {
  const f = fixture(t);
  const created = await f.invoke('create-group', { name: '保留分组' });
  assert.equal((await f.invoke('delete-group', { id: 'product-doc' })).success, false);
  assert.equal((await f.invoke('delete-group', { id: 'missing-group' })).success, false);
  f.context.fs = { ...fs, renameSync() { throw new Error('disk unavailable'); } };
  assert.equal((await f.invoke('delete-group', { id: created.group.id })).success, false);
  assert.equal((await f.invoke('get-manifest')).data.groups.some(g => g.id === created.group.id), true);
});
