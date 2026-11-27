#!/usr/bin/env python3
"""Read-only public skills.sh discovery. No package install or telemetry."""
import argparse
import json
import re
import urllib.parse
import urllib.request

BASE = "https://skills.sh/api/search"
IDENT = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\Z")
QUERY = re.compile(r"[A-Za-z0-9][A-Za-z0-9 +_.-]{0,119}\Z")
MAX_BYTES = 1024 * 1024

def query_url(query, owner=None):
    if not QUERY.fullmatch(query) or any(x in query.lower() for x in ("password", "token", "secret", "private key", "patient")):
        raise ValueError("Use generic technical keywords only; no secrets or private data")
    params = {"q": query}
    if owner:
        if not IDENT.fullmatch(owner) or owner in (".", ".."):
            raise ValueError("Invalid public GitHub owner")
        params["owner"] = owner
    return BASE + "?" + urllib.parse.urlencode(params)

def normalize(data, limit=10):
    if not isinstance(data, dict) or not isinstance(data.get("skills"), list):
        raise ValueError("Unexpected search response")
    candidates = []
    seen = set()
    for item in data["skills"]:
        if not isinstance(item, dict):
            continue
        source, slug = item.get("source"), item.get("id")
        if not isinstance(source, str) or not isinstance(slug, str):
            continue
        parts = source.split("/")
        ids = slug.split("/")
        if len(parts) != 2 or len(ids) != 3 or ids[:2] != parts:
            continue
        if not all(IDENT.fullmatch(x) and x not in (".", "..") for x in ids):
            continue
        key = slug.lower()
        if key in seen:
            continue
        seen.add(key)
        count = item.get("installs")
        candidates.append({"skill": ids[-1], "source": source,
                           "catalog": "https://skills.sh/" + slug,
                           "repository": "https://github.com/" + source,
                           "installs": count if type(count) is int and count >= 0 else None,
                           "review_required": True, "cost": "unverified",
                           "installation_allowed": False})
        if len(candidates) >= limit:
            break
    return candidates

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def search(query, owner=None, limit=10):
    url = query_url(query, owner)
    opener = urllib.request.build_opener(NoRedirect())
    with opener.open(urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "skill-discovery-readonly/1"}), timeout=12) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("Search response exceeds limit")
    return normalize(json.loads(raw), limit)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query", help="Generic English technical keywords, no private data")
    parser.add_argument("--owner")
    parser.add_argument("--limit", type=int, choices=range(1, 21), default=10)
    args = parser.parse_args()
    try:
        result = search(args.query, args.owner, args.limit)
        print(json.dumps({"status": "candidates_found" if result else "no_results", "candidates": result}, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError) as exc:
        print(json.dumps({"status": "blocked", "reason": type(exc).__name__, "fallback": "Search public skills.sh catalog and inspect GitHub source"}))
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
