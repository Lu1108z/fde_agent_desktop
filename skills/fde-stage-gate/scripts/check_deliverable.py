#!/usr/bin/env python3
"""Check one FDE deliverable without requiring unfinished later deliverables."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from validate_fde import Validator

PREFIXES = {
    "S2-1": ("stage2.contactForm",),
    "S2-2": ("stage2.contactForm", "stage2.aiCapabilities"),
    "S2-3": ("stage2.contactForm", "stage2.aiCapabilities", "stage2.prototypePackage"),
    "S3-2": ("stage2.", "stage3.finalRequirements"),
    "S3-3": ("stage2.", "stage3.finalRequirements", "stage3.implementationPlan"),
    "S3-4": ("stage2.", "stage3.finalRequirements", "stage3.dataMetrics"),
    "S3-1": ("stage2.", "stage3.finalRequirements", "stage3.dataMetrics", "stage3.agentDesign"),
    "S3-5": ("stage2.", "stage3.finalRequirements", "stage3.dataMetrics", "stage3.agentDesign", "stage3.prdFinal"),
    "S3-6": ("stage2.", "stage3.finalRequirements", "stage3.dataMetrics", "stage3.agentDesign", "stage3.prdFinal", "stage3.prototypeFinal"),
}
NUMBER = re.compile(r"\d")
SQL_START = re.compile(r"\b(?:SELECT|WITH)\b", re.I)


def add(errors: list[dict], code: str, path: str, message: str) -> None:
    errors.append({"code": code, "path": path, "message": message})


def extra_checks(item: str, record: dict, errors: list[dict]) -> None:
    s2 = record.get("stage2", {})
    s3 = record.get("stage3", {})
    if item in {"S2-2", "S2-3", "S3-1", "S3-2", "S3-3", "S3-4", "S3-5", "S3-6"}:
        rounds = s2.get("contactForm", {}).get("rounds", [])
        ai = s2.get("aiCapabilities", {})
        needed = {r.get("id") for row in rounds if isinstance(row, dict) for r in row.get("requirements", []) if isinstance(r, dict) and r.get("inScope") is True and r.get("involvesAi") is True}
        covered = {rid for cap in ai.get("items", []) if isinstance(cap, dict) for rid in cap.get("requirementIds", [])}
        excluded = ai.get("excludedRequirementReasons", {})
        if not isinstance(excluded, dict):
            excluded = {}
        for rid in sorted(needed - covered):
            if not isinstance(excluded.get(rid), str) or not excluded[rid].strip():
                add(errors, "ai_requirement_uncovered", "stage2.aiCapabilities", f"AI 需求 {rid} 未映射能力，也没有排除理由")
        for i, cap in enumerate(ai.get("items", [])):
            if not isinstance(cap, dict):
                continue
            target = cap.get("metric", {}).get("target", "")
            if not NUMBER.search(str(target)):
                add(errors, "unmeasurable_target", f"stage2.aiCapabilities.items[{i}].metric.target", "效果目标应包含可核验数值与单位/口径")
    if item in {"S2-3", "S3-1", "S3-2", "S3-3", "S3-4", "S3-5", "S3-6"}:
        reqs = {req.get("id") for rd in s2.get("contactForm", {}).get("rounds", []) if isinstance(rd, dict) for req in rd.get("requirements", []) if isinstance(req, dict) and req.get("inScope") is True}
        package = s2.get("prototypePackage", {})
        covered = {rid for feature in package.get("features", []) if isinstance(feature, dict) for rid in feature.get("requirementIds", [])}
        excluded = package.get("excludedRequirementReasons", {})
        for rid in sorted(reqs - covered):
            if not isinstance(excluded, dict) or not str(excluded.get(rid, "")).strip():
                add(errors, "prototype_requirement_uncovered", "stage2.prototypePackage", f"本期需求 {rid} 未映射功能，也没有排除理由")
    if item in {"S3-2", "S3-3", "S3-4", "S3-1", "S3-5", "S3-6"}:
        final = s3.get("finalRequirements", {})
        excluded = final.get("excludedRequirementReasons", {})
        for rid in final.get("excludedRequirementIds", []):
            if not isinstance(excluded, dict) or not str(excluded.get(rid, "")).strip():
                add(errors, "excluded_requirement_without_reason", "stage3.finalRequirements", f"排除需求 {rid} 需要记录理由")
    if item in {"S3-1", "S3-5", "S3-6"}:
        final = s3.get("finalRequirements", {})
        design = s3.get("agentDesign", {})
        agents = design.get("agents", [])
        reqs = set(final.get("requirementIds", []))
        features = {f.get("id") for f in s2.get("prototypePackage", {}).get("features", []) if isinstance(f, dict)}
        used_req = {x for agent in agents if isinstance(agent, dict) for x in agent.get("requirementIds", [])}
        used_feature = {x for agent in agents if isinstance(agent, dict) for x in agent.get("featureIds", [])}
        excluded_req = design.get("excludedRequirementReasons", {})
        excluded_feature = design.get("excludedFeatureReasons", {})
        for rid in sorted(reqs - used_req):
            if not isinstance(excluded_req, dict) or not str(excluded_req.get(rid, "")).strip():
                add(errors, "agent_requirement_uncovered", "stage3.agentDesign", f"已签需求 {rid} 未映射智能体，也没有不适用理由")
        for fid in sorted(features - used_feature):
            if not isinstance(excluded_feature, dict) or not str(excluded_feature.get(fid, "")).strip():
                add(errors, "agent_feature_uncovered", "stage3.agentDesign", f"功能 {fid} 未映射智能体，也没有不适用理由")
        for i, agent in enumerate(agents):
            if isinstance(agent, dict) and not NUMBER.search(str(agent.get("eval", {}).get("result", ""))):
                add(errors, "eval_result_not_numeric", f"stage3.agentDesign.agents[{i}].eval.result", "实际 Eval 结果应有数值，并与项目验收线比较")
    if item in {"S3-4", "S3-1", "S3-5", "S3-6"}:
        data = s3.get("dataMetrics", {})
        for i, dataset in enumerate(data.get("datasets", [])):
            if isinstance(dataset, dict) and dataset.get("type") == "new" and not SQL_START.search(str(dataset.get("sql", ""))):
                add(errors, "sql_missing_query", f"stage3.dataMetrics.datasets[{i}].sql", "新增数据集须提供可核对的取数 SQL")
        for i, metric in enumerate(data.get("metrics", [])):
            if isinstance(metric, dict) and not SQL_START.search(str(metric.get("sql", ""))):
                add(errors, "sql_missing_query", f"stage3.dataMetrics.metrics[{i}].sql", "指标须提供可核对的取数 SQL")


def format_checks(root: Path, item: str, errors: list[dict]) -> None:
    import unicodedata
    normalize=lambda value: re.sub(r"\s+", "", unicodedata.normalize('NFKC', str(value)))
    contracts=json.loads((Path(__file__).resolve().parents[2] / 'fde-contact-form/references/knowledge-center-contract.json').read_text(encoding='utf-8'))
    files={'S2-1':('contact-form','stage2/contact-form.md'),'S2-2':('ai-capability','stage2/ai-capability.md')}
    if item not in files:return
    key,file=files[item];target=root/file
    if not target.is_file():return
    text=target.read_text(encoding='utf-8');rows=[re.split(r'(?<!\\)\|',line.strip().strip('|')) for line in text.splitlines() if line.strip().startswith('|')]
    normalized=[[normalize(cell) for cell in row] for row in rows]
    for table in contracts[key]['tables']:
        headers=[normalize(cell) for cell in table['headers']]
        if not any(row[:len(headers)]==headers for row in normalized):add(errors,'template_columns',f'stage2.{key}', '未按知识中心表头排列：'+' / '.join(table['headers']))
        for label in table['labels']:
            if normalize(label) not in normalize(text):add(errors,'template_row',f'stage2.{key}', '缺少知识中心填写项：'+label)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project_dir", type=Path)
    parser.add_argument("--item", choices=sorted(PREFIXES), required=True)
    args = parser.parse_args()
    root = args.project_dir.resolve()
    try:
        record = json.loads((root / "project-record.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"automatedPassed": False, "errors": [{"code": "record_read", "message": str(exc)}]}, ensure_ascii=False, indent=2))
        return 2
    stage = 2 if args.item.startswith("S2") else 3
    result = Validator(root, record, stage).run()
    prefixes = PREFIXES[args.item]
    errors = [err for err in result["errors"] if any(err["path"].startswith(p) for p in prefixes)]
    extra_checks(args.item, record, errors)
    format_checks(root,args.item,errors)
    answer = {"item": args.item, "automatedPassed": not errors, "humanReviewRequired": True,
              "errors": errors, "warnings": [w for w in result["warnings"] if any(w["path"].startswith(p) for p in prefixes)],
              "manualChecks": result["manualChecks"]}
    print(json.dumps(answer, ensure_ascii=False, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
