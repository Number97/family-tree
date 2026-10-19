#!/usr/bin/env python3
"""Check the family data for broken links and impossible dates.

Usage: python3 scripts/validate.py [path/to/family.json]
Exits with status 1 when there are errors (warnings alone are fine).
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

DATE_RE = re.compile(r"^~?(\d{4})(-(\d{2})(-(\d{2}))?)?$")
ROOT = Path(__file__).resolve().parent.parent
DEFAULT = ROOT / "data" / "family.json"


def year(value):
    m = DATE_RE.match(value or "")
    return int(m.group(1)) if m else None


def validate(data):
    errors, warnings = [], []
    people = data.get("people", {})
    unions = data.get("unions", {})

    def name(pid):
        return (people.get(pid) or {}).get("name") or pid

    if data.get("root") not in unions:
        errors.append(f"root union '{data.get('root')}' does not exist")

    for pid, p in people.items():
        if not isinstance(p, dict):
            errors.append(f"{pid}: person must be an object")
            continue
        for field in ("birth", "death"):
            if p.get(field) and not DATE_RE.match(p[field]):
                errors.append(f"{name(pid)}: {field} '{p[field]}' is not YYYY, YYYY-MM or YYYY-MM-DD")
        if p.get("gender") not in (None, "m", "f"):
            errors.append(f"{name(pid)}: gender must be 'm', 'f' or absent")
        b, d = year(p.get("birth")), year(p.get("death"))
        if b and d and d < b:
            errors.append(f"{name(pid)}: death ({d}) is before birth ({b})")
        if not (p.get("name") or "").strip():
            warnings.append(f"{pid}: has no name")

    child_of = Counter()
    linked = set()
    for uid, u in unions.items():
        partners, children = u.get("partners", []), u.get("children", [])
        if len(partners) > 2:
            errors.append(f"union {uid}: more than two partners")
        if u.get("status") not in (None, "married", "partner", "separated"):
            errors.append(f"union {uid}: status must be married, partner or separated")
        if u.get("start") and not DATE_RE.match(u["start"]):
            errors.append(f"union {uid}: start '{u['start']}' is not a valid date")
        for pid in partners + children:
            if pid not in people:
                errors.append(f"union {uid}: refers to missing person '{pid}'")
            linked.add(pid)
        for pid in set(partners) & set(children):
            errors.append(f"union {uid}: {name(pid)} is both a partner and a child")
        for c in children:
            child_of[c] += 1
            cb = year((people.get(c) or {}).get("birth"))
            for par in partners:
                pp = people.get(par) or {}
                pb, pd = year(pp.get("birth")), year(pp.get("death"))
                if cb and pb and cb <= pb:
                    errors.append(f"{name(c)} ({cb}) is not younger than parent {name(par)} ({pb})")
                elif cb and pb and cb - pb < 12:
                    warnings.append(f"{name(c)} born only {cb - pb} years after parent {name(par)}")
                if cb and pd and cb > pd + 1:
                    warnings.append(f"{name(c)} born after parent {name(par)} died")
        if not partners and len(children) < 2:
            warnings.append(f"union {uid}: has no partners and fewer than two children")

    for pid, n in child_of.items():
        if n > 1:
            errors.append(f"{name(pid)} is a child in {n} different families")

    # Everyone should be connected to the centre couple.
    root = unions.get(data.get("root"), {})
    seen, stack = set(), list(root.get("partners", []))
    neighbours = {}
    for u in unions.values():
        members = u.get("partners", []) + u.get("children", [])
        for a in members:
            neighbours.setdefault(a, set()).update(members)
    while stack:
        pid = stack.pop()
        if pid in seen:
            continue
        seen.add(pid)
        stack.extend(neighbours.get(pid, ()))
    for pid in people:
        if pid not in seen:
            warnings.append(f"{name(pid)} is not connected to the rest of the tree")

    names = Counter((p.get("name") or "").strip().lower() for p in people.values() if (p.get("name") or "").strip())
    for n, c in names.items():
        if c > 1:
            warnings.append(f"'{n}' appears {c} times — duplicate?")
    return errors, warnings


def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(f"error: cannot read {path}: {e}")
        return 1
    errors, warnings = validate(data)
    for w in warnings:
        print(f"warning: {w}")
    for e in errors:
        print(f"error: {e}")
    people = len(data.get("people", {}))
    print(f"{people} people, {len(data.get('unions', {}))} families — " + ("OK" if not errors else f"{len(errors)} error(s)"))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
