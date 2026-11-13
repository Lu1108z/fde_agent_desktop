"""Inventory text, tables, groups, bounds and OPC relationships; no visual guarantees."""
import argparse
from collections import Counter
import json
from pathlib import Path
import posixpath
from urllib.parse import unquote
from zipfile import ZipFile
from lxml import etree
from pptx import Presentation

def inventory(path):
    issues, pages, lines = [], [], []
    with ZipFile(path) as z:
        bad = z.testzip()
        if bad:
            issues.append(f'Corrupt ZIP member: {bad}')
        names = set(z.namelist())
        for name in names:
            if not name.endswith('.rels'):
                continue
            base = '' if name == '_rels/.rels' else posixpath.dirname(posixpath.dirname(name))
            for rel in etree.fromstring(z.read(name)):
                if rel.get('TargetMode') == 'External':
                    continue
                target = unquote(rel.get('Target', '').split('#')[0])
                if not target:
                    continue
                resolved = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join(base, target))
                if resolved not in names:
                    issues.append(f'Broken relationship: {name} -> {resolved}')
    deck = Presentation(path)
    def walk(shapes, grouped=False):
        result = []
        for sh in shapes:
            item = {'name': sh.name, 'type': str(sh.shape_type),
                    'box': [round(v / 9525, 2) for v in (sh.left, sh.top, sh.width, sh.height)]}
            if not grouped and (sh.left < -9525 or sh.top < -9525 or
                    sh.left + sh.width > deck.slide_width + 9525 or sh.top + sh.height > deck.slide_height + 9525):
                item['bounds_warning'] = True
            if sh.has_text_frame:
                item['text'] = sh.text
                lines.extend(line.strip() for line in sh.text.splitlines() if line.strip())
            if sh.has_table:
                item['table'] = [[cell.text for cell in row.cells] for row in sh.table.rows]
                for row in sh.table.rows:
                    for cell in row.cells:
                        if not cell.is_spanned:
                            lines.extend(line.strip() for line in cell.text.splitlines() if line.strip())
            if sh.shape_type == 6:
                item['children'] = walk(sh.shapes, True)
            result.append(item)
        return result
    for slide in deck.slides:
        pages.append(walk(slide.shapes))
    return {'file': str(path), 'page_count': len(deck.slides),
            'size_emu': [deck.slide_width, deck.slide_height], 'issues': issues,
            'pages': pages, 'text_lines': lines}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('--compare', type=Path, help='Original PPTX to compare text against')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    report = inventory(args.input)
    if args.compare:
        original = inventory(args.compare)
        old, new = Counter(original['text_lines']), Counter(report['text_lines'])
        report['comparison'] = {'original_page_count': original['page_count'],
                                'removed_lines': list((old - new).elements()),
                                'added_lines': list((new - old).elements())}
    value = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(value, encoding='utf-8')
        print(f"{report['page_count']} pages; {len(report['issues'])} package issues; report: {args.output}")
    else:
        print(value)
    if report['issues']:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
