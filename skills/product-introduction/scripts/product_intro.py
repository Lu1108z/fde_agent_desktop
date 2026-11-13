"""Export, build and verify product introductions using the user's original DOCX packages."""
import argparse
from copy import deepcopy
import hashlib
from io import BytesIO
import json
from pathlib import Path, PurePosixPath
import posixpath
import re
from zipfile import ZipFile

from lxml import etree as E
from PIL import Image

SKILL = Path(__file__).resolve().parents[1]
NS = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
}
PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'
CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
XMLSPACE = '{http://www.w3.org/XML/1998/namespace}space'
LAYOUTS = {
    'operations': {'pains': (5, 9), 'cap_heading': 9, 'caps': (10, 14), 'deploy_heading': 14, 'deploys': (15, 17)},
    'hr': {'pains': (5, 9), 'cap_heading': 9, 'caps': (10, 14), 'case_heading': 14,
           'cases': [(15, (16, 18), 18, 19), (20, (21, 23), 23, 24)], 'deploy_heading': 25, 'deploys': (26, 28)},
    'quality-risk': {'pains': (5, 10), 'cap_heading': 10, 'caps': (11, 14), 'case_paragraphs': (14, 16),
                     'deploy_heading': 16, 'deploys': (17, 20)},
    'perioperative': {'pains': (5, 10), 'cap_heading': 10, 'caps': (11, 15), 'case_heading': 15,
                     'case_paragraphs': (16, 19), 'metrics_heading': 19, 'after_table': 20,
                     'deploy_heading': 21, 'deploys': (22, 24)},
}
DOC = 'word/document.xml'
RELS = 'word/_rels/document.xml.rels'


def q(name):
    prefix, local = name.split(':')
    return '{' + NS[prefix] + '}' + local


def parse(data):
    return E.fromstring(data, E.XMLParser(resolve_entities=False, no_network=True))


def xml(root):
    return E.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)


def text(node):
    return ''.join(node.xpath('.//w:t/text()', namespaces=NS))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def sequence(n):
    digits = '零一二三四五六七八九'
    if n < 10:
        return digits[n]
    if n < 100:
        return (digits[n // 10] if n >= 20 else '') + '十' + (digits[n % 10] if n % 10 else '')
    return str(n)


class Template:
    def __init__(self, key):
        if key not in LAYOUTS:
            raise ValueError('Unknown template: ' + str(key))
        manifest = json.loads((SKILL / 'templates/manifest.json').read_text(encoding='utf-8'))
        self.path = SKILL / 'templates' / manifest[key]['file']
        self.raw = self.path.read_bytes()
        if digest(self.raw) != manifest[key]['sha256']:
            raise ValueError('Template changed; verify its paragraph map and refresh manifest before using it')
        self.key = key
        self.layout = LAYOUTS[key]
        self.source_name = manifest[key]['source_name']
        with ZipFile(BytesIO(self.raw)) as z:
            self.parts = {n: z.read(n) for n in z.namelist()}
        self.root = parse(self.parts[DOC])
        self.body = self.root.find('w:body', NS)
        self.ps = self.body.findall('w:p', NS)
        self.relroot = parse(self.parts[RELS])
        self.relationships = {e.get('Id'): e for e in self.relroot}

    def values(self, bounds):
        return [text(p) for p in self.ps[slice(*bounds)]]

    def picture(self, paragraph):
        ids = paragraph.xpath('.//a:blip/@r:embed', namespaces=NS)
        if len(ids) != 1:
            raise ValueError('Expected a single embedded image in source paragraph')
        rel = self.relationships[ids[0]]
        target = posixpath.normpath(posixpath.join('word', rel.get('Target')))
        return target, self.parts[target]

    def headings(self):
        m = self.layout
        result = {'audience': text(self.ps[2]), 'pains': text(self.ps[4]),
                  'capabilities': text(self.ps[m['cap_heading']]), 'deployments': text(self.ps[m['deploy_heading']])}
        if 'case_heading' in m:
            result['cases'] = text(self.ps[m['case_heading']])
        return result


def require_text(value, name):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(name + ' must be a nonempty string')


def require_list(value, name):
    if not isinstance(value, list) or not value:
        raise ValueError(name + ' must be a nonempty text list')
    for item in value:
        require_text(item, name)


def filename(value):
    require_text(value, 'filename')
    if re.search(r'[\\/:*?"<>|\x00-\x1f]', value) or value in ('.', '..'):
        raise ValueError('filename must be a name without extension or directories')
    return value


def expected_blocks(s):
    """Independent description of visible body order, including captions before images."""
    h = s['headings']
    blocks = [('p', s['title']), ('p', s['positioning']), ('p', h['audience']), ('p', s['audience']), ('p', h['pains'])]
    blocks += [('p', x) for x in s['pains']]
    blocks += [('p', h['capabilities'])] + [('p', x) for x in s['capabilities']]
    if s['template'] == 'hr':
        blocks.append(('p', h['cases']))
        fig = 0
        for i, case in enumerate(s['cases'], 1):
            blocks += [('p', case['title'])] + [('p', p) for p in case['paragraphs']]
            for image in case['figures']:
                fig += 1
                blocks += [('p', f'图{fig} {image["caption"]}'), ('image', None)]
    elif s['template'] in ('quality-risk', 'perioperative'):
        if s['template'] == 'perioperative':
            blocks.append(('p', h['cases']))
        blocks += [('p', p) for p in s['case_paragraphs']]
        if s['template'] == 'perioperative':
            blocks += [('p', s['metrics']['title']), ('table', [s['metrics']['headers']] + s['metrics']['rows'])]
    blocks += [('p', h['deployments'])] + [('p', '• ' + x) for x in s['deployments']]
    return blocks


def visible_strings(blocks):
    for kind, value in blocks:
        if kind == 'p':
            yield value
        elif kind == 'table':
            for row in value:
                yield from row


def load_spec(path):
    path = Path(path).resolve()
    s = json.loads(path.read_text(encoding='utf-8'))
    t = Template(s['template'])
    allowed = {'template', 'title', 'positioning', 'audience', 'pains', 'capabilities', 'deployments',
               'filename', 'headings', 'forbidden_terms', 'evidence', 'cases', 'case_paragraphs', 'metrics'}
    if set(s) - allowed:
        raise ValueError('Unknown fields: ' + ', '.join(sorted(set(s) - allowed)))
    for key in ('title', 'positioning', 'audience'):
        require_text(s.get(key), key)
    for key in ('pains', 'capabilities', 'deployments'):
        require_list(s.get(key), key)
    if any(x.lstrip().startswith('•') for x in s['deployments']):
        raise ValueError('Remove bullet characters from deployments; template supplies them')
    s['filename'] = filename(s.get('filename', s['title'] + '-产品介绍'))
    headings = t.headings()
    for key, value in s.get('headings', {}).items():
        if key not in headings:
            raise ValueError('Heading is not used by the selected template: ' + key)
        require_text(value, 'headings.' + key)
        if re.match(r'^\s*(\d+[.、]|[一二三四五六七八九十]+、)', value):
            raise ValueError('Heading text must not duplicate automatic numbering')
        headings[key] = value
    s['headings'] = headings
    casefields = {key for key in ('cases', 'case_paragraphs', 'metrics') if key in s}
    expected = {'hr': {'cases'}, 'quality-risk': {'case_paragraphs'}, 'perioperative': {'case_paragraphs', 'metrics'}}.get(t.key, set())
    if casefields != expected:
        raise ValueError(f'Template {t.key} requires case fields {sorted(expected)}; got {sorted(casefields)}')
    if t.key == 'hr':
        if not isinstance(s['cases'], list) or not s['cases']:
            raise ValueError('cases must be nonempty')
        for i, case in enumerate(s['cases'], 1):
            case.setdefault('title', '案例' + sequence(i))
            require_text(case['title'], 'case title')
            require_list(case.get('paragraphs'), 'case paragraphs')
            case.setdefault('figures', [])
            if not isinstance(case['figures'], list):
                raise ValueError('figures must be an array')
            for pic in case['figures']:
                require_text(pic.get('caption'), 'image caption')
                if re.match(r'^图\s*\d+', pic['caption']):
                    raise ValueError('Do not manually number image captions')
                p = (path.parent / pic['path']).resolve()
                data = p.read_bytes()
                with Image.open(BytesIO(data)) as im:
                    im.load()
                    formats = {'PNG': ('png', 'image/png'), 'JPEG': ('jpg', 'image/jpeg')}
                    if im.format not in formats:
                        raise ValueError('Convert images to PNG or JPEG before inserting them into Word')
                    pic['_size'] = im.size
                    pic['_ext'], pic['_mime'] = formats[im.format]
                pic['_data'] = data
    if 'case_paragraphs' in expected:
        require_list(s.get('case_paragraphs'), 'case_paragraphs')
    if 'metrics' in expected:
        metrics = s['metrics']
        metrics.setdefault('title', text(t.ps[t.layout['metrics_heading']]))
        require_text(metrics['title'], 'metrics title')
        if len(metrics.get('headers', [])) != 3 or not metrics.get('rows'):
            raise ValueError('metrics needs three headers and nonempty rows')
        for row in [metrics['headers']] + metrics['rows']:
            if len(row) != 3:
                raise ValueError('Each metrics row must have exactly three cells')
            for cell in row:
                require_text(cell, 'metric cell')
    terms = s.setdefault('forbidden_terms', [])
    if not isinstance(terms, list) or any(not isinstance(x, str) or not x for x in terms):
        raise ValueError('forbidden_terms must be a list of nonempty strings')
    visible = '\n'.join(visible_strings(expected_blocks(s))) + '\n' + s['filename']
    for term in terms:
        if term in visible:
            raise ValueError('Forbidden term: ' + term)
    return s, t


def clone_text(node, value):
    p = deepcopy(node)
    if text(p) == value:
        return p
    if p.xpath('.//w:drawing | .//w:fldChar | .//w:instrText | .//w:br', namespaces=NS):
        raise ValueError('Complex paragraph requires an object-aware edit')
    texts = p.xpath('.//w:t', namespaces=NS)
    if not texts:
        raise ValueError('No editable text node in template prototype')
    texts[0].text = value
    if value.startswith(' ') or value.endswith(' '):
        texts[0].set(XMLSPACE, 'preserve')
    for extra in texts[1:]:
        extra.text = ''
    return p


def clone_series(prototypes, values):
    return [clone_text(prototypes[min(i, len(prototypes) - 1)], value) for i, value in enumerate(values)]


def make_table(source, headers, rows):
    table = deepcopy(source)
    prototypes = source.findall('w:tr', NS)
    for row in table.findall('w:tr', NS):
        table.remove(row)
    for i, cells in enumerate([headers] + rows):
        row = deepcopy(prototypes[min(i, len(prototypes) - 1)])
        for cell, value in zip(row.findall('w:tc', NS), cells):
            p = cell.find('w:p', NS)
            cell.replace(p, clone_text(p, value))
        table.append(row)
    return table


class Images:
    def __init__(self, t):
        self.t = t
        self.relroot = deepcopy(t.relroot)
        self.ct = parse(t.parts['[Content_Types].xml'])
        self.new = {}
        self.next_id = max([int(e.get('Id')[3:]) for e in self.relroot if re.match(r'^rId\d+$', e.get('Id', ''))] + [0]) + 1
        self.cache = {}
        for e in self.relroot:
            if e.get('Type', '').endswith('/image') and e.get('TargetMode') != 'External':
                target = posixpath.normpath(posixpath.join('word', e.get('Target')))
                if target in t.parts:
                    self.cache[digest(t.parts[target])] = e.get('Id')

    def add(self, pic):
        sha = digest(pic['_data'])
        if sha in self.cache:
            return self.cache[sha]
        target = f'word/media/product-intro-{sha}.{pic["_ext"]}'
        self.new[target] = pic['_data']
        rid = f'rId{self.next_id}'
        self.next_id += 1
        E.SubElement(self.relroot, '{' + PKG + '}Relationship', Id=rid,
                     Type=NS['r'] + '/image', Target=target.removeprefix('word/'))
        known = {e.get('Extension') for e in self.ct if E.QName(e).localname == 'Default'}
        if pic['_ext'] not in known:
            E.SubElement(self.ct, '{' + CT + '}Default', Extension=pic['_ext'], ContentType=pic['_mime'])
        self.cache[sha] = rid
        return rid

    def paragraph(self, source, pic):
        result = deepcopy(source)
        original_target, original_bytes = self.t.picture(source)
        rid = self.add(pic)
        result.find('.//a:blip', NS).set(q('r:embed'), rid)
        if original_bytes == pic['_data']:
            return result
        extent = result.find('.//wp:extent', NS)
        maxw, maxh = int(extent.get('cx')), int(extent.get('cy'))
        pxw, pxh = pic['_size']
        factor = min(maxw / pxw, maxh / pxh)
        for e in result.xpath('.//wp:extent | .//pic:spPr/a:xfrm/a:ext', namespaces=NS):
            e.set('cx', str(round(pxw * factor)))
            e.set('cy', str(round(pxh * factor)))
        return result


def build_parts(s, t):
    root = deepcopy(t.root)
    body = root.find('w:body', NS)
    ps, m, h = t.ps, t.layout, s['headings']
    nodes = [clone_text(ps[0], s['title']), clone_text(ps[1], s['positioning']),
             clone_text(ps[2], h['audience']), clone_text(ps[3], s['audience']), clone_text(ps[4], h['pains'])]
    nodes += clone_series(ps[slice(*m['pains'])], s['pains'])
    nodes.append(clone_text(ps[m['cap_heading']], h['capabilities']))
    nodes += clone_series(ps[slice(*m['caps'])], s['capabilities'])
    images = Images(t)
    if t.key == 'hr':
        nodes.append(clone_text(ps[m['case_heading']], h['cases']))
        figcount = 0
        for i, case in enumerate(s['cases']):
            title, paragraphs, cap, picture = m['cases'][min(i, len(m['cases']) - 1)]
            nodes.append(clone_text(ps[title], case['title']))
            nodes += clone_series(ps[slice(*paragraphs)], case['paragraphs'])
            for pic in case['figures']:
                figcount += 1
                nodes.append(clone_text(ps[cap], f'图{figcount} {pic["caption"]}'))
                nodes.append(images.paragraph(ps[picture], pic))
    elif t.key in ('quality-risk', 'perioperative'):
        if 'case_heading' in m:
            nodes.append(clone_text(ps[m['case_heading']], h['cases']))
        nodes += clone_series(ps[slice(*m['case_paragraphs'])], s['case_paragraphs'])
        if t.key == 'perioperative':
            nodes.append(clone_text(ps[m['metrics_heading']], s['metrics']['title']))
            nodes.append(make_table(t.body.find('w:tbl', NS), s['metrics']['headers'], s['metrics']['rows']))
            nodes.append(deepcopy(ps[m['after_table']]))
    nodes.append(clone_text(ps[m['deploy_heading']], h['deployments']))
    nodes += clone_series(ps[slice(*m['deploys'])], ['• ' + x for x in s['deployments']])
    nodes.append(deepcopy(t.body.find('w:sectPr', NS)))
    for node in list(body):
        body.remove(node)
    for node in nodes:
        body.append(node)
    # New cases may reuse an image paragraph prototype; maintain unique drawing IDs.
    used = set()
    allids = [int(x) for x in root.xpath('//wp:docPr/@id', namespaces=NS)]
    nextid = max(allids + [20]) + 1
    for e in root.xpath('//wp:docPr', namespaces=NS):
        if e.get('id') in used:
            e.set('id', str(nextid))
            nextid += 1
        used.add(e.get('id'))
    parts = dict(t.parts)
    # Avoid even XML serialization changes when no visible content changed.
    if E.tostring(root) != E.tostring(t.root):
        parts[DOC] = xml(root)
    if E.tostring(images.relroot) != E.tostring(t.relroot):
        parts[RELS] = xml(images.relroot)
    if E.tostring(images.ct) != E.tostring(parse(t.parts['[Content_Types].xml'])):
        parts['[Content_Types].xml'] = xml(images.ct)
    parts.update(images.new)
    if s['title'] != text(ps[0]) and 'docProps/core.xml' in parts:
        props = parse(parts['docProps/core.xml'])
        dc = 'http://purl.org/dc/elements/1.1/'
        for key, value in [('title', s['title'] + '-产品介绍'), ('subject', '产品定位、需求痛点、核心能力与客户价值'),
                           ('description', s['title'] + '产品介绍')]:
            e = props.find('{' + dc + '}' + key)
            if e is None:
                e = E.SubElement(props, '{' + dc + '}' + key)
            e.text = value
        parts['docProps/core.xml'] = xml(props)
    return parts


def write_package(t, parts, target):
    if target.exists():
        raise FileExistsError('Output exists; use a new filename to preserve manual edits')
    target.parent.mkdir(parents=True, exist_ok=True)
    if parts == t.parts:
        target.write_bytes(t.raw)
        return
    with ZipFile(BytesIO(t.raw)) as original, ZipFile(target, 'x') as result:
        for info in original.infolist():
            result.writestr(info, parts[info.filename])
        for name in sorted(set(parts) - set(t.parts)):
            result.writestr(name, parts[name], compress_type=8)


def export_template(t, directory):
    directory = Path(directory).resolve()
    dest = directory / 'product.json'
    if dest.exists():
        raise FileExistsError(dest)
    directory.mkdir(parents=True, exist_ok=True)
    m, ps = t.layout, t.ps
    s = {'template': t.key, 'title': text(ps[0]), 'positioning': text(ps[1]), 'audience': text(ps[3]),
         'pains': t.values(m['pains']), 'capabilities': t.values(m['caps']),
         'deployments': [x.removeprefix('• ') for x in t.values(m['deploys'])],
         'headings': t.headings(), 'forbidden_terms': [],
         'evidence': ['内容来自用户成品：' + t.source_name + '；跨产品使用时替换全部业务内容、案例与图片。']}
    if t.key == 'hr':
        s['cases'] = []
        for i, (title, paragraphs, cap, pic) in enumerate(m['cases'], 1):
            name, data = t.picture(ps[pic])
            relative = Path('screens') / f'case-{i}{PurePosixPath(name).suffix}'
            target = directory / relative
            if target.exists() and target.read_bytes() != data:
                raise FileExistsError(target)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            s['cases'].append({'title': text(ps[title]), 'paragraphs': t.values(paragraphs),
                               'figures': [{'path': relative.as_posix(), 'caption': re.sub(r'^图\d+\s*', '', text(ps[cap]))}]})
    if 'case_paragraphs' in m:
        s['case_paragraphs'] = t.values(m['case_paragraphs'])
    if t.key == 'perioperative':
        table = t.body.find('w:tbl', NS)
        rows = [[text(c) for c in r.findall('w:tc', NS)] for r in table.findall('w:tr', NS)]
        s['metrics'] = {'title': text(ps[m['metrics_heading']]), 'headers': rows[0], 'rows': rows[1:]}
    dest.write_text(json.dumps(s, ensure_ascii=False, indent=2), encoding='utf-8')
    return dest


def actual_blocks(root):
    result = []
    for node in root.find('w:body', NS):
        if node.tag == q('w:p'):
            if node.xpath('.//w:drawing', namespaces=NS):
                result.append(('image', None))
            elif text(node).strip():
                result.append(('p', text(node)))
        elif node.tag == q('w:tbl'):
            result.append(('table', [[text(c) for c in r.findall('w:tc', NS)] for r in node.findall('w:tr', NS)]))
    return result


def verify(s, t, target):
    failures = []
    with ZipFile(target) as z:
        if z.testzip():
            failures.append('DOCX ZIP integrity error')
        parts = {n: z.read(n) for n in z.namelist()}
    root = parse(parts[DOC])
    if actual_blocks(root) != expected_blocks(s):
        failures.append('Visible content/order differs from source; check captions and tables too')
    mutable = {DOC, RELS, '[Content_Types].xml', 'docProps/core.xml'}
    for name, data in t.parts.items():
        if name not in mutable and parts.get(name) != data:
            failures.append('Template part was changed or lost: ' + name)
    origsect = t.body.find('w:sectPr', NS)
    newsect = root.find('w:body/w:sectPr', NS)
    if E.tostring(origsect) != E.tostring(newsect):
        failures.append('Section layout or active header/footer references changed')
    first = root.find('w:body/w:p', NS)
    if first.find('w:pPr/w:pStyle', NS).get(q('w:val')) != '1':
        failures.append('Product title style changed')
    # Validate relationship targets including shared logo and new body figures.
    relroot = parse(parts[RELS])
    rels = {e.get('Id'): e for e in relroot}
    pic_hashes = []
    for rid in root.xpath('//a:blip/@r:embed', namespaces=NS):
        rel = rels.get(rid)
        if rel is None or rel.get('TargetMode') == 'External':
            failures.append('Missing internal image relationship: ' + rid)
            continue
        name = posixpath.normpath(posixpath.join('word', rel.get('Target')))
        if name not in parts:
            failures.append('Missing image part: ' + name)
        else:
            pic_hashes.append(digest(parts[name]))
    expected_images = [p for c in s.get('cases', []) for p in c['figures']]
    if pic_hashes != [digest(p['_data']) for p in expected_images]:
        failures.append('Body images do not match selected product pictures')
    drawings = root.xpath('//wp:docPr/@id', namespaces=NS)
    if len(drawings) != len(set(drawings)):
        failures.append('Duplicate drawing IDs')
    max_width = 415.3 * 12700
    for e in root.xpath('//wp:extent', namespaces=NS):
        if int(e.get('cx')) > max_width + 12700 or int(e.get('cy')) <= 0:
            failures.append('Image is outside the template width')
    # Root document metadata is included, evidence and source template names are not.
    visible = '\n'.join(visible_strings(actual_blocks(root)))
    if 'docProps/core.xml' in parts:
        visible += '\n' + ''.join(parse(parts['docProps/core.xml']).itertext())
    for term in s['forbidden_terms']:
        if term in visible or term in Path(target).name:
            failures.append('Forbidden visible text/metadata: ' + term)
    changed = [n for n in parts if n not in t.parts or parts[n] != t.parts[n]]
    report = {'output': str(Path(target).resolve()), 'template': t.key,
              'template_sha256': digest(t.raw), 'changed_parts': sorted(changed),
              'body_figures': len(pic_hashes), 'failures': failures,
              'verified': 'Content order, original styles/numbering/header resources, section references, image bytes, package integrity',
              'visual_pagination': 'Not rendered by this checker; inspect in Word/WPS/LibreOffice',
              'image_text': 'Requires separate visual/OCR review'}
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    commands = p.add_subparsers(dest='command', required=True)
    for name in ('inspect', 'export'):
        sub = commands.add_parser(name)
        sub.add_argument('--template', choices=sorted(LAYOUTS), required=True)
        if name == 'export':
            sub.add_argument('--output-dir', type=Path, required=True)
    sub = commands.add_parser('build')
    sub.add_argument('spec', type=Path)
    sub.add_argument('--output-dir', type=Path, required=True)
    sub = commands.add_parser('verify')
    sub.add_argument('spec', type=Path)
    sub.add_argument('docx', type=Path)
    args = p.parse_args()
    if args.command in ('inspect', 'export'):
        t = Template(args.template)
        if args.command == 'export':
            print(export_template(t, args.output_dir))
        else:
            print(json.dumps({'template': t.key, 'source': t.source_name, 'sha256': digest(t.raw),
                              'headings': t.headings(), 'blocks': actual_blocks(t.root)}, ensure_ascii=False, indent=2))
        return
    s, t = load_spec(args.spec)
    target = args.docx if args.command == 'verify' else args.output_dir / (s['filename'] + '.docx')
    if args.command == 'build':
        write_package(t, build_parts(s, t), target)
    report = verify(s, t, target)
    log = target.parent / '.product-introduction-build' / (target.stem + '.json')
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report['failures']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
