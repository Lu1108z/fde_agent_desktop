#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""医疗行业专家内置知识库（med-knowledge/）命令行查询。只读，不联网。

用法：
  python3 med_kb.py --dir <知识包目录> list                 列出资料目录
  python3 med_kb.py --dir <知识包目录> search "<问题或关键词>"  关键词检索正文段落（带出处、页码）
  python3 med_kb.py --dir <知识包目录> code <编码或项目名称>    精确查 DRG/DIP/医疗服务项目编码
知识包目录省略时依次尝试环境变量 MED_KNOWLEDGE_DIR、本脚本上三级的 med-knowledge/。
"""
import argparse
import json
import math
import os
import re
import sys


def pack_dir(arg):
    for d in (arg, os.environ.get('MED_KNOWLEDGE_DIR'),
              os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'med-knowledge')):
        if d and os.path.isfile(os.path.join(d, 'manifest.json')):
            return d
    sys.exit('找不到医疗知识包（manifest.json），请用 --dir 指定 med-knowledge 目录')


def load(d, name):
    with open(os.path.join(d, name), encoding='utf-8') as f:
        return json.load(f)


def page_of(p):
    if not p or not p[0]:
        return ''
    return f'第 {p[0]}–{p[1]} 页' if p[1] and p[1] != p[0] else f'第 {p[0]} 页'


def bigrams(text):
    lower = text.lower()
    latin = re.findall(r'[a-z0-9][a-z0-9._-]+', lower)
    grams = []
    for s in re.findall(r'[一-鿿]+', lower):
        grams += [s[i:i + 2] for i in range(len(s) - 1)]
    return list(dict.fromkeys(latin + grams))


def cmd_list(d):
    docs = load(d, 'manifest.json')['documents']
    for doc in docs:
        print(f"[{doc['id']}] {doc['topic']} ｜ {doc['title']} ｜ {doc['chars']} 字")
    print(f'共 {len(docs)} 份资料')


def cmd_search(d, query, top):
    docs = {x['id']: x for x in load(d, 'manifest.json')['documents']}
    chunks = load(d, 'chunks.json')
    lower = [c['t'].lower() for c in chunks]
    terms = [t for t in bigrams(query) if len(t) >= 2]
    if not terms:
        sys.exit('请给出至少两个字的关键词')
    # 稀有词权重高（近似 IDF），「数据」「信息」这类到处都有的词不主导排序
    weights = []
    for t in terms:
        df = sum(1 for s in lower if t in s)
        weights.append(math.log(1 + len(lower) / df) if df else 0)
    scored = sorted(((sum(w for t, w in zip(terms, weights) if w and t in s), i) for i, s in enumerate(lower)), reverse=True)
    shown, per_doc = 0, {}
    for score, i in scored:
        if score <= 0 or shown >= top:
            break
        c = chunks[i]
        if per_doc.get(c['doc'], 0) >= 3:
            continue
        per_doc[c['doc']] = per_doc.get(c['doc'], 0) + 1
        shown += 1
        doc = docs.get(c['doc'], {})
        where = ' · '.join(x for x in (doc.get('title', c['doc']), page_of(c.get('p')) or c.get('s', '')) if x)
        print(f'--- [{shown}] {where}\n{c["t"]}\n')
    if not shown:
        print('内置资料中没有找到相关段落')


def cmd_code(d, query):
    codes = load(d, 'codes.json')
    q = query.strip()
    qu = q.upper()
    out = []
    drg = codes.get('drg', {})
    adrg_name = {a['code']: a['name'] for a in drg.get('adrgs', [])}
    icd = qu.replace('X', 'x') if re.match(r'^([A-Z]\d{2}|\d{2}\.)', qu) else None
    if icd:
        hits = [c for c in drg.get('codes', []) if c['code'] == icd] or [c for c in drg.get('codes', []) if c['code'].startswith(icd)][:12]
        for h in hits:
            groups = '、'.join(f"{g['adrg']} {adrg_name.get(g['adrg'], '')}（{g['role']}，第 {g['page']} 页）" for g in h['groups'])
            out.append(f"DRG 3.0 ｜ {h['code']} {h['name']} → {groups}")
        for x in codes.get('dip', {}).get('diseases', []):
            if x['diagnosis'] == icd or x['diagnosis'].startswith(icd + '.') or icd in x['procedures']:
                out.append(f"DIP 3.0 ｜ {x['category']}-{x['no']} {x['text'][:200]}（第 {x['page']} 页）")
    for x in drg.get('drgs', []):
        if x['code'] == qu:
            out.append(f"DRG 细分组 ｜ {x['code']} {x['name']}（属于 {qu[:3]} {adrg_name.get(qu[:3], '')}，第 {x['page']} 页）")
    if qu in adrg_name:
        subs = '、'.join(f"{x['code']} {x['name']}" for x in drg.get('drgs', []) if x['code'].startswith(qu))
        out.append(f"ADRG 核心病组 ｜ {qu} {adrg_name[qu]}：{subs or '无细分组'}")
    items = codes.get('service', {}).get('items', [])
    service = [x for x in items if x['code'] == qu] or [x for x in items if len(q) >= 2 and q in x['name']][:10]
    for x in service:
        out.append(f"医疗服务项目 ｜ {x['code']} {x['name']}（第 {x['page']} 页）｜ {x['text'][:400]}")
    print('\n'.join(out) if out else '编码表中没有找到；可以改用 search 查正文')


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='医疗行业专家内置知识库查询')
    ap.add_argument('--dir')
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('list')
    s = sub.add_parser('search'); s.add_argument('query'); s.add_argument('--top', type=int, default=6)
    c = sub.add_parser('code'); c.add_argument('query')
    a = ap.parse_args()
    d = pack_dir(a.dir)
    if a.cmd == 'list':
        cmd_list(d)
    elif a.cmd == 'search':
        cmd_search(d, a.query, a.top)
    else:
        cmd_code(d, a.query)


if __name__ == '__main__':
    main()
