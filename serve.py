#!/usr/bin/env python3
"""Run the family tree locally with editing turned on.

Usage: python3 serve.py [--port 8765] [--no-open]

Edits made in the browser are written straight to data/family.json.
The Publish button commits that file and pushes it to GitHub, which updates the online version.
"""
import argparse
import json
import os
import subprocess
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "family.json"
sys.path.insert(0, str(ROOT / "scripts"))
from validate import validate  # noqa: E402

LOCK = threading.Lock()


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


def dirty():
    return bool(git("status", "--porcelain", "--", str(DATA.relative_to(ROOT))).stdout.strip())


def label(people, pid):
    return ((people.get(pid) or {}).get("name") or "").strip() or "an unnamed person"


def join(names):
    names = list(names)
    if len(names) <= 1:
        return "".join(names)
    if len(names) > 3:
        return f"{', '.join(names[:3])} and {len(names) - 3} more"
    return ", ".join(names[:-1]) + " and " + names[-1]


def describe(old, new):
    """Summarise what changed between two versions of the data as a commit message."""
    op, np_ = old.get("people", {}), new.get("people", {})
    ou, nu = old.get("unions", {}), new.get("unions", {})
    added = [pid for pid in np_ if pid not in op]
    removed = [pid for pid in op if pid not in np_]
    updated = []
    for pid in np_:
        if pid in op and op[pid] != np_[pid]:
            fields = sorted(k for k in set(op[pid]) | set(np_[pid]) if op[pid].get(k) != np_[pid].get(k))
            updated.append((pid, fields))
    links = []
    for uid, u in nu.items():
        before = ou.get(uid)
        if before == u:
            continue
        partners = [label(np_, p) for p in u.get("partners", [])]
        if not before and len(partners) == 2:
            links.append(f"Linked {partners[0]} and {partners[1]} as a couple")
        elif before and before.get("status") != u.get("status") and len(partners) == 2:
            links.append(f"Marked {partners[0]} and {partners[1]} as {u.get('status')}")
        elif before and before.get("start") != u.get("start") and len(partners) == 2:
            links.append(f"Set when {partners[0]} and {partners[1]} got together")
    if new.get("title") != old.get("title"):
        links.append(f"Renamed the tree to \"{new.get('title')}\"")

    parts = []
    if added:
        parts.append("Add " + join(label(np_, p) for p in added))
    if updated:
        parts.append(("update " if parts else "Update ") + join(label(np_, p) for p, _ in updated))
    if removed:
        parts.append(("remove " if parts else "Remove ") + join(label(op, p) for p in removed))
    subject = "; ".join(parts) or (links[0] if links else "Update family tree")
    if len(subject) > 72:
        bits = []
        if added:
            bits.append(f"add {len(added)} {'person' if len(added) == 1 else 'people'}")
        if updated:
            bits.append(f"update {len(updated)}")
        if removed:
            bits.append(f"remove {len(removed)}")
        subject = (", ".join(bits) or "update family tree").capitalize()

    body = []
    for pid in added:
        p = np_[pid]
        extra = ", ".join(x for x in (f"born {p['birth']}" if p.get("birth") else "", f"died {p['death']}" if p.get("death") else "") if x)
        body.append(f"- Added {label(np_, pid)}" + (f" ({extra})" if extra else ""))
    for pid, fields in updated:
        nice = {"birth": "birth date", "death": "death date", "birthName": "birth name", "deceased": "deceased flag"}
        body.append(f"- Updated {label(np_, pid)}: " + ", ".join(nice.get(f, f) for f in fields))
    for pid in removed:
        body.append(f"- Removed {label(op, pid)}")
    body += [f"- {line}" for line in links if line != subject]
    return subject + ("\n\n" + "\n".join(body) if body and not (len(body) == 1 and body[0][2:] == subject) else "")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def log_message(self, fmt, *args):
        if args and "/api/" in str(args[0]):
            return
        super().log_message(fmt, *args)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/status"):
            return self.send_json({"edit": True, "dirty": dirty()})
        if any(part.startswith(".") and part != ".nojekyll" for part in self.path.split("?")[0].split("/")):
            return self.send_error(404)
        return super().do_GET()

    def do_POST(self):
        if self.headers.get("Origin") not in (None, f"http://{self.headers.get('Host')}"):
            return self.send_json({"ok": False, "error": "Forbidden"}, 403)
        if self.path == "/api/data":
            return self.save()
        if self.path == "/api/publish":
            return self.publish()
        return self.send_error(404)

    def save(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length))
            if not isinstance(data.get("people"), dict) or not isinstance(data.get("unions"), dict):
                raise ValueError("missing people/unions")
        except (ValueError, json.JSONDecodeError) as e:
            return self.send_json({"ok": False, "error": str(e)}, 400)
        with LOCK:
            tmp = DATA.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            os.replace(tmp, DATA)
        return self.send_json({"ok": True})

    def publish(self):
        with LOCK:
            new = json.loads(DATA.read_text(encoding="utf-8"))
            errors, _ = validate(new)
            if errors:
                return self.send_json({"ok": False, "error": "Fix this first: " + errors[0]}, 400)
            # Only commit with the identity set for this repo, never a machine-wide one.
            if not git("config", "--local", "user.email").stdout.strip():
                return self.send_json({"ok": False, "error": "No email set for this repo. Run: git config --local user.email you@example.com"}, 400)
            if not dirty():
                push = git("push", "-q")
                if push.returncode != 0:
                    return self.send_json({"ok": False, "error": "Nothing new, and pushing failed: " + push.stderr.strip()[:200]})
                return self.send_json({"ok": True, "message": "Already up to date — nothing new to publish"})
            head = git("show", "HEAD:data/family.json")
            old = json.loads(head.stdout) if head.returncode == 0 else {}
            message = describe(old, new)
            rel = str(DATA.relative_to(ROOT))
            git("add", "--", rel)
            commit = git("commit", "-q", "-m", message, "--", rel)
            if commit.returncode != 0:
                return self.send_json({"ok": False, "error": "Commit failed: " + (commit.stderr or commit.stdout).strip()[:200]})
            push = git("push", "-q")
            if push.returncode != 0:
                return self.send_json({"ok": False, "error": "Saved a commit, but pushing failed: " + push.stderr.strip()[:200]})
        return self.send_json({"ok": True, "message": "Published — online in about a minute"})


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-open", action="store_true", help="don't open the browser")
    args = ap.parse_args()
    server = None
    for port in range(args.port, args.port + 20):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
            break
        except OSError:
            continue
    if not server:
        sys.exit("No free port found")
    url = f"http://localhost:{server.server_address[1]}/"
    print(f"Family tree running at {url}  (press Ctrl+C to stop)")
    if not args.no_open:
        threading.Timer(0.4, webbrowser.open, [url]).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
