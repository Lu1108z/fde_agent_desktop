#!/usr/bin/env python3
"""Run the full FDE stage gate, including deliverable-specific checks."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from check_deliverable import extra_checks
from validate_fde import Validator


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project_dir", type=Path)
    parser.add_argument("--stage", type=int, choices=(2, 3), required=True)
    args = parser.parse_args()
    root = args.project_dir.resolve()
    try:
        record = json.loads((root / "project-record.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"automatedPassed": False, "errors": [{"code": "record_read", "message": str(exc)}]}, ensure_ascii=False, indent=2))
        return 2
    result = Validator(root, record, args.stage).run()
    items = ["S2-1", "S2-2", "S2-3"] + (["S3-2", "S3-3", "S3-4", "S3-1", "S3-5", "S3-6"] if args.stage == 3 else [])
    for item in items:
        extra_checks(item, record, result["errors"])
    result["errors"] = list({(x["code"], x["path"], x["message"]): x for x in result["errors"]}.values())
    result["automatedPassed"] = not result["errors"]
    result["itemsChecked"] = items
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["automatedPassed"] else 1


if __name__ == "__main__":
    sys.exit(main())
