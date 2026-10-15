#!/usr/bin/env python3
"""Render actual stage2.aiCapabilities using Knowledge Center's four original sections."""
import argparse, hashlib, json, os, tempfile
from pathlib import Path

def cell(value):
    if isinstance(value,list): value='、'.join(map(str,value))
    return str(value if value is not None else '').replace('|','\\|').replace('\n','<br>')
def table(headers,rows):return '\n'.join(['| '+' | '.join(headers)+' |','| '+' | '.join(['---']*len(headers))+' |']+['| '+' | '.join(cell(x) for x in row)+' |' for row in rows])
def pending(value,owner='FDE与业务方'):return value if value not in (None,'',[]) else f'待确认（{owner}）'
def render(record):
    package=record.get('stage2',{}).get('aiCapabilities',{});items=package.get('items',[])
    if not items:raise ValueError('没有已登记AI能力，不能生成空清单')
    if len({x.get('id') for x in items})!=len(items) or any(not x.get('id') or not x.get('name') or not x.get('requirementIds') for x in items):raise ValueError('能力需要唯一编号、名称和关联需求')
    requirements={x['id']:x for rd in record.get('stage2',{}).get('contactForm',{}).get('rounds',[]) for x in rd.get('requirements',[])}
    if any(rid not in requirements for cap in items for rid in cap['requirementIds']):raise ValueError('能力引用了未登记的需求编号')
    def metric(cap):
        value=cap.get('metric',{});return f"{pending(value.get('name'))}：{pending(value.get('target'))}；测量：{pending(value.get('method'))}"
    lines=['# AI能力清单',f"> 项目：{record.get('project',{}).get('name','待确认')}　状态：{'已记录业务确认' if package.get('reviewEvidence') else '草稿，待业务方确认'}",'## 一、AI能力总览',table(['序号','AI能力','做什么','关联需求','效果指标','优先级','数据依赖度'],[[cap['id'],cap['name'],pending(cap.get('description')),cap['requirementIds'],metric(cap),pending(cap.get('priority')),pending(cap.get('dataDependencyLevel'))] for cap in items]),'## 二、AI能力详细定义']
    for cap in items:
        criterion=f"{metric(cap)}；测试数据集：{pending(cap.get('testDataset'))}；判定方：{pending(cap.get('judge'))}"
        rows=[['能力描述',pending(cap.get('description'))],['关联需求',cap['requirementIds']],['输入',pending(cap.get('input'))],['输出',pending(cap.get('output'))],['效果指标',metric(cap)],['AI承担角色',pending(cap.get('aiRole'))],['数据依赖',pending(cap.get('dataDependencies'))],['验收口径',criterion],['异常处理',pending(cap.get('fallback'))]]
        lines+=['### '+cap['id']+' '+cap['name'],table(['定义项','内容'],rows)]
    lines+=['## 三、AI能力与需求映射关系',table(['需求ID','需求描述','对应AI能力','是否本期实施'],[[rid,req.get('description',''), '、'.join(cap['id']+' '+cap['name'] for cap in items if rid in cap['requirementIds']) or ('—（非AI需求）' if not req.get('involvesAi') else '未覆盖：'+str(package.get('excludedRequirementReasons',{}).get(rid,'待确认（FDE）'))), '是' if req.get('inScope') else '否'] for rid,req in requirements.items()]),'## 四、AI验收口径汇总（供项目经理编制验收标准表用）','验收标准表由项目经理产出，本表为FDE提供的AI口径输入。',table(['AI能力','验收口径','测试数据集','判定方'],[[cap['name'],metric(cap),pending(cap.get('testDataset')),pending(cap.get('judge'))] for cap in items]),'## 五、业务方确认（补充记录）',pending(package.get('reviewEvidence'))]
    return '\n\n'.join(lines)+'\n'
def write(path,text):
    path.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile('w',encoding='utf-8',dir=path.parent,delete=False) as stream:stream.write(text);temporary=stream.name
    os.replace(temporary,path)
def main():
    parser=argparse.ArgumentParser();parser.add_argument('project_dir',type=Path);parser.add_argument('--replace',action='store_true');args=parser.parse_args();root=args.project_dir.resolve();record=json.loads((root/'project-record.json').read_text());content=render(record);output=root/'stage2/ai-capability.md'
    if output.exists() and output.read_text()!=content:
        if not args.replace and '{{' not in output.read_text():raise ValueError('已有稿件，请读回核对后加 --replace；原稿会先备份')
        old=output.read_text();backup=root/'.fde-flow/format-history'/(hashlib.sha256(old.encode()).hexdigest()[:16]+'-ai-capability.md')
        if not backup.exists():write(backup,old)
    write(output,content);print('已按知识中心四章结构写入 stage2/ai-capability.md；确认与门禁状态未自动提升')
if __name__=='__main__':main()
