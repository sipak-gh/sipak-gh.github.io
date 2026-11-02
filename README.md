# sipak-gh.github.io

A small, dependency-free portfolio of the things I'm building. It shows a home
page of project cards grouped by category and filterable by language. Each
project has its own page, which renders that repo's `README.md` live from
GitHub.

Live site: **https://sipak-gh.github.io/**

It works like [courseware](https://github.com/sipak-gh/courseware), which is
still served at **https://sipak-gh.github.io/courseware/**: there is no build
step and no server code.

## How it works

- `projects.json` is the **hand-edited source of truth**. It lists which repos
  to show, their category and order, and display text.
- `gen_manifest.py` merges it with live metadata from the GitHub API
  (description, language, license, default branch, homepage, stars, last push)
  and writes `manifest.json`.
- `index.html` + `assets/` load `manifest.json` and draw the site. On a project
  page, the README (and any `.md` file it links to) is fetched from
  `raw.githubusercontent.com/<owner>/<repo>/<branch>/…` and rendered in the
  browser with [marked](https://github.com/markedjs/marked) and
  [highlight.js](https://github.com/highlightjs/highlight.js). Links to
  non-Markdown files open on GitHub.

### Routes

```
#/                         home (project cards)
#/<repo>                   project page (renders its README)
#/<repo>/<path.md>         another Markdown file in that repo
#/<repo>/<path.md>::slug   ... scrolled to a heading
```

## Adding a project

1. Make sure the repo is **public** and has a GitHub description. That
   description appears in italics on the card.
2. Add an entry to `projects` in `projects.json`. Its position sets the order
   within its category:

   ```json
   {
     "repo": "my-new-thing",
     "category": "cli",
     "title": "My New Thing",
     "summary": "One or two sentences on what it is and why it's interesting.",
     "highlights": ["Go", "no dependencies", "1 MB binary"]
   }
   ```

   Only `repo` and `category` are required. `title` defaults to the repo name.
   Any API-derived field (`description`, `language`, `homepage`, `branch`,
   `license`) can be overridden here, and so can `accent` (the card colour,
   which otherwise comes from the language) and `readme` (default `README.md`).
3. Push. The **Update manifest** Action regenerates `manifest.json` and commits
   it. You can also do this locally with `python3 gen_manifest.py`.

To add a new section, append to `categories` (`id`, `title`, `blurb`). Empty
categories are hidden.

When the generator runs, it reports any public repo that is neither listed nor
matched by `ignore`. Repos that are listed but not public are skipped with a
warning.

## Automatic refresh (GitHub Action)

`.github/workflows/update-manifest.yml` runs **every Monday 07:00 UTC**, on any
push that changes `projects.json` or `gen_manifest.py`, and on demand
(**Actions → Update manifest → Run workflow**). It commits `manifest.json` only
when something changed.

Setup: under **Settings → Actions → General → Workflow permissions**, select
**Read and write permissions**.

## Enabling GitHub Pages

1. Create the repository **`sipak-gh.github.io`** under `sipak-gh` and push this
   folder to `master`.
2. In **Settings → Pages**, set **Source** to *Deploy from a branch*, branch
   `master`, folder `/ (root)`.
3. Visit `https://sipak-gh.github.io/`.

`.nojekyll` makes Pages serve the files as-is.

## Local preview

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

Serve the folder over HTTP rather than opening it as a `file://` URL, so that
`fetch` can load the manifest. The top-bar *Courseware* link points to
`/courseware/`, so it only resolves on the live site.
