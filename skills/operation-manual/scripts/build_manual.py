"""Build editable DOCX and paginated PDF from a single JSON source."""
import argparse
import copy
from datetime import date
import html
import json
import os
from pathlib import Path
import re
import shutil

from PIL import Image
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor
from playwright.sync_api import sync_playwright

SKILL = Path(__file__).resolve().parents[1]
SIZES = {'Letter': (612, 792), 'A4': (595.276, 841.89)}


def chinese(n):
    digits = '零一二三四五六七八九'
    if n < 10:
        return digits[n]
    if n < 100:
        return (digits[n // 10] if n >= 20 else '') + '十' + (digits[n % 10] if n % 10 else '')
    return str(n)


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for v in value:
            yield from strings(v)
    elif isinstance(value, dict):
        for k, v in value.items():
            if k not in ('forbidden_terms', 'path'):
                yield from strings(v)


def load_spec(path):
    path = Path(path).resolve()
    spec = copy.deepcopy(json.loads(path.read_text(encoding='utf-8')))
    for field in ('title', 'product'):
        if not isinstance(spec.get(field), str) or not spec[field].strip():
            raise ValueError(f'{field} must be a nonempty string')
    spec.setdefault('version', 'V1.0')
    spec.setdefault('date', f'{date.today().year} 年 {date.today().month} 月')
    spec.setdefault('english_title', 'PRODUCT OPERATION MANUAL')
    spec.setdefault('subtitle', '面向业务用户与管理人员的功能操作指南')
    spec.setdefault('page_size', 'Letter')
    spec.setdefault('filename', f'{spec["title"]}_通用版_{spec["version"]}')
    if spec['page_size'] not in SIZES:
        raise ValueError('page_size must be Letter or A4')
    if re.search(r'[\\/:*?"<>|\x00-\x1f]', spec['filename']) or spec['filename'] in ('', '.', '..'):
        raise ValueError('filename must be a safe filename without extension or directories')
    if not spec.get('pages'):
        raise ValueError('pages must not be empty')
    corpus = '\n'.join(strings(spec))
    for term in spec.get('forbidden_terms', []):
        if term and term in corpus:
            raise ValueError(f'Forbidden term in source: {term}')
    chapter = 0
    counts = {}
    titles = {}
    for page in spec['pages']:
        current = page['chapter']
        if not isinstance(current, int) or current < 1 or current not in (chapter, chapter + 1):
            raise ValueError('Chapters must start at 1 and increase continuously')
        if not page.get('title') or not page.get('blocks'):
            raise ValueError('Each page needs a title and blocks')
        if current in titles and titles[current] != page['title']:
            raise ValueError('Use the same title on continued pages of a chapter')
        titles[current] = page['title']
        page['heading'] = chinese(current) + '、' + page['title'] + ('（续）' if page.get('continued') else '')
        chapter = current
        counts.setdefault(chapter, 0)
        for block in page['blocks']:
            kind = block['type']
            if kind in ('text', 'sub', 'note'):
                if not isinstance(block.get('text'), str):
                    raise ValueError(f'{kind} requires text')
            elif kind in ('steps', 'bullets'):
                if not block.get('items') or not all(isinstance(x, str) for x in block['items']):
                    raise ValueError(f'{kind} requires nonempty text items')
            elif kind == 'table':
                n = len(block['headers'])
                if not n or any(len(row) != n for row in block['rows']):
                    raise ValueError('Table rows must match header width')
                ws = block.setdefault('widths', [1 / n] * n)
                if len(ws) != n or any(w <= 0 for w in ws) or abs(sum(ws) - 1) > 0.001:
                    raise ValueError('Table widths must be positive and sum to 1')
            elif kind == 'images':
                if not 1 <= len(block['items']) <= 2:
                    raise ValueError('Use one or two images per block')
                if not 30 <= block.get('height_pt', 230) <= 600:
                    raise ValueError('Image height_pt must be between 30 and 600')
                for item in block['items']:
                    image = (path.parent / item['path']).resolve()
                    if not image.is_file():
                        raise FileNotFoundError(image)
                    with Image.open(image) as im:
                        item['pixels'] = list(im.size)
                    item['resolved_path'] = str(image)
                    counts[chapter] += 1
                    item['figure_caption'] = f'图{chapter}-{counts[chapter]} {item["caption"]}'
            else:
                raise ValueError(f'Unknown block: {kind}')
    return spec


def image_dimensions(block, item, content_width):
    max_width = (content_width - 15 * (len(block['items']) - 1)) / len(block['items']) - 6
    pxw, pxh = item['pixels']
    factor = min(max_width / pxw, block.get('height_pt', 230) / pxh)
    return pxw * factor, pxh * factor


def esc(value):
    return html.escape(str(value))


def table_html(headers, rows, widths):
    cols = ''.join(f'<col style="width:{w * 100}%">' for w in widths)
    head = '<tr>' + ''.join(f'<th>{esc(c)}</th>' for c in headers) + '</tr>'
    body = ''.join('<tr>' + ''.join(f'<td>{esc(c)}</td>' for c in row) + '</tr>' for row in rows)
    return f'<table><colgroup>{cols}</colgroup>{head}{body}</table>'


def metadata(spec):
    return ['文档版本', '适用系统', '编制日期', '文档性质'], [[spec['version'], spec['product'], spec['date'], '用户操作手册']]


def render_html(spec):
    width, height = SIZES[spec['page_size']]
    css = (SKILL / 'templates/manual.css').read_text(encoding='utf-8')
    # Literal @page size is more portable across Chromium versions than CSS variables.
    css = css.replace('size: var(--page-width) var(--page-height)', f'size: {width}pt {height}pt')
    css += f':root{{--page-width:{width}pt;--page-height:{height}pt}}'
    headers, rows = metadata(spec)
    cover = (f'<section class="page cover"><div class="content"><div class="en">{esc(spec["english_title"])}</div>'
             f'<div class="cover-title">{esc(spec["title"])}</div><div class="subtitle">{esc(spec["subtitle"])}</div>'
             + table_html(headers, rows, [.25] * 4) + '</div></section>')
    pages = [cover]
    for i, page in enumerate(spec['pages'], 2):
        parts = [f'<h1>{esc(page["heading"])}</h1>']
        for block in page['blocks']:
            k = block['type']
            if k in ('text', 'sub'):
                tag = 'p' if k == 'text' else 'h2'
                parts.append(f'<{tag}>{esc(block["text"])}</{tag}>')
            elif k in ('steps', 'bullets'):
                tag = 'ol' if k == 'steps' else 'ul'
                parts.append(f'<{tag}>' + ''.join(f'<li>{esc(x)}</li>' for x in block['items']) + f'</{tag}>')
            elif k == 'note':
                parts.append(f'<div class="note"><strong>{esc(block.get("label", "提示"))}：</strong>{esc(block["text"])}</div>')
            elif k == 'table':
                parts.append(table_html(block['headers'], block['rows'], block['widths']))
            else:
                figures = []
                for item in block['items']:
                    w, h = image_dimensions(block, item, width - 124.8)
                    source = f'<br>{esc(item["source"])}' if item.get('source') else ''
                    figures.append(f'<figure><img src="{Path(item["resolved_path"]).as_uri()}" style="width:{w}pt;height:{h}pt">'
                                   f'<figcaption>{esc(item["figure_caption"])}{source}</figcaption></figure>')
                parts.append('<div class="figures">' + ''.join(figures) + '</div>')
        footer = f'<div class="footer"><span>{esc(spec["title"])} · {esc(spec["version"])}</span><span>{i}</span></div>'
        pages.append('<section class="page"><div class="content">' + ''.join(parts) + '</div>' + footer + '</section>')
    return '<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>' + esc(spec['title']) + '</title><style>' + css + '</style><body>' + ''.join(pages) + '</body></html>'


def set_run(run, size=10.45, bold=False, color='25314B'):
    run.font.name = 'Arial'
    run.font.size = Pt(size)
    run.bold = bold
    run.font.color.rgb = RGBColor.from_string(color)
    run._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'), 'PingFang SC')


def format_p(p, text, size=10.45, bold=False, color='25314B', after=7):
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.line_spacing = 1.45
    set_run(p.add_run(str(text)), size, bold, color)
    return p


def add_table(doc, headers, rows, widths, full_width):
    t = doc.add_table(rows=1, cols=len(headers))
    t.autofit = False
    for col, frac in zip(t.columns, widths):
        col.width = Pt(full_width * frac)
    for i, head in enumerate(headers):
        cell = t.rows[0].cells[i]
        shade = OxmlElement('w:shd'); shade.set(qn('w:fill'), 'EDF3FF')
        cell._tc.get_or_add_tcPr().append(shade)
        p = format_p(cell.paragraphs[0], head, 9.5, True, '2356D7')
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    repeat = OxmlElement('w:tblHeader'); t.rows[0]._tr.get_or_add_trPr().append(repeat)
    for row in rows:
        for cell, val in zip(t.add_row().cells, row):
            format_p(cell.paragraphs[0], val, 9.3)
    borders = OxmlElement('w:tblBorders')
    for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        e = OxmlElement('w:' + side)
        for k, v in [('val', 'single'), ('sz', '4'), ('color', 'BAC5D7')]: e.set(qn('w:' + k), v)
        borders.append(e)
    t._tbl.tblPr.append(borders)
    for row in t.rows:
        row._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
        for cell, frac in zip(row.cells, widths):
            cell.width = Pt(full_width * frac)
            for p in cell.paragraphs:
                p.paragraph_format.space_before = Pt(4)
                p.paragraph_format.space_after = Pt(4)
                p.paragraph_format.line_spacing = 1.3
    return t


def render_docx(spec, target):
    doc = Document(); sec = doc.sections[0]
    width, height = SIZES[spec['page_size']]
    sec.page_width = Pt(width); sec.page_height = Pt(height)
    sec.left_margin = sec.right_margin = Pt(62.4)
    sec.top_margin = Pt(60); sec.bottom_margin = Pt(40)
    sec.footer_distance = Pt(18)
    sec.different_first_page_header_footer = True
    full_width = width - 124.8
    def p(text, **kwargs): return format_p(doc.add_paragraph(), text, **kwargs)
    for text, size, after, color in [(spec['english_title'], 11, 30, '2863FF'), (spec['title'], 28, 60, '202B45'), (spec['subtitle'], 11, 36, '77839B')]:
        par = p(text, size=size, bold=size != 11 or color == '2863FF', color=color, after=after)
        par.alignment = WD_ALIGN_PARAGRAPH.CENTER
    doc.paragraphs[0].paragraph_format.space_before = Pt(42)
    add_table(doc, *metadata(spec), [.25] * 4, full_width)
    for page in spec['pages']:
        par = doc.add_paragraph(style='Heading 1')
        format_p(par, page['heading'], 18, True, '202B45', 18)
        par.paragraph_format.page_break_before = True
        par.paragraph_format.keep_with_next = True
        bd = OxmlElement('w:pBdr'); line = OxmlElement('w:bottom')
        for k, v in [('val','single'),('sz','12'),('color','3167FF'),('space','10')]: line.set(qn('w:'+k),v)
        bd.append(line); par._p.get_or_add_pPr().append(bd)
        for block in page['blocks']:
            k = block['type']
            if k == 'text': p(block['text'])
            elif k == 'sub':
                par = p(block['text'], size=11.8, bold=True, color='364154', after=6)
                par.paragraph_format.keep_with_next = True
                par.paragraph_format.space_before = Pt(7)
            elif k in ('steps','bullets'):
                for i, text in enumerate(block['items'], 1):
                    par = p((f'{i}. ' if k == 'steps' else '• ') + text, after=4)
                    par.paragraph_format.left_indent = Pt(14)
                    par.paragraph_format.first_line_indent = Pt(-14)
            elif k == 'note':
                par = p(block.get('label','提示')+'：'+block['text'], size=9.7)
                sh = OxmlElement('w:shd'); sh.set(qn('w:fill'),'EDF3FF'); par._p.get_or_add_pPr().append(sh)
                par.paragraph_format.left_indent = par.paragraph_format.right_indent = Pt(9)
            elif k == 'table': add_table(doc, block['headers'],block['rows'],block['widths'],full_width)
            else:
                t = doc.add_table(rows=1, cols=len(block['items'])); t.autofit = False
                for col in t.columns: col.width = Pt(full_width/len(block['items']))
                t.rows[0]._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
                for cell, item in zip(t.rows[0].cells,block['items']):
                    w,h = image_dimensions(block,item,full_width-8)
                    par = cell.paragraphs[0]; par.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    par.add_run().add_picture(item['resolved_path'],width=Pt(w),height=Pt(h))
                    par = format_p(cell.add_paragraph(),item['figure_caption'],8.7,color='64718A')
                    par.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    if item.get('source'):
                        par = format_p(cell.add_paragraph(),item['source'],8,color='64718A')
                        par.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer = sec.footer.paragraphs[0]
    format_p(footer,spec['title']+' · '+spec['version']+'    ',8,color='8892A4')
    field = OxmlElement('w:fldSimple'); field.set(qn('w:instr'),'PAGE'); footer._p.append(field)
    doc.core_properties.title = spec['title']
    doc.core_properties.subject = '通用版产品操作指南'
    doc.core_properties.author = ''
    doc.save(target)


def browser_path(explicit=None):
    if explicit:
        p = Path(explicit).expanduser()
        if not p.is_file(): raise FileNotFoundError(p)
        return str(p)
    candidates = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
    for base in ('PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA'):
        if os.environ.get(base):
            candidates += [str(Path(os.environ[base])/p) for p in ('Google/Chrome/Application/chrome.exe','Microsoft/Edge/Application/msedge.exe')]
    candidates += [shutil.which(n) for n in ('google-chrome','chromium','chromium-browser','msedge')]
    return next((p for p in candidates if p and Path(p).is_file()),None)


def build(spec, out, browser=None, overwrite=False):
    out = Path(out).resolve(); out.mkdir(parents=True, exist_ok=True)
    name = spec['filename']
    targets = [out/(name+ext) for ext in ('.pdf','.docx')]
    if not overwrite and any(p.exists() for p in targets):
        raise FileExistsError('Output exists. Inspect it before using --overwrite.')
    work = out/'.manual-build'/name; work.mkdir(parents=True,exist_ok=True)
    source = work/'manual.html'; source.write_text(render_html(spec),encoding='utf-8')
    with sync_playwright() as pw:
        executable = browser_path(browser)
        b = pw.chromium.launch(**({'executable_path':executable} if executable else {}),headless=True)
        try:
            page = b.new_page()
            page.goto(source.as_uri(),wait_until='load')
            page.evaluate('document.fonts.ready')
            broken = page.evaluate('()=>[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src)')
            if broken: raise ValueError(f'Images failed to load: {broken}')
            bounds = page.evaluate('''()=>[...document.querySelectorAll('.page')].map((p,i)=>{
              const box=p.getBoundingClientRect(), content=p.querySelector('.content');
              const footer=p.querySelector('.footer'); const limit=footer?footer.getBoundingClientRect().top-10:box.bottom-45*96/72;
              const rects=[...content.querySelectorAll('*'),content].map(e=>e.getBoundingClientRect());
              const bottom=Math.max(...rects.map(r=>r.bottom));
              return {page:i+1,bottom_pt:(bottom-box.top)*72/96,limit_pt:(limit-box.top)*72/96,
                overflow:bottom>limit+1||rects.some(r=>r.right>box.right-10||r.left<box.left-1)};
            })''')
            (work/'layout.json').write_text(json.dumps(bounds,ensure_ascii=False,indent=2),encoding='utf-8')
            bad = [row for row in bounds if row['overflow']]
            if bad: raise ValueError(f'Page overflow: {bad}. Split content into continued pages; nothing was clipped.')
            page.pdf(path=str(work/'manual.pdf'),print_background=True,prefer_css_page_size=True)
        finally: b.close()
    render_docx(spec,work/'manual.docx')
    for src,dest in zip((work/'manual.pdf',work/'manual.docx'),targets): shutil.copyfile(src,dest)
    print(json.dumps({'files':[str(p) for p in targets], 'pdf_pages_expected':len(spec['pages'])+1,'build_dir':str(work)},ensure_ascii=False,indent=2))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('spec',type=Path)
    parser.add_argument('--output-dir',type=Path,required=True)
    parser.add_argument('--browser')
    parser.add_argument('--overwrite',action='store_true')
    args=parser.parse_args()
    build(load_spec(args.spec),args.output_dir,args.browser,args.overwrite)


if __name__=='__main__': main()
