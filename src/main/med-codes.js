// 从 DRG/DIP 3.0 分组方案正文里解析结构化编码表，供「按编码精确查询」使用。
// 输入是 extractFileText 抽出的带「## 第 N 页」标记的纯文本，输出编码 → 所属组的映射。
// 只做「确定的、可核对」的解析：查不到就返回空，不猜。
'use strict';

const PAGE = /^##\s+第\s*(\d+)\s*页\s*$/;
// ICD-10 诊断（如 S52.200x011、A34.x00、E11.3，含星剑号 E10.201+N08.3*）与 ICD-9-CM-3 手术操作（如 33.6x00、37.5100x001）
const DIAG = /^([A-Z]\d{2}(?:\.[0-9x]{1,4}(?:x\d{3})?)?(?:\+[A-Z]\d{2}(?:\.[0-9x]{1,4})?\*)?)\s+(.+)$/;
const PROC = /^(\d{2}\.[0-9x]{1,4}(?:x\d{3})?)\s+(.+)$/;

function lines(text) {
  const out = []; let page = null;
  for (const raw of String(text).split('\n')) {
    const m = raw.match(PAGE); if (m) { page = Number(m[1]); continue; }
    const line = raw.trim(); if (line && !/^\d{1,4}$/.test(line)) out.push({ line, page });
  }
  return out;
}

// 1) DRG 细分组目录（「DRG DRG 名称」表，如 BX13 认知功能障碍，伴合并症或并发症）
// 2) ADRG 列表（第四章）：每个 ADRG 下列出「包含以下主要诊断/主要手术或操作」，记录编码 → ADRG
function parseDrg(text) {
  const rows = lines(text);
  const drgs = new Map(), adrgs = new Map(), codes = new Map(), catalog = new Map();
  const start = rows.findIndex((r) => r.line === '四、核心病组（ ADRG ）列表');
  const end = rows.findIndex((r, i) => i > start && r.line.startsWith('五、不作为分组规则'));
  rows.forEach((r, i) => {
    if (start > 0 && i >= start) return;
    const m = r.line.match(/^([A-Z]{2}\d[0-9A-Z])\s+(\S.{1,60})$/);
    if (m && !/……/.test(m[2])) drgs.set(m[1], { code: m[1], name: m[2].replace(/\s+/g, ''), page: r.page });
    // 第二章 ADRG 目录是核心病组的权威名单（第四章组名里有「、」，不能靠格式猜）
    const a = r.line.match(/^([A-Z]{2}\d)\s+(\S.{1,60})$/);
    if (a && !/……/.test(a[2]) && !catalog.has(a[1])) catalog.set(a[1], a[2].replace(/\s+/g, ''));
  });
  let current = null, kind = '', role = '', pendingName = false;
  for (let i = start + 1; i > 0 && i < end; i++) {
    const { line, page } = rows[i];
    if (/^MDC[A-Z]/.test(line)) { current = null; continue; }
    // 组头偶尔被 PDF 排成「TT 3 人格障碍」
    const head = line.match(/^([A-Z]{2}) ?(\d)\s+(\S.*)$/);
    const headCode = head && head[1] + head[2];
    if (head && catalog.has(headCode) && !adrgs.has(headCode) && !DIAG.test(line)) {
      current = { code: headCode, name: catalog.get(headCode), page, diagnoses: 0, procedures: 0 };
      adrgs.set(current.code, current); kind = ''; pendingName = true; continue;
    }
    if (!current) continue;
    // 组内编码表的表头：「包含以下主要诊断：」「主要诊断 1 ：」「其他诊断 2 ：」「全部手术或操作 4 ：」
    // 「包含以下主要诊断或其他诊断：」「包含以下主要手术或操作且全部手术或操作中有两个及以上：」等
    const label = line.match(/^(?:包含以下)?(主要诊断或其他诊断|主要诊断|其他诊断|主要手术或操作|全部手术或操作|手术或操作)/);
    if (label && (/[：:]\s*$/.test(line) || /^包含以下/.test(line))) {
      kind = /诊断/.test(label[1]) ? 'diagnosis' : 'procedure'; role = label[1]; pendingName = false; continue;
    }
    if (kind && !DIAG.test(line) && !PROC.test(line) && /[：:]\s*$/.test(line)) continue; // 表头换行的后半句
    if (/^(?:或)?入组条件|^符合/.test(line)) { kind = ''; pendingName = false; continue; }
    // ADRG 名称换行（如「非同胞全相合异基因造血干细胞移\n植」）：名称取自目录，这里只跳过续行
    if (pendingName && !DIAG.test(line) && !PROC.test(line) && line.length < 12 && current.name.endsWith(line.replace(/\s+/g, ''))) continue;
    pendingName = false;
    const d = kind === 'diagnosis' && line.match(DIAG);
    const p = kind === 'procedure' && line.match(PROC);
    const hit = d || p; if (!hit) continue;
    const entry = { adrg: current.code, role, page };
    const key = hit[1];
    if (!codes.has(key)) codes.set(key, { code: key, name: hit[2].replace(/\s+/g, ''), groups: [] });
    const item = codes.get(key);
    if (!item.groups.some((g) => g.adrg === entry.adrg && g.role === entry.role)) item.groups.push(entry);
    current[d ? 'diagnoses' : 'procedures']++;
  }
  // 目录里有、但第四章没有组内编码表的 ADRG（如 TT2 睡眠障碍）也保留，标明无明细
  for (const [code, name] of catalog) if (!adrgs.has(code)) adrgs.set(code, { code, name, page: null, diagnoses: 0, procedures: 0 });
  return { drgs: [...drgs.values()], adrgs: [...adrgs.values()], codes: [...codes.values()] };
}

// DIP 核心病种：每行「分类 序号 主要诊断编码 主要诊断名称 [主要手术操作编码 名称 …]」，长行会被 PDF 拆成多行。
function parseDip(text) {
  const rows = lines(text);
  const entries = []; let cur = null;
  const flush = () => { if (cur) entries.push(cur); cur = null; };
  for (const { line, page } of rows) {
    const m = line.match(/^(XQ|BX|ZD|[A-Z]{2})\s+(\d{1,5})\s+(.+)$/);
    if (m && !/^(分类|序号)/.test(line)) { flush(); cur = { category: m[1], no: Number(m[2]), page, raw: m[3] }; continue; }
    if (/^(分类 序号|[一二三四五六七八九十]+、|（[一二三四五六七八九十]+）)/.test(line)) { flush(); continue; }
    if (cur) cur.raw += (/[|＋+]$/.test(cur.raw) || /^[|0-9.]/.test(line) ? '' : ' ') + line;
  }
  flush();
  const diseases = entries.map((e) => {
    const raw = e.raw.replace(/\s+/g, ' ');
    const diag = raw.match(/^([A-Z]\d{2}(?:\.[0-9x]{1,4}(?:x\d{3})?)?)\s+(.+?)(?=\s*\d{2}\.[0-9x]|$)/);
    const procCodes = (raw.match(/\d{2}\.[0-9x]{2,4}(?:x\d{3})?/g) || []);
    return { category: e.category, no: e.no, page: e.page, diagnosis: diag ? diag[1] : '', diagnosisName: diag ? diag[2].replace(/\s+/g, '') : '',
      procedures: [...new Set(procCodes)].slice(0, 40), text: raw.slice(0, 600) };
  }).filter((d) => d.diagnosis || /所有诊断/.test(d.text));
  return { diseases };
}

// 全国医疗服务项目技术规范（2023年版）：项目表每行 17 列，PDF 抽出来后同一项目的名称、英文名、内涵、耗材、人力、分类交错成多行。
// 这里按「8 位项目编码」切开，每个项目拼成一条记录：编码 ｜ 中文名 ｜ 其余中文内容（去掉英文名和表头）。
// 返回 items（供编码/名称精确查）和改写后的正文（项目表页换成一行一条记录，其余页原样，页码标记保留）。
const SERVICE = /^([ABCEFHKLMNP][A-Z][A-Z0-9]{6})(?:\s+(\S.*))?$/;
function parseServiceItems(text) {
  const items = []; const out = []; let cur = null, inHeader = false, english = false;
  const done = () => { if (cur) { cur.text = cur.body.join('').replace(/\s+/g, ' ').trim(); out.push(`项目编码 ${cur.code} ｜ 项目名称 ${cur.name} ｜ ${cur.text}`); delete cur.body; items.push(cur); } cur = null; };
  let page = null, inTable = false;
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    const pm = line.match(PAGE);
    if (pm) { page = Number(pm[1]); out.push(raw); continue; }
    // 表头：从「项目编码 项目名称」到「分类」（主表）或带「计量单位」的单行表头（辅助操作章）
    // 只在项目表页里解析；附表（耗材分类 AB070101、修饰符）的编码长得一样，但不是服务项目
    if (/^项目编码 项目名称/.test(line)) { inTable = true; inHeader = !/计量单位/.test(line); continue; }
    if (/^附件 ?\d+[：:]$/.test(line)) { done(); inTable = false; } // 只认附件标题「附件 1：」，正文里「附件，清理腹腔」不算
    if (!inTable) { out.push(raw); continue; }
    if (inHeader) { if (/^分类$/.test(line)) inHeader = false; continue; }
    const m = line.match(SERVICE);
    if (m && /\d/.test(m[1])) {
      // 同一行后面可能直接跟英文名（辅助操作章）：「NAAA0001 神经内镜辅助操作 Neuroendoscopic assisted」
      // 少数行编码单独成行，名称在前后行（「经皮穿刺腰⏎交感神经节/⏎HCW7N106⏎链射频镇痛」），前半截已误记进上一个项目
      const rest = (m[2] || '').trim();
      // 同一行里多列之间是 3 个空格（clean 后为 1 个），名称取第一列；英文名在同行时去掉
      // 中文名后第一个空格之后若不再有中文，就是英文名列（「F波测定 F wave assay」「总IgE测定 total IgE」）；「IgG ABO血型」后面还有中文，保留
      const cols = rest.split(' ');
      let keep = cols.length;
      while (keep > 1 && !/[一-鿿]/.test(cols.slice(keep - 1).join(' '))) keep--;
      const hasCjk = /[一-鿿]/.test(cols[0]);
      // 同行还带了项目内涵（「擦浴降温 Bath Cooling 指酒精…」）：名称只取到第一个西文列之前
      const firstLatin = cols.findIndex((c, k) => k > 0 && hasCjk && /^[A-Za-z]/.test(c) && !/[一-鿿]/.test(c));
      const name = (firstLatin > 0 ? cols.slice(0, firstLatin) : cols.slice(0, keep)).join(' ').trim();
      let lead = '';
      if (!rest && cur) {
        const tail = [];
        while (cur.body.length > 1 && /^ ?[一-鿿][^。；：:]{0,12}$/.test(cur.body[cur.body.length - 1]) && !/费 ?$/.test(cur.body[cur.body.length - 1])) tail.unshift(cur.body.pop().trim());
        // 只有前面确实是上一项的结尾（「…费」）才认为这些短行是新项目名称的前半截，否则原样放回
        if (tail.length && /费 ?$/.test(cur.body[cur.body.length - 1] || '')) lead = tail.join(''); else cur.body.push(...tail.map((t) => t));
      }
      // 同一行里名称之后的部分：去掉英文名列（不含中文的列），剩下的中文（项目内涵等）进正文
      const after = (firstLatin > 0 ? cols.slice(firstLatin) : cols.slice(keep)).filter((c) => /[一-鿿]/.test(c)).join(' ');
      done();
      cur = { code: m[1], name: lead + name, page, body: after ? [after.replace(/^[A-Za-z][A-Za-z\s-]*(?=[一-鿿])/, '')] : [] }; english = !!rest && name !== rest; continue;
    }
    if (!cur) { out.push(raw); continue; }
    if (!line || /^\d{1,4}$/.test(line)) continue;
    const cjk = /[一-鿿]/.test(line);
    // 名称换行：英文名出现之前的中文短行（个别项目名称前半截被 PDF 排丢，如 HXW6U301 只剩「除术」，无法还原）
    // 也包括夹着西文的续行（「B12(VitB12)」「PNMA2(Ma/Ta」「)抗体测定」）：英文名是多词小写，续行不是
    // 英文名续行一般是小写单词；名称续行要么含中文，要么是大写缩写/编号（B12、PNMA2、AmPhiphsin 这类首字母大写且含大写或数字的专名）
    // 名称续行要么含中文，要么是不以连字符结尾、首个大写后紧跟大写/数字/括号的缩写（B12(VitB12)、PNMA2(Ma/Ta、AmPhiphsin）；
    // 英文名开头是「Glucose-6-」「Heart-Type」「HER-2/neu」这类带连字符的普通词
    // 已经是中文名称结尾（「…测定」「…法」）时，后面的西文行就是英文名，不再拼进名称
    // 括号没配对时（「(Sphygmocor」「(SCL-」「(Damus–」）下一行一定还是名称
    const open = (cur.name.match(/[(（]/g) || []).length > (cur.name.match(/[)）]/g) || []).length;
    const nameDone = /[一-鿿)）]$/.test(cur.name) && /^[A-Z]/.test(line) && !/^[A-Z\d]+\(/.test(line);
    const nameTail = cjk || open || /^[)）]/.test(line) || (!nameDone && !/[\s-]/.test(line) && /^[A-Z(][A-Za-z]*[A-Z\d(/)]/.test(line)) || (/^[一-鿿]$/.test(cur.name) && /^[A-Za-z][A-Za-z\d]*$/.test(line));
    if (!english && nameTail && !cur.body.length && line.length <= 16 && !/[，。；]/.test(line)) { cur.name += (/[A-Za-z]$/.test(cur.name) && /^[A-Za-z]/.test(line) ? ' ' : '') + line; continue; }
    if (!cjk) { if (/[A-Za-z]/.test(line) && !/\d{2,}/.test(line)) { english = true; continue; } }
    english = true;
    // 分类码行（A / AA / AAAA-AAAD）和章节标题（「（三）引导类辅助操作」）不属于上一个项目；「3.治疗类：」是病案首页费用分类列，保留
    if (/^[A-Z]{1,4}(?:-[A-Z]{1,4})?$/.test(line)) continue;
    if (/^[A-Z] [一二三四五六七八九十]+、/.test(line) || /^本章说明/.test(line)) { done(); out.push(raw); continue; }
    if (/^（[一二三四五六七八九十]+）\S{1,20}$|^[一二三四五六七八九十]+、\S{1,20}$/.test(line)) { done(); out.push(raw); continue; }
    cur.body.push((cur.body.length && /[一-鿿，。、）]$/.test(cur.body[cur.body.length - 1]) && /^[一-鿿，。、（]/.test(line) ? '' : ' ') + line);
  }
  done();
  // PDF 把少数项目整行重复印在下一页开头（HLB6L303），按编码去重，保留第一次出现
  const seen = new Set();
  return { items: items.filter((i) => !seen.has(i.code) && seen.add(i.code)), text: out.join('\n') };
}

module.exports = { parseDrg, parseDip, parseServiceItems, DIAG, PROC };
