"""Check generated artifacts and render PDF contact sheets for visual review."""
import argparse
import json
from pathlib import Path
import re
from zipfile import ZipFile
import xml.etree.ElementTree as ET

import fitz
from PIL import Image, ImageDraw
from build_manual import load_spec, SIZES


def compact(text): return re.sub(r'\s+', '', text)


def check(spec, out):
    name=spec['filename']; out=Path(out).resolve()
    pdf=out/(name+'.pdf'); docx=out/(name+'.docx')
    work=out/'.manual-build'/name; work.mkdir(parents=True,exist_ok=True)
    d=fitz.open(pdf); failures=[]
    if len(d)!=len(spec['pages'])+1: failures.append('Unexpected PDF page count')
    texts=[]
    for i,p in enumerate(d):
        texts.append(p.get_text())
        if not texts[-1].strip(): failures.append(f'PDF page {i+1} is empty')
        w,h=SIZES[spec['page_size']]
        if abs(p.rect.width-w)>1 or abs(p.rect.height-h)>1: failures.append(f'PDF page {i+1} size differs')
        for block in p.get_text('blocks'):
            if block[0]<-1 or block[1]<-1 or block[2]>w+1 or block[3]>h+1:
                failures.append(f'PDF page {i+1} contains out-of-page content')
    alltext='\n'.join(texts)
    with ZipFile(docx) as z:
        if z.testzip(): failures.append('DOCX ZIP corruption')
        xml='\n'.join(z.read(n).decode('utf-8') for n in z.namelist() if n.endswith('.xml'))
        root=ET.fromstring(z.read('word/document.xml'))
        doc_text=''.join(e.text or '' for e in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'))
        media=sum(n.startswith('word/media/') for n in z.namelist())
    for term in spec.get('forbidden_terms',[]):
        if term and (term in alltext or term in xml): failures.append(f'Forbidden text: {term}')
    for page in spec['pages']:
        expected=[page['heading']]
        for b in page['blocks']:
            if b['type'] in ('text','sub','note'): expected.append(b['text'])
            elif b['type'] in ('steps','bullets'): expected.extend(b['items'])
            elif b['type']=='table': expected.extend(str(v) for row in [b['headers']]+b['rows'] for v in row)
            else: expected.extend(x['figure_caption'] for x in b['items'])
        for text in expected:
            for label, content in [('PDF',alltext),('DOCX',doc_text)]:
                if compact(text) not in compact(content): failures.append(f'{label} missing text: {text[:60]}')
    sheets=[]
    for start in range(0,len(d),20):
        end=min(start+20,len(d)); rows=(end-start+3)//4
        canvas=Image.new('RGB',(1000,rows*355),'#e9ebef')
        draw=ImageDraw.Draw(canvas)
        for i in range(start,end):
            pix=d[i].get_pixmap(matrix=fitz.Matrix(.38,.38),alpha=False)
            img=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
            img.thumbnail((242,327))
            x=((i-start)%4)*250; y=((i-start)//4)*355
            canvas.paste(img,(x,y)); draw.text((x+5,y+330),str(i+1),fill='black')
        path=work/('contact-sheet.jpg' if start==0 else f'contact-sheet-{start//20+1}.jpg')
        canvas.save(path); sheets.append(str(path))
    report={'pdf_pages':len(d),'docx_embedded_images':media,'failures':failures,'contact_sheets':sheets,
            'limits':['Image text requires visual/OCR review.','DOCX natural pagination has not been rendered by this checker.']}
    (work/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    if failures: raise SystemExit(1)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('spec',type=Path); p.add_argument('--output-dir',type=Path,required=True)
    a=p.parse_args(); check(load_spec(a.spec),a.output_dir)
