#!/usr/bin/env python3
"""Generate manifest.json for the portfolio site.

`projects.json` is the hand-edited source of truth: which repos to show, in
which category and order, plus optional display overrides. This script adds
live metadata from the GitHub API (description, language, license, default
branch, homepage, stars, last push) and writes `manifest.json`, which the page
loads at view time.

    python3 gen_manifest.py            # uses $GITHUB_TOKEN / $GH_TOKEN if set

If the API can't be reached, the previous manifest's values are reused so the
site never loses data. Public repos that are neither listed nor ignored are
reported, as a reminder to add them.
"""

import fnmatch
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "projects.json")
OUT = os.path.join(HERE, "manifest.json")
API = "https://api.github.com"

# Language -> accent colour (matches the courseware palette where they overlap).
COLORS = {
    "Assembly": "#b07219",
    "C": "#6a737d",
    "Go": "#00add8",
    "JavaScript": "#e3b341",
    "Lua": "#5b5fc7",
    "Python": "#3572a5",
    "Rust": "#dea584",
    "Shell": "#89e051",
    "TypeScript": "#3178c6",
    "Zig": "#f7a41d",
}
DEFAULT_ACCENT = "#8a63d2"

# Fields taken from the API; an entry in projects.json overrides any of them.
API_FIELDS = {
    "description": "description",
    "language": "language",
    "branch": "default_branch",
    "homepage": "homepage",
    "license": None,           # derived from license.spdx_id
    "stars": "stargazers_count",
    "createdAt": "created_at",
    "pushedAt": "pushed_at",
}


def fetch_repos(owner):
    """Return {name: repo} for every public repo of `owner`, or None on failure."""
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "gen_manifest"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    repos, page = {}, 1
    try:
        while True:
            url = f"{API}/users/{owner}/repos?per_page=100&type=owner&page={page}"
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=20) as r:
                batch = json.load(r)
            for repo in batch:
                if not repo.get("private"):
                    repos[repo["name"]] = repo
            if len(batch) < 100:
                return repos
            page += 1
    except (urllib.error.URLError, OSError, ValueError) as err:
        print(f"warning: GitHub API unavailable ({err}); reusing previous manifest values",
              file=sys.stderr)
        return None


def from_api(repo):
    out = {k: repo.get(src) for k, src in API_FIELDS.items() if src}
    lic = repo.get("license") or {}
    out["license"] = lic.get("spdx_id") if lic.get("spdx_id") not in (None, "NOASSERTION") else None
    out["archived"] = bool(repo.get("archived"))
    return out


def load_json(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        return None


def main():
    src = load_json(SRC)
    if not src:
        sys.exit(f"missing {SRC}")
    owner = src["owner"]
    prev = load_json(OUT) or {}
    prev_by_repo = {p["repo"]: p for p in prev.get("projects", [])}
    live = fetch_repos(owner)

    cat_ids = [c["id"] for c in src["categories"]]
    projects, seen = [], set()
    for order, entry in enumerate(src["projects"]):
        name = entry["repo"]
        if name in seen:
            sys.exit(f"error: {name} is listed twice in projects.json")
        seen.add(name)
        if entry.get("category") not in cat_ids:
            sys.exit(f"error: {name} has unknown category {entry.get('category')!r}")

        if live is None:
            base = {k: prev_by_repo.get(name, {}).get(k) for k in list(API_FIELDS) + ["archived"]}
        elif name in live:
            base = from_api(live[name])
        else:
            print(f"warning: {owner}/{name} is not a public repo; skipping it", file=sys.stderr)
            continue

        p = {"repo": name, "title": name, "summary": "", "highlights": []}
        p.update(base)
        p.update({k: v for k, v in entry.items() if v is not None})
        p["branch"] = p.get("branch") or "master"
        p["readme"] = entry.get("readme", "README.md")
        p["accent"] = entry.get("accent") or COLORS.get(p.get("language") or "", DEFAULT_ACCENT)
        p["order"] = order
        projects.append(p)

    if live is not None:
        ignore = src.get("ignore", [])
        extra = sorted(n for n in live
                       if n not in seen and not any(fnmatch.fnmatch(n, pat) for pat in ignore))
        for n in extra:
            print(f"note: public repo {owner}/{n} is not in projects.json "
                  f"(add it, or list it under \"ignore\")", file=sys.stderr)

    used = {p["category"] for p in projects}
    manifest = {
        "generated": None,
        "owner": owner,
        "profile": src.get("profile", {}),
        "categories": [c for c in src["categories"] if c["id"] in used],
        "projects": projects,
    }

    # Only bump the timestamp when something else changed, so scheduled runs
    # don't produce no-op commits.
    old = dict(prev, generated=None) if prev else None
    if old == manifest:
        manifest["generated"] = prev.get("generated")
    else:
        manifest["generated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print(f"wrote {OUT}: {len(projects)} projects in {len(manifest['categories'])} categories")


if __name__ == "__main__":
    main()
