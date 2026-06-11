#!/usr/bin/env python3
"""CLI wrapper for the complete Trump News Agent skill."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict

from trump_news_agent import run


def _load_metadata(path: str | None) -> Dict[str, Any]:
    if path:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    raw = sys.stdin.read().strip()
    return json.loads(raw) if raw else {}


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the Trump News Agent skill.")
    parser.add_argument("--metadata", help="Path to JSON metadata.")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON.")
    args = parser.parse_args()

    result = run(_load_metadata(args.metadata))
    print(json.dumps(result, indent=2 if args.pretty else None, ensure_ascii=False))
    return 0 if result.get("status") != "error" else 1


if __name__ == "__main__":
    raise SystemExit(main())

