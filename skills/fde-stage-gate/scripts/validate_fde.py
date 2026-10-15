#!/usr/bin/env python3
"""Validate the structured FDE stage-2/3 project record and its artifacts.

This checks deterministic structure and references. It cannot authenticate a
customer signature, verify source SQL, or judge the quality of an Eval result.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse


PLACEHOLDER = re.compile(r"^(?:TODO|TBD|待填写|待补充|示例|示意|[_—\-]+|\{\{.*\}\})$", re.I)
PENDING = re.compile(r"待确认|待信息科提供|待补|TBD|TODO", re.I)


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag not in {"a", "img", "script", "link"}:
            return
        data = dict(attrs)
        ref = data.get("href") or data.get("src")
        if ref:
            self.refs.append(ref)


class Validator:
    def __init__(self, root: Path, record: dict, stage: int):
        self.root = root.resolve()
        self.record = record
        self.stage = stage
        self.errors: list[dict] = []
        self.warnings: list[dict] = []
        self.manual: list[str] = []

    def error(self, code: str, path: str, message: str):
        self.errors.append({"code": code, "path": path, "message": message})

    def warning(self, code: str, path: str, message: str):
        self.warnings.append({"code": code, "path": path, "message": message})

    def obj(self, parent, key: str, path: str) -> dict:
        value = parent.get(key) if isinstance(parent, dict) else None
        if not isinstance(value, dict):
            self.error("required_object", path, "需要对象")
            return {}
        return value

    def items(self, parent, key: str, path: str, minimum: int = 1) -> list:
        value = parent.get(key) if isinstance(parent, dict) else None
        if not isinstance(value, list):
            self.error("required_list", path, "需要列表")
            return []
        if len(value) < minimum:
            self.error("empty_list", path, f"至少需要 {minimum} 项")
        return value

    def field(self, parent, key: str, path: str) -> str:
        value = parent.get(key) if isinstance(parent, dict) else None
        if not isinstance(value, str) or not value.strip() or PLACEHOLDER.fullmatch(value.strip()):
            self.error("required_field", path, "必填且不能是模板占位符")
            return ""
        return value.strip()

    def fields(self, parent, keys: list[str], prefix: str):
        for key in keys:
            self.field(parent, key, f"{prefix}.{key}")

    def unique(self, values: list[str], path: str):
        nonempty = [x for x in values if x]
        if len(nonempty) != len(set(nonempty)):
            self.error("duplicate_id", path, "编号必须唯一")

    def refs(self, values, known: set[str], path: str, minimum: int = 1):
        if not isinstance(values, list) or len(values) < minimum:
            self.error("required_refs", path, f"至少需要 {minimum} 个引用")
            return
        for i, ref in enumerate(values):
            if not isinstance(ref, str) or ref not in known:
                self.error("unknown_reference", f"{path}[{i}]", f"引用未登记的编号：{ref}")

    def date_field(self, parent, key: str, path: str):
        value = self.field(parent, key, path)
        if value:
            try:
                date.fromisoformat(value)
            except ValueError:
                self.error("invalid_date", path, "日期格式应为 YYYY-MM-DD")
        return value

    def local_path(self, value: str, path: str, *, minimum_size: int = 1) -> Path | None:
        if not value or not isinstance(value, str):
            self.error("required_path", path, "需要项目目录中的相对路径")
            return None
        parsed = urlparse(value)
        if parsed.scheme or value.startswith("/"):
            self.error("invalid_path", path, "交付物必须使用项目目录内的相对路径")
            return None
        target = (self.root / unquote(parsed.path)).resolve()
        if not target.is_relative_to(self.root):
            self.error("path_escape", path, "路径越出了项目目录")
            return None
        if not target.is_file():
            self.error("missing_file", path, f"文件不存在：{value}")
            return None
        if target.stat().st_size < minimum_size:
            self.error("empty_file", path, f"文件内容过短：{value}")
        return target

    def document(self, parent, key: str, path: str) -> Path | None:
        value = self.field(parent, key, path)
        return self.local_path(value, path, minimum_size=20) if value else None

    def document_tokens(self, document: Path | None, tokens: list[str], path: str):
        if not document or document.suffix.lower() != ".md":
            return
        content = document.read_text(encoding="utf-8", errors="replace")
        for token in sorted({x for x in tokens if x}):
            if token not in content:
                self.error("document_mismatch", path, f"文档缺少应有的编号、版本或章节：{token}")
        if re.search(r"\{\{[^}]+\}\}|待填写|示意", content):
            self.error("template_residue", path, "文档仍含模板占位符或示意内容")

    def evidence(self, parent, key: str, path: str):
        value = self.field(parent, key, path)
        if not value:
            return
        parsed = urlparse(value)
        if parsed.scheme in {"https", "http"}:
            self.warning("external_evidence", path, "外部证据链接须人工打开核实")
        elif parsed.scheme:
            self.error("invalid_evidence", path, "证据应为项目内文件或 http(s) 链接")
        else:
            self.local_path(value, path)

    def html_links(self, entry: Path | None, path: str):
        if not entry or entry.suffix.lower() != ".html":
            return
        parser = Links()
        try:
            parser.feed(entry.read_text(encoding="utf-8", errors="replace"))
        except OSError:
            return
        for ref in parser.refs:
            parsed = urlparse(ref)
            if parsed.scheme or ref.startswith(("#", "//")):
                continue
            target = (entry.parent / unquote(parsed.path)).resolve()
            if not target.is_relative_to(self.root) or not target.exists():
                self.error("broken_prototype_link", path, f"原型本地链接失效：{ref}")

    def check_stage2(self):
        project = self.obj(self.record, "project", "project")
        self.fields(project, ["id", "name", "client"], "project")
        s2 = self.obj(self.record, "stage2", "stage2")
        contact = self.obj(s2, "contactForm", "stage2.contactForm")
        contact_doc = self.document(contact, "document", "stage2.contactForm.document")
        rounds = self.items(contact, "rounds", "stage2.contactForm.rounds")
        round_ids, req_ids, process_count, data_count = [], set(), 0, 0
        for i, row in enumerate(rounds):
            p = f"stage2.contactForm.rounds[{i}]"
            if not isinstance(row, dict):
                self.error("required_object", p, "轮次应为对象")
                continue
            round_ids.append(self.field(row, "id", p + ".id"))
            self.date_field(row, "date", p + ".date")
            self.items(row, "participants", p + ".participants")
            self.fields(row, ["decisionMaker", "businessOwner", "operator", "itContact", "businessGoal", "scenario", "conclusion", "acceptanceDraft"], p)
            for j, req in enumerate(self.items(row, "requirements", p + ".requirements", 0)):
                q = f"{p}.requirements[{j}]"
                if not isinstance(req, dict):
                    self.error("required_object", q, "需求应为对象")
                    continue
                self.fields(req, ["id", "description", "priority"], q)
                if req.get("id"):
                    req_ids.add(req["id"])
                if not isinstance(req.get("inScope"), bool) or not isinstance(req.get("involvesAi"), bool):
                    self.error("required_boolean", q, "本期范围和是否涉及AI应为布尔值")
            for j, node in enumerate(self.items(row, "processNodes", p + ".processNodes", 0)):
                q = f"{p}.processNodes[{j}]"
                self.fields(node, ["id", "role", "input", "action", "output", "system", "exception"], q)
                process_count += 1
            for j, item in enumerate(self.items(row, "dataItems", p + ".dataItems", 0)):
                q = f"{p}.dataItems[{j}]"
                self.fields(item, ["id", "name", "sourceSystem", "availability", "owner"], q)
                data_count += 1
            confirmation = self.obj(row, "confirmation", p + ".confirmation")
            if confirmation.get("status") != "confirmed":
                self.error("round_unconfirmed", p + ".confirmation.status", "每轮需要当轮确认")
            self.evidence(confirmation, "evidence", p + ".confirmation.evidence")
        self.unique(round_ids, "stage2.contactForm.rounds")
        if not req_ids:
            self.error("missing_requirement", "stage2.contactForm.rounds", "至少登记一条需求")
        if not process_count:
            self.error("missing_process", "stage2.contactForm.rounds", "至少登记一个业务流程节点")
        if not data_count:
            self.error("missing_data", "stage2.contactForm.rounds", "至少登记一项数据及可提供性")
        self.document_tokens(contact_doc, round_ids + sorted(req_ids), "stage2.contactForm.document")

        ai = self.obj(s2, "aiCapabilities", "stage2.aiCapabilities")
        ai_doc = self.document(ai, "document", "stage2.aiCapabilities.document")
        ai_ids = []
        for i, item in enumerate(self.items(ai, "items", "stage2.aiCapabilities.items")):
            p = f"stage2.aiCapabilities.items[{i}]"
            self.fields(item, ["id", "name", "description", "input", "output", "judge", "priority", "fallback"], p)
            ai_ids.append(item.get("id", ""))
            self.refs(item.get("requirementIds"), req_ids, p + ".requirementIds")
            self.items(item, "dataDependencies", p + ".dataDependencies")
            metric = self.obj(item, "metric", p + ".metric")
            self.fields(metric, ["name", "target", "method"], p + ".metric")
        self.unique(ai_ids, "stage2.aiCapabilities.items")
        self.document_tokens(ai_doc, ai_ids + sorted(req_ids), "stage2.aiCapabilities.document")
        self.evidence(ai, "reviewEvidence", "stage2.aiCapabilities.reviewEvidence")

        pack = self.obj(s2, "prototypePackage", "stage2.prototypePackage")
        entry = self.document(pack, "prototypeEntry", "stage2.prototypePackage.prototypeEntry")
        self.html_links(entry, "stage2.prototypePackage.prototypeEntry")
        self.field(pack, "version", "stage2.prototypePackage.version")
        features = self.items(pack, "features", "stage2.prototypePackage.features")
        feature_ids = []
        for i, item in enumerate(features):
            p = f"stage2.prototypePackage.features[{i}]"
            self.fields(item, ["id", "name", "page", "description", "priority"], p)
            feature_ids.append(item.get("id", ""))
            self.refs(item.get("requirementIds"), req_ids, p + ".requirementIds")
            page = item.get("page", "")
            if page:
                self.local_path(page, p + ".page", minimum_size=20)
            agent = self.obj(item, "agent", p + ".agent")
            self.field(agent, "value", p + ".agent.value")
            if agent.get("status") not in {"proposed", "confirmed"}:
                self.error("invalid_status", p + ".agent.status", "应为 proposed 或 confirmed")
            if agent.get("status") == "proposed":
                self.field(agent, "owner", p + ".agent.owner")
            deps = self.items(item, "dataDependencies", p + ".dataDependencies")
            for j, dep in enumerate(deps):
                q = f"{p}.dataDependencies[{j}]"
                self.field(dep, "value", q + ".value")
                if dep.get("status") not in {"proposed", "confirmed"}:
                    self.error("invalid_status", q + ".status", "应为 proposed 或 confirmed")
                if dep.get("status") == "proposed":
                    self.field(dep, "owner", q + ".owner")
        self.unique(feature_ids, "stage2.prototypePackage.features")
        self.evidence(pack, "demoEvidence", "stage2.prototypePackage.demoEvidence")
        self.evidence(pack, "businessApprovalEvidence", "stage2.prototypePackage.businessApprovalEvidence")
        return req_ids, set(feature_ids)

    def check_stage3(self, req_ids: set[str], feature_ids: set[str]):
        s3 = self.obj(self.record, "stage3", "stage3")
        final = self.obj(s3, "finalRequirements", "stage3.finalRequirements")
        final_doc = self.document(final, "document", "stage3.finalRequirements.document")
        req_version = self.field(final, "version", "stage3.finalRequirements.version")
        self.refs(final.get("requirementIds"), req_ids, "stage3.finalRequirements.requirementIds")
        self.refs(final.get("excludedRequirementIds"), req_ids, "stage3.finalRequirements.excludedRequirementIds", 0)
        final_reqs = set(final.get("requirementIds", []))
        excluded = set(final.get("excludedRequirementIds", []))
        if final_reqs & excluded:
            self.error("contradictory_scope", "stage3.finalRequirements", "同一需求不能同时纳入和排除")
        if req_ids - final_reqs - excluded:
            self.error("unresolved_scope", "stage3.finalRequirements", "阶段二需求尚未决定纳入或排除")
        criteria = self.items(final, "acceptanceCriteria", "stage3.finalRequirements.acceptanceCriteria")
        criterion_ids = []
        for i, item in enumerate(criteria):
            p = f"stage3.finalRequirements.acceptanceCriteria[{i}]"
            self.fields(item, ["id", "name", "target", "method"], p)
            criterion_ids.append(item.get("id", ""))
        self.unique(criterion_ids, "stage3.finalRequirements.acceptanceCriteria")
        self.document_tokens(final_doc, sorted(final_reqs) + criterion_ids + [req_version], "stage3.finalRequirements.document")
        approval = self.obj(final, "approval", "stage3.finalRequirements.approval")
        if approval.get("status") != "confirmed":
            self.error("unsigned_requirements", "stage3.finalRequirements.approval.status", "最终需求须已确认")
        self.items(approval, "roles", "stage3.finalRequirements.approval.roles", 4)
        self.evidence(approval, "evidence", "stage3.finalRequirements.approval.evidence")

        plan = self.obj(s3, "implementationPlan", "stage3.implementationPlan")
        plan_doc = self.document(plan, "document", "stage3.implementationPlan.document")
        tasks = self.items(plan, "tasks", "stage3.implementationPlan.tasks")
        task_ids = []
        for i, task in enumerate(tasks):
            p = f"stage3.implementationPlan.tasks[{i}]"
            self.fields(task, ["id", "name", "phase", "owner", "deliverable", "status"], p)
            task_ids.append(task.get("id", ""))
            start = self.date_field(task, "start", p + ".start")
            end = self.date_field(task, "end", p + ".end")
            if start and end and end < start:
                self.error("invalid_schedule", p, "完成日期不能早于开始日期")
            if not isinstance(task.get("durationDays"), (int, float)) or task.get("durationDays") <= 0:
                self.error("invalid_duration", p + ".durationDays", "工期须为正数")
        self.unique(task_ids, "stage3.implementationPlan.tasks")
        known_tasks = set(task_ids)
        task_graph = {}
        for i, task in enumerate(tasks):
            p = f"stage3.implementationPlan.tasks[{i}].dependencyIds"
            self.refs(task.get("dependencyIds"), known_tasks, p, 0)
            task_graph[task.get("id", "")] = task.get("dependencyIds", [])
        visiting, visited = set(), set()

        def walk(task_id):
            if task_id in visiting:
                self.error("dependency_cycle", "stage3.implementationPlan.tasks", "任务前置依赖存在循环")
                return
            if task_id in visited or task_id not in task_graph:
                return
            visiting.add(task_id)
            for parent in task_graph[task_id]:
                walk(parent)
            visiting.remove(task_id)
            visited.add(task_id)

        for task_id in task_graph:
            walk(task_id)
        for i, item in enumerate(self.items(plan, "milestones", "stage3.implementationPlan.milestones")):
            p = f"stage3.implementationPlan.milestones[{i}]"
            self.fields(item, ["id", "name", "owner", "deliverable", "acceptance"], p)
            self.date_field(item, "date", p + ".date")
        self.document_tokens(plan_doc, task_ids, "stage3.implementationPlan.document")
        self.evidence(plan, "reviewEvidence", "stage3.implementationPlan.reviewEvidence")

        data = self.obj(s3, "dataMetrics", "stage3.dataMetrics")
        data_doc = self.document(data, "document", "stage3.dataMetrics.document")
        global_rules = self.obj(data, "globalRules", "stage3.dataMetrics.globalRules")
        self.fields(global_rules, ["filter", "dedup", "time", "unitPrecision", "access"], "stage3.dataMetrics.globalRules")
        dataset_ids = []
        for i, item in enumerate(self.items(data, "datasets", "stage3.dataMetrics.datasets")):
            p = f"stage3.dataMetrics.datasets[{i}]"
            self.fields(item, ["id", "name", "sourceSystem", "grainKey", "updateFrequency", "owner"], p)
            dataset_ids.append(item.get("id", ""))
            if item.get("type") not in {"standard", "new"}:
                self.error("invalid_dataset_type", p + ".type", "应为 standard 或 new")
            elif item["type"] == "standard":
                self.field(item, "standardVersion", p + ".standardVersion")
            else:
                self.field(item, "sql", p + ".sql")
                for j, field_detail in enumerate(self.items(item, "fieldDetails", p + ".fieldDetails")):
                    self.fields(field_detail, ["code", "source", "type", "sensitivity", "access"], f"{p}.fieldDetails[{j}]")
        self.unique(dataset_ids, "stage3.dataMetrics.datasets")
        metric_ids = []
        for i, item in enumerate(self.items(data, "metrics", "stage3.dataMetrics.metrics")):
            p = f"stage3.dataMetrics.metrics[{i}]"
            self.fields(item, ["id", "name", "type", "calculation", "sourceTableFields", "sql", "exampleValue", "owner"], p)
            metric_ids.append(item.get("id", ""))
            self.refs(item.get("datasetIds"), set(dataset_ids), p + ".datasetIds")
        self.unique(metric_ids, "stage3.dataMetrics.metrics")
        self.document_tokens(data_doc, dataset_ids + metric_ids, "stage3.dataMetrics.document")
        self.evidence(data, "reviewEvidence", "stage3.dataMetrics.reviewEvidence")

        design = self.obj(s3, "agentDesign", "stage3.agentDesign")
        design_doc = self.document(design, "indexDocument", "stage3.agentDesign.indexDocument")
        agents = self.items(design, "agents", "stage3.agentDesign.agents")
        agent_ids = [a.get("id", "") for a in agents if isinstance(a, dict)]
        self.unique(agent_ids, "stage3.agentDesign.agents")
        for i, agent in enumerate(agents):
            p = f"stage3.agentDesign.agents[{i}]"
            self.fields(agent, ["id", "name", "purpose", "user", "successCriterionId", "playbook", "boundaries", "exceptions"], p)
            agent_doc = self.document(agent, "document", p + ".document")
            self.refs(agent.get("requirementIds"), final_reqs, p + ".requirementIds")
            self.refs(agent.get("featureIds"), feature_ids, p + ".featureIds")
            self.refs([agent.get("successCriterionId")], set(criterion_ids), p + ".successCriterionId")
            for j, node in enumerate(self.items(agent, "workflow", p + ".workflow")):
                self.fields(node, ["id", "input", "action", "output"], f"{p}.workflow[{j}]")
            comp = self.obj(agent, "components", p + ".components")
            self.fields(comp, ["expert", "prompt", "memory"], p + ".components")
            for key in ["knowledge", "skills", "connectors"]:
                selected = self.items(comp, key, p + ".components." + key, 0)
                if not selected:
                    self.field(comp, key + "Decision", p + ".components." + key + "Decision")
            self.refs(agent.get("upstreamIds"), set(agent_ids), p + ".upstreamIds", 0)
            self.refs(agent.get("downstreamIds"), set(agent_ids), p + ".downstreamIds", 0)
            ab = self.obj(agent, "abTest", p + ".abTest")
            if ab.get("status") not in {"done", "not_applicable"}:
                self.error("invalid_ab_status", p + ".abTest.status", "A/B 状态应为 done 或 not_applicable")
            if ab.get("status") == "done":
                self.evidence(ab, "evidence", p + ".abTest.evidence")
            elif ab.get("status") == "not_applicable":
                self.field(ab, "reason", p + ".abTest.reason")
            ev = self.obj(agent, "eval", p + ".eval")
            self.refs([ev.get("criterionId")], set(criterion_ids), p + ".eval.criterionId")
            self.field(ev, "result", p + ".eval.result")
            if ev.get("passed") is not True:
                self.error("eval_not_passed", p + ".eval.passed", "实际评测须达到项目约定验收线")
            self.evidence(ev, "evidence", p + ".eval.evidence")
            self.evidence(agent, "expertApprovalEvidence", p + ".expertApprovalEvidence")
            self.document_tokens(agent_doc, [agent.get("id"), agent.get("successCriterionId")] + agent.get("requirementIds", []) + agent.get("featureIds", []), p + ".document")
        self.document_tokens(design_doc, agent_ids, "stage3.agentDesign.indexDocument")
        by_id = {a.get("id"): a for a in agents if isinstance(a, dict)}
        for agent in agents:
            if not isinstance(agent, dict):
                continue
            for target in agent.get("downstreamIds", []):
                if target in by_id and agent.get("id") not in by_id[target].get("upstreamIds", []):
                    self.error("unmatched_agent_link", "stage3.agentDesign.agents", f"{agent.get('id')}→{target} 未在下游的 upstreamIds 对应登记")

        prd = self.obj(s3, "prdFinal", "stage3.prdFinal")
        final_prd_doc = self.document(prd, "document", "stage3.prdFinal.document")
        prd_version = self.field(prd, "version", "stage3.prdFinal.version")
        if prd.get("requirementsVersion") != req_version:
            self.error("version_mismatch", "stage3.prdFinal.requirementsVersion", "PRD须关联最终需求版本")
        self.fields(prd, ["goalLayer", "featureLayer", "interactionLayer"], "stage3.prdFinal")
        final_features = self.items(prd, "features", "stage3.prdFinal.features")
        final_feature_ids = []
        for i, feature in enumerate(final_features):
            p = f"stage3.prdFinal.features[{i}]"
            self.fields(feature, ["id", "name", "page", "description", "priority", "agentId"], p)
            final_feature_ids.append(feature.get("id", ""))
            self.refs([feature.get("id")], feature_ids, p + ".id")
            self.refs(feature.get("requirementIds"), final_reqs, p + ".requirementIds")
            if feature.get("page"):
                self.local_path(feature["page"], p + ".page", minimum_size=20)
            if feature.get("agentId") == "none":
                self.field(feature, "agentNoneReason", p + ".agentNoneReason")
            else:
                self.refs([feature.get("agentId")], set(agent_ids), p + ".agentId")
                if feature.get("agentId") in by_id and feature.get("id") not in by_id[feature["agentId"]].get("featureIds", []):
                    self.error("agent_feature_mismatch", p + ".agentId", "智能体设计表未登记该功能")
            deps = feature.get("dataDatasetIds")
            if deps:
                self.refs(deps, set(dataset_ids), p + ".dataDatasetIds")
            else:
                self.field(feature, "noDataReason", p + ".noDataReason")
        self.unique(final_feature_ids, "stage3.prdFinal.features")
        self.document_tokens(final_prd_doc, final_feature_ids + sorted(final_reqs) + [prd_version, "目标层", "功能层", "交互层"], "stage3.prdFinal.document")
        self.refs(prd.get("excludedFeatureIds"), feature_ids, "stage3.prdFinal.excludedFeatureIds", 0)
        excluded_features = set(prd.get("excludedFeatureIds", []))
        if set(final_feature_ids) & excluded_features:
            self.error("contradictory_feature_scope", "stage3.prdFinal", "同一功能不能同时定稿和排除")
        self.evidence(prd, "reviewEvidence", "stage3.prdFinal.reviewEvidence")

        proto = self.obj(s3, "prototypeFinal", "stage3.prototypeFinal")
        proto_doc = self.document(proto, "indexDocument", "stage3.prototypeFinal.indexDocument")
        entry = self.document(proto, "entry", "stage3.prototypeFinal.entry")
        self.html_links(entry, "stage3.prototypeFinal.entry")
        self.field(proto, "version", "stage3.prototypeFinal.version")
        if proto.get("requirementsVersion") != req_version or proto.get("prdVersion") != prd_version:
            self.error("version_mismatch", "stage3.prototypeFinal", "原型须关联最终需求及PRD版本")
        self.refs(proto.get("featureIds"), feature_ids, "stage3.prototypeFinal.featureIds")
        if set(proto.get("featureIds", [])) != set(final_feature_ids):
            self.error("feature_mismatch", "stage3.prototypeFinal.featureIds", "定稿原型和PRD功能清单不一致")
        self.document_tokens(proto_doc, proto.get("featureIds", []) + [proto.get("version", ""), req_version, prd_version], "stage3.prototypeFinal.indexDocument")
        self.evidence(proto, "smokeTestEvidence", "stage3.prototypeFinal.smokeTestEvidence")
        self.evidence(proto, "businessApprovalEvidence", "stage3.prototypeFinal.businessApprovalEvidence")

        # Stage-2 records remain historical drafts. Their proposed values are
        # resolved in the stage-3 PRD; do not rewrite the old round record.
        if (set(final_feature_ids) | excluded_features) != feature_ids:
            self.error("unresolved_feature_scope", "stage3.prdFinal.features", "阶段二功能须在定稿PRD中逐项确认或明确排除")
        for path, value in self.walk_strings(s3, "stage3"):
            if PENDING.search(value):
                self.error("pending_stage3_value", path, "阶段三交付中仍有待确认或待补内容")

        self.manual.extend([
            "核实客户及相关方的真实签字或有效确认记录",
            "核实信息科提供的SQL与库表字段、访问权限和数据口径",
            "核实各智能体真实Eval结果、项目验收线及业务专家确认",
            "实际打开定稿原型并走查关键业务流程",
        ])

    def walk_strings(self, value, path):
        if isinstance(value, dict):
            for key, child in value.items():
                yield from self.walk_strings(child, f"{path}.{key}")
        elif isinstance(value, list):
            for i, child in enumerate(value):
                yield from self.walk_strings(child, f"{path}[{i}]")
        elif isinstance(value, str):
            yield path, value

    def run(self) -> dict:
        if self.record.get("schemaVersion") != "0.1":
            self.error("schema_version", "schemaVersion", "需要版本 0.1")
        req_ids, feature_ids = self.check_stage2()
        self.manual.extend([
            "核实每轮沟通的客户确认与未决事项",
            "核实AI能力目标和原型演示是否获业务方认可",
        ])
        if self.stage == 3:
            self.check_stage3(req_ids, feature_ids)
        return {
            "stage": self.stage,
            "automatedPassed": not self.errors,
            "humanReviewRequired": True,
            "errors": self.errors,
            "warnings": self.warnings,
            "manualChecks": self.manual,
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project_dir", type=Path)
    parser.add_argument("--stage", type=int, choices=[2, 3], required=True)
    parser.add_argument("--record", default="project-record.json")
    args = parser.parse_args()
    root = args.project_dir.resolve()
    record_path = root / args.record
    try:
        data = json.loads(record_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"automatedPassed": False, "errors": [{"code": "record_read", "path": str(record_path), "message": str(exc)}]}, ensure_ascii=False, indent=2))
        return 2
    result = Validator(root, data, args.stage).run()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["automatedPassed"] else 1


if __name__ == "__main__":
    sys.exit(main())
