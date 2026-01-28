#!/usr/bin/env python3
"""
Eyecite citation extraction script for Motion Granted.
Called from Node.js via child_process.

Usage:
    python3 scripts/eyecite_extract.py < input.txt > output.json

Input: Raw text via stdin
Output: JSON array of citations to stdout

Task E-1 | Version 1.0 — January 28, 2026
"""

import json
import sys
from typing import Any

try:
    from eyecite import get_citations, resolve_citations
    from eyecite.clean import clean_text
    from eyecite.models import (
        FullCaseCitation,
        ShortCaseCitation,
        IdCitation,
        SupraCitation,
        FullLawCitation,
        IbidCitation,
    )
except ImportError:
    print(json.dumps({
        "error": "eyecite not installed. Run: pip install eyecite",
        "citations": []
    }))
    sys.exit(1)


def get_citation_type(cite: Any) -> str:
    """Map Eyecite citation class to our type string."""
    type_map = {
        FullCaseCitation: "FULL_CASE",
        ShortCaseCitation: "SHORT_CASE",
        IdCitation: "ID",
        IbidCitation: "IBID",
        SupraCitation: "SUPRA",
        FullLawCitation: "STATUTE",
    }
    return type_map.get(type(cite), "UNKNOWN")


def safe_get(obj: Any, attr: str, default: Any = None) -> Any:
    """Safely get attribute or dict key."""
    if hasattr(obj, attr):
        return getattr(obj, attr, default)
    if isinstance(obj, dict):
        return obj.get(attr, default)
    return default


def extract_citations(text: str) -> list[dict]:
    """
    Extract all citations from text using Eyecite.

    Returns list of citation objects with structured data.
    """
    # Step 1: Clean text (handles OCR errors, whitespace issues)
    cleaned = clean_text(text, ["html", "inline_whitespace", "underscores"])

    # Step 2: Extract citations
    citations = get_citations(cleaned)

    # Step 3: Resolve Id./supra references to their antecedents
    resolved = resolve_citations(citations)

    # Build mapping from citation to resolved antecedent
    antecedent_map = {}
    for cite in resolved:
        if hasattr(cite, "antecedent") and cite.antecedent:
            # Use string representation as key for now
            antecedent_map[str(cite)] = str(cite.antecedent)

    # Step 4: Convert to our schema
    results = []
    for i, cite in enumerate(citations):
        # Get groups (volume, reporter, page)
        groups = getattr(cite, "groups", {}) or {}

        # Get metadata (year, court, plaintiff, defendant, pin_cite)
        metadata = getattr(cite, "metadata", None)

        citation_obj = {
            "index": i,
            "raw": str(cite),
            "citation_type": get_citation_type(cite),
            "volume": groups.get("volume"),
            "reporter": groups.get("reporter"),
            "page": groups.get("page"),
            "pinpoint": safe_get(metadata, "pin_cite"),
            "year": safe_get(metadata, "year"),
            "court": safe_get(metadata, "court"),
            "plaintiff": safe_get(metadata, "plaintiff"),
            "defendant": safe_get(metadata, "defendant"),
            "case_name": None,  # Construct from plaintiff/defendant if available
            "span": [cite.span()[0], cite.span()[1]] if hasattr(cite, "span") else None,
            "antecedent": antecedent_map.get(str(cite)),
        }

        # Construct case name if we have parties
        if citation_obj["plaintiff"] and citation_obj["defendant"]:
            citation_obj["case_name"] = f"{citation_obj['plaintiff']} v. {citation_obj['defendant']}"

        results.append(citation_obj)

    return results


def main():
    """Main entry point - read from stdin, write JSON to stdout."""
    # Read all input from stdin
    text = sys.stdin.read()

    if not text.strip():
        print(json.dumps({"citations": [], "count": 0}))
        return

    try:
        citations = extract_citations(text)
        output = {
            "citations": citations,
            "count": len(citations),
        }
        print(json.dumps(output, indent=2))
    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "citations": [],
            "count": 0,
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
