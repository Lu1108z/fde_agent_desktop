"""Validate content and DOCX structure; this does not render Office pagination."""
import argparse
import json
from pathlib import Path
from zipfile import ZipFile
from docx import Document
from build_whitepaper import load,words


def check(s,path):
    failures=[]
    with ZipFile(path) as z:
        if z.testzip():failures.append('Corrupt DOCX ZIP')
        xml='\n'.join(z.read(n).decode('utf-8') for n in z.namelist() if n.endswith('.xml'))
    d=Document(path);text='\n'.join(p.text for p in d.paragraphs)
    expected=[s['title'],s['intro']]
    for section in s['sections']:
        expected.append(section['title'])
        for b in section['blocks']:
            if b['type']=='image':expected.append(b['caption'])
            elif b['type']=='bullets':expected.extend(b['items'])
            else:
                expected.append(b['text'])
                if b.get('name'):expected.append(b['name'])
    for value in expected:
        if value not in text:failures.append('Missing text: '+value[:60])
    for term in s.get('forbidden_terms',[]):
        if term and (term in text or term in xml):failures.append('Forbidden text: '+term)
    required_images=sum(b['type']=='image' for x in s['sections'] for b in x['blocks'])
    if len(d.inline_shapes)!=required_images:failures.append('Image count mismatch')
    for im in d.inline_shapes:
        if im.width.pt>416 or im.height.pt>441:failures.append('Image exceeds layout limits')
    sec=d.sections[0]
    if abs(sec.page_width.pt-595.3)>1 or abs(sec.page_height.pt-841.9)>1:failures.append('Page size mismatch')
    result={'file':str(path),'paragraphs':len(d.paragraphs),'images':len(d.inline_shapes),'failures':failures,
            'verification_scope':'Content and document structure only; Office pagination and image text require visual review.'}
    print(json.dumps(result,ensure_ascii=False,indent=2))
    if failures:raise SystemExit(1)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('spec',type=Path);p.add_argument('docx',type=Path)
    a=p.parse_args();check(load(a.spec),a.docx)
