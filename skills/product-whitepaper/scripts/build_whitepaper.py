"""Create an editable product whitepaper from a JSON specification."""
import argparse
import json
from pathlib import Path
import re
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from PIL import Image


def words(value):
    if isinstance(value,str):yield value
    elif isinstance(value,list):
        for x in value:yield from words(x)
    elif isinstance(value,dict):
        for k,v in value.items():
            if k not in ('forbidden_terms','path'):yield from words(v)


def load(path):
    path=Path(path).resolve();s=json.loads(path.read_text(encoding='utf-8'))
    for k in ('title','intro'):
        if not isinstance(s.get(k),str) or not s[k].strip():raise ValueError(k+' is required')
    s.setdefault('filename',s['title']+'白皮书')
    if re.search(r'[\\/:*?"<>|\x00-\x1f]',s['filename']) or s['filename'] in ('','.','..'):raise ValueError('Invalid filename')
    if not s.get('sections'):raise ValueError('sections is required')
    text='\n'.join(words(s))
    for term in s.get('forbidden_terms',[]):
        if term and term in text:raise ValueError('Forbidden text: '+term)
    for section in s['sections']:
        if not section.get('title') or not section.get('blocks'):raise ValueError('Section title and blocks required')
        for b in section['blocks']:
            k=b['type']
            if k in ('paragraph','heading','capability'):
                if not b.get('text'):raise ValueError(k+' requires text')
                if k=='capability' and not b.get('name'):raise ValueError('Capability name required')
            elif k=='bullets':
                if not b.get('items') or not all(isinstance(x,str) for x in b['items']):raise ValueError('Text items required')
            elif k=='image':
                p=(path.parent/b['path']).resolve()
                with Image.open(p) as im:b['pixels']=im.size
                b['resolved_path']=str(p)
                if not b.get('caption'):raise ValueError('Image caption required')
            else:raise ValueError('Unknown block: '+k)
    return s


def font(run,size=12,bold=False,east='仿宋',latin='Times New Roman'):
    run.font.name=latin;run.font.size=Pt(size);run.bold=bold;run.font.color.rgb=RGBColor(0,0,0)
    run._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),east)


def numeral(n):
    digits='零一二三四五六七八九'
    if n<10:return digits[n]
    if n<100:return (digits[n//10] if n>=20 else '')+'十'+(digits[n%10] if n%10 else '')
    return str(n)


def build(s,out,overwrite=False):
    out=Path(out).resolve();out.mkdir(parents=True,exist_ok=True);dest=out/(s['filename']+'.docx')
    if dest.exists() and not overwrite:raise FileExistsError('Inspect existing output before --overwrite')
    d=Document();sec=d.sections[0];sec.page_width=Pt(595.3);sec.page_height=Pt(841.9)
    sec.top_margin=sec.bottom_margin=Pt(72);sec.left_margin=sec.right_margin=Pt(90)
    normal=d.styles['Normal'];normal.font.size=Pt(12);normal.paragraph_format.line_spacing=1.5;normal.paragraph_format.space_after=Pt(8)
    for name,size in [('Heading 1',22),('Heading 2',14),('Heading 3',14)]:
        st=d.styles[name];st.font.size=Pt(size);st.font.bold=True;st.font.color.rgb=RGBColor(0,0,0)
        st.paragraph_format.keep_with_next=True;st.paragraph_format.line_spacing=1.5
    def paragraph(text,style=None):
        p=d.add_paragraph(style=style);font(p.add_run(text));return p
    p=d.add_paragraph();p.paragraph_format.space_before=Pt(75);p.paragraph_format.space_after=Pt(80)
    # Allow long cover titles to wrap; cap font size to keep the cover legible.
    cover_size=56 if len(s['title'])<=14 else 44 if len(s['title'])<=24 else 36
    font(p.add_run(s['title']),cover_size,True,'Hiragino Sans GB W6')
    if s.get('team'):
        p=d.add_paragraph();font(p.add_run(s['team']),36,east='PingFang SC')
    if s.get('team_en'):
        p=d.add_paragraph();font(p.add_run(s['team_en']),10,east='PingFang SC')
    p=d.add_paragraph(style='Heading 1');p.paragraph_format.page_break_before=True;font(p.add_run(s['title']),22,True,'黑体')
    paragraph(s['intro'])
    fig=0
    for section in s['sections']:
        p=d.add_paragraph(style='Heading 2');font(p.add_run(section['title']),14,True,'PingFang SC')
        for b in section['blocks']:
            k=b['type']
            if k=='paragraph':paragraph(b['text'])
            elif k=='heading':
                p=d.add_paragraph(style='Heading 3');font(p.add_run(b['text']),14,True,'PingFang SC')
            elif k=='capability':
                p=d.add_paragraph();font(p.add_run(b['name']+' —— '),bold=True);font(p.add_run(b['text']))
            elif k=='bullets':
                for text in b['items']:
                    p=paragraph('• '+text);p.paragraph_format.left_indent=Pt(12);p.paragraph_format.first_line_indent=Pt(-12)
            else:
                fig+=1;w,h=b['pixels'];scale=min(415.3/w,440/h)
                p=d.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER;p.paragraph_format.keep_with_next=True
                p.add_run().add_picture(b['resolved_path'],width=Pt(w*scale),height=Pt(h*scale))
                caption='图'+numeral(fig)+' '+b['caption']
                if b.get('source'):caption+='（'+b['source']+'）'
                p=paragraph(caption);p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    d.core_properties.title=s['title']+'白皮书';d.core_properties.subject='产品定位、核心能力与业务价值'
    d.core_properties.author=s.get('team','');d.save(dest)
    print(dest);return dest


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('spec',type=Path);p.add_argument('--output-dir',type=Path,required=True);p.add_argument('--overwrite',action='store_true')
    p.add_argument('--free-layout',action='store_true',help='Only when the user explicitly requests a new design')
    a=p.parse_args()
    if not a.free_layout:p.error('Default is faithful template reuse. Use build_from_template.py; --free-layout requires an explicit new-design request.')
    build(load(a.spec),a.output_dir,a.overwrite)
