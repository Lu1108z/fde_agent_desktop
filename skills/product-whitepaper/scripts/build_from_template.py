"""Preserve the original DOCX package; edit only explicitly selected paragraph text."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile
from lxml import etree

DEFAULT=Path(__file__).resolve().parents[1]/'templates/reference.docx'
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}


def paragraphs(root):return root.findall('w:body/w:p',NS)
def text(p):return ''.join(p.xpath('.//w:t/text()',namespaces=NS))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--template',type=Path,default=DEFAULT)
    parser.add_argument('--inspect',action='store_true')
    parser.add_argument('--edits',type=Path)
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    with ZipFile(args.template) as z:
        root=etree.fromstring(z.read('word/document.xml'))
        ps=paragraphs(root)
        if args.inspect:
            print(json.dumps([{'index':i,'text':text(p),'drawings':len(p.xpath('.//w:drawing',namespaces=NS))} for i,p in enumerate(ps)],ensure_ascii=False,indent=2))
            return
        if not args.edits or not args.output:parser.error('--edits and --output are required')
        if args.output.exists():raise FileExistsError('Choose a new output filename; do not overwrite user edits.')
        edits=json.loads(args.edits.read_text(encoding='utf-8'))
        seen=set()
        for item in edits:
            index=item['index']
            if index in seen:raise ValueError('Duplicate paragraph index')
            seen.add(index)
            p=ps[index]
            if text(p)!=item['expected']:raise ValueError(f'Paragraph {index} differs from expected source text')
            if p.xpath('.//w:drawing | .//w:fldChar | .//w:instrText',namespaces=NS):raise ValueError('Use an explicit object-aware edit for drawing/field paragraphs')
            nodes=p.xpath('.//w:t',namespaces=NS)
            if not nodes:raise ValueError('Selected paragraph has no text node')
            nodes[0].text=item['replacement']
            nodes[0].set('{http://www.w3.org/XML/1998/namespace}space','preserve')
            for node in nodes[1:]:node.text=''
        args.output.parent.mkdir(parents=True,exist_ok=True)
        # Empty edit list produces an exact package copy, not a regenerated document.
        if not edits:
            args.output.write_bytes(args.template.read_bytes())
        else:
            xml=etree.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
            with ZipFile(args.output,'w') as dest:
                for entry in z.infolist():dest.writestr(entry,xml if entry.filename=='word/document.xml' else z.read(entry.filename))
    with ZipFile(args.template) as original, ZipFile(args.output) as result:
        assert result.testzip() is None
        for name in original.namelist():
            if name!='word/document.xml':assert original.read(name)==result.read(name),name
    print(json.dumps({'output':str(args.output),'edited_paragraphs':sorted(seen),'all_other_package_parts':'unchanged',
                      'sha256':hashlib.sha256(args.output.read_bytes()).hexdigest()},ensure_ascii=False,indent=2))


if __name__=='__main__':main()
