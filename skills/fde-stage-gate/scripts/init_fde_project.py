#!/usr/bin/env python3
"""Create empty FDE stage-2/3 project files without overwriting existing work."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


TEMPLATE_FILES = {
    "templates/stage2/contact-form.md": "stage2/contact-form.md",
    "templates/stage2/ai-capability.md": "stage2/ai-capability.md",
    "templates/stage2/prd.md": "stage2/prd.md",
    "templates/stage2/feature-spec.md": "spec.md",
    "templates/stage2/prototype-handoff.md": "stage2/prototype-handoff.md",
    "templates/stage3/final-req.md": "stage3/final-req.md",
    "templates/stage3/agent-design.md": "stage3/agent-design.md",
    "templates/stage3/impl-plan.md": "stage3/impl-plan.md",
    "templates/stage3/data-metric.md": "stage3/data-metric.md",
    "templates/stage3/prd-final.md": "stage3/prd.md",
    "templates/stage3/prototype-final.md": "stage3/prototype-final.md",
    "project-record.template.json": "project-record.json",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project_dir", type=Path)
    args = parser.parse_args()
    kit = Path(__file__).resolve().parent
    project = args.project_dir.resolve()
    project.mkdir(parents=True, exist_ok=True)
    created, kept = [], []
    for source, target in TEMPLATE_FILES.items():
        dst = project / target
        dst.parent.mkdir(parents=True, exist_ok=True)
        if dst.exists():
            kept.append(target)
            continue
        shutil.copyfile(kit / source, dst)
        created.append(target)
    print(f"项目目录：{project}")
    print(f"新建 {len(created)} 个空白文件；保留 {len(kept)} 个现有文件。")
    print("原型本体须由原型 Skill 生成；空白说明文件不能代替可运行原型。")


if __name__ == "__main__":
    main()
