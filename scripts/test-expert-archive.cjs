// 专家成果归档兜底：回复里提到的文件 / 本轮新生成的文档要复制进项目 deliverables，其他不动。
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { archiveFiles, mentionedFilePaths } = require('../src/main/expert-archive');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fde-archive-'));
const session = path.join(tmp, 'app-white-1');
const project = path.join(tmp, 'proj-a');
const elsewhere = path.join(tmp, 'Desktop');
const skills = path.join(tmp, 'skills', 'product-whitepaper', 'templates');
for (const d of [session, path.join(session, 'out'), path.join(project, 'stage2'), path.join(project, 'deliverables', 'whitepaper-writer'), elsewhere, skills]) fs.mkdirSync(d, { recursive: true });
const write = (p, s = 'x') => { fs.writeFileSync(p, s); return p; };

const since = Date.now() - 1000;
const old = write(path.join(session, '旧稿.docx'), 'old');
fs.utimesSync(old, new Date(since - 3600e3), new Date(since - 3600e3));
write(path.join(session, 'out', '产品白皮书-20261113.docx'), 'docx-1');       // 本轮新生成，没在回复里提
write(path.join(session, 'draft.json'), '{}');                                // 中间稿，不搬
const desk = write(path.join(elsewhere, '宣传视频.mp4'), 'video');              // 回复里提到的外部文件
const tpl = write(path.join(skills, 'template.docx'), 'tpl');                   // 技能模板，不搬
const stage = write(path.join(project, 'stage2', '需求.md'), 'req');            // 项目自身文件，不搬
const already = write(path.join(project, 'deliverables', 'whitepaper-writer', '已归档.docx'), 'ok');

const reply = `已完成：\n- 视频：\`${desk}\`\n- 模板参考 ${tpl}\n- 需求见 ${stage}\n- 成果 [已归档](${already})\n- 不存在 \`/nope/a.docx\``;
const opts = { replyText: reply, sessionDir: session, projectRoot: project, outSubdir: 'deliverables/whitepaper-writer', sinceMs: since };
const got = archiveFiles(opts).sort();
assert.deepStrictEqual(got, ['deliverables/whitepaper-writer/产品白皮书-20261113.docx', 'deliverables/whitepaper-writer/宣传视频.mp4']);
assert.ok(fs.existsSync(desk), '原文件保留（复制而不是移动）');
// 再跑一次：同一份不重复归档
assert.deepStrictEqual(archiveFiles(opts), []);
// 同名不同内容：加序号
write(desk, 'video-v2-longer');
assert.deepStrictEqual(archiveFiles(opts), ['deliverables/whitepaper-writer/宣传视频-2.mp4']);
// 路径解析：中文标点结尾、file:// 链接、相对路径
const paths = mentionedFilePaths('保存在 /a/b/白皮书.docx。另见 [x](file:///c/d.pptx) 和 `out/e.pdf`', '/s');
assert.deepStrictEqual(paths.sort(), ['/a/b/白皮书.docx', '/c/d.pptx', '/s/out/e.pdf']);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('✓ expert archive: 4 checks passed');
