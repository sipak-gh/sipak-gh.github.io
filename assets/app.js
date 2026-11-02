/* sipak-gh.github.io — a client-side portfolio of sipak-gh projects.
 *
 * manifest.json (built by gen_manifest.py from projects.json + the GitHub API)
 * lists the projects. Each project's README is fetched live from
 * raw.githubusercontent.com and rendered in the browser (marked + highlight.js),
 * so a project page always reflects what's pushed.
 *
 * Routes (hash-based):
 *   #/                        home (project cards)
 *   #/<repo>                  project page (renders its README)
 *   #/<repo>/<path.md>        another Markdown file in that repo
 *   #/<repo>/<path.md>::slug  ... scrolled to a heading
 */

const RAW = "https://raw.githubusercontent.com";
const GH = "https://github.com";

const state = { manifest: null, byRepo: {}, cache: new Map(), lang: "", current: null, seq: 0 };
const $view = document.getElementById("view");
const $sourceLink = document.getElementById("source-link");

/* ---------------- helpers ---------------- */

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function slugify(text, used) {
  let s = String(text).trim().toLowerCase()
    .replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!s) s = "section";
  if (used) {
    const base = s;
    for (let n = 1; used.has(s); n++) s = `${base}-${n}`;
    used.add(s);
  }
  return s;
}

const repoUrl = p => `${GH}/${state.manifest.owner}/${p.repo}`;
const rawUrl = (p, file) => `${RAW}/${state.manifest.owner}/${p.repo}/${p.branch}/${file}`;
const blobUrl = (p, file) => `${repoUrl(p)}/blob/${p.branch}/${file}`;
const routeHash = (repo, file) => file ? `/${repo}/${encodeURIComponent(file)}` : `/${repo}`;

function setAccent(color) {
  document.documentElement.style.setProperty("--accent", color || "#8a63d2");
}

function ago(iso) {
  if (!iso) return "";
  const days = Math.round((Date.parse(iso) - Date.now()) / 86400000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(days) < 30) return rtf.format(days, "day");
  if (Math.abs(days) < 365) return rtf.format(Math.round(days / 30), "month");
  return rtf.format(Math.round(days / 365), "year");
}

async function fetchDoc(url) {
  if (state.cache.has(url)) return state.cache.get(url);
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
  const text = await res.text();
  state.cache.set(url, text);
  return text;
}

// Resolve `rel` against directory `dir`; returns null if it climbs out of the repo.
function resolvePath(dir, rel) {
  const out = [];
  for (const part of (dir + rel).split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") { if (!out.length) return null; out.pop(); }
    else out.push(part);
  }
  return out.join("/");
}

/* ---------------- markdown ---------------- */

function renderMarkdown(md, p, file) {
  const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/") + 1) : "";
  const tmp = document.createElement("div");
  tmp.innerHTML = window.marked ? window.marked.parse(md, { gfm: true }) : `<pre>${esc(md)}</pre>`;

  const used = new Set();
  tmp.querySelectorAll("h1, h2, h3, h4").forEach(h => {
    h.id = slugify(h.textContent, used);
    const a = document.createElement("a");
    a.className = "anchor";
    a.href = `#${routeHash(p.repo, file)}::${h.id}`;
    a.textContent = "¶";
    h.appendChild(a);
  });

  // .md links render here; in-page anchors scroll; anything else opens on GitHub.
  tmp.querySelectorAll("a[href]").forEach(a => {
    const href = a.getAttribute("href");
    if (a.classList.contains("anchor")) return;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) {
      a.target = "_blank"; a.rel = "noopener"; return;
    }
    if (href.startsWith("#")) {
      a.setAttribute("href", `#${routeHash(p.repo, file)}::${slugify(decodeURIComponent(href.slice(1)))}`);
      return;
    }
    const [path, frag] = href.split("#");
    const resolved = resolvePath(href.startsWith("/") ? "" : dir, path);
    if (resolved === null) {
      a.setAttribute("href", `${repoUrl(p)}/tree/${p.branch}/${path}`);
      a.target = "_blank"; a.rel = "noopener";
    } else if (/\.md$/i.test(resolved)) {
      a.setAttribute("href", `#${routeHash(p.repo, resolved)}${frag ? "::" + slugify(decodeURIComponent(frag)) : ""}`);
    } else {
      a.setAttribute("href", blobUrl(p, resolved));
      a.target = "_blank"; a.rel = "noopener";
      a.classList.add("ext-file");
    }
  });

  tmp.querySelectorAll("img[src]").forEach(img => {
    const src = img.getAttribute("src");
    if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) return;
    const resolved = resolvePath(src.startsWith("/") ? "" : dir, src);
    if (resolved !== null) img.setAttribute("src", rawUrl(p, resolved));
    img.loading = "lazy";
  });

  if (window.hljs) {
    tmp.querySelectorAll("pre code").forEach(b => { try { window.hljs.highlightElement(b); } catch (_) {} });
  }
  return tmp;
}

/* ---------------- routing ---------------- */

function parseHash() {
  let h = location.hash.replace(/^#\/?/, "");
  if (!h) return { kind: "home" };
  let anchor = null;
  const sep = h.indexOf("::");
  if (sep >= 0) { anchor = h.slice(sep + 2); h = h.slice(0, sep); }
  const [repo, ...rest] = h.split("/");
  const file = rest.length ? decodeURIComponent(rest.join("/")) : null;
  return { kind: "project", repo, file, anchor };
}

function route() {
  const r = parseHash();
  const p = r.kind === "project" && state.byRepo[r.repo];
  if (!p) return renderHome();
  return renderProject(p, r.file || p.readme, r.anchor);
}

/* ---------------- views ---------------- */

function langPill(p) {
  return p.language ? `<span class="pill"><span class="dot"></span>${esc(p.language)}</span>` : "";
}

function card(p) {
  const links = [
    p.homepage ? `<a href="${esc(p.homepage)}" target="_blank" rel="noopener">Site ↗</a>` : "",
    `<a href="${esc(repoUrl(p))}" target="_blank" rel="noopener">GitHub ↗</a>`,
  ].join("");
  const tags = (p.highlights || []).map(t => `<li>${esc(t)}</li>`).join("");
  return `
    <article class="card" style="--card-accent:${esc(p.accent)}">
      <div class="card-top">${langPill(p)}${p.archived ? '<span class="pill">archived</span>' : ""}</div>
      <h3><a href="#/${esc(p.repo)}">${esc(p.title)}</a></h3>
      ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ""}
      <p class="summary">${esc(p.summary)}</p>
      ${tags ? `<ul class="tags">${tags}</ul>` : ""}
      <div class="card-foot">
        <span>${esc(p.repo)}</span>
        ${p.pushedAt ? `<span class="sep">·</span><span title="${esc(p.pushedAt)}">updated ${esc(ago(p.pushedAt))}</span>` : ""}
        <span class="links">${links}</span>
      </div>
    </article>`;
}

function renderHome() {
  const m = state.manifest;
  state.current = null;
  state.seq++;
  setAccent();
  $sourceLink.href = `${GH}/${m.owner}`;
  document.title = `${m.profile.name || m.owner} · projects`;

  const langs = new Map();
  m.projects.forEach(p => {
    if (!p.language) return;
    const l = langs.get(p.language) || { n: 0, accent: p.accent };
    l.n++; langs.set(p.language, l);
  });
  if (state.lang && !langs.has(state.lang)) state.lang = "";

  const chip = (value, label, n, accent) =>
    `<button class="chip" data-lang="${esc(value)}" aria-pressed="${state.lang === value}"
       ${accent ? `style="--chip-accent:${esc(accent)}"` : ""}>
       ${accent ? '<span class="dot"></span>' : ""}${esc(label)} <span class="n">${n}</span></button>`;
  const filters = [chip("", "All", m.projects.length)]
    .concat([...langs].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
      .map(([lang, l]) => chip(lang, lang, l.n, l.accent)))
    .join("");

  const visible = m.projects.filter(p => !state.lang || p.language === state.lang);
  const sections = m.categories.map(c => {
    const ps = visible.filter(p => p.category === c.id);
    if (!ps.length) return "";
    return `
      <section class="topic" id="cat-${esc(c.id)}">
        <div class="topic-head"><h2>${esc(c.title)}</h2>${c.blurb ? `<p>${esc(c.blurb)}</p>` : ""}</div>
        <div class="grid">${ps.map(card).join("")}</div>
      </section>`;
  }).join("");

  $view.innerHTML = `
    <div class="home">
      <section class="hero">
        <h1>${esc(m.profile.headline || m.profile.name || m.owner)}</h1>
        ${m.profile.about ? `<p>${esc(m.profile.about)}</p>` : ""}
        <div class="meta">${m.projects.length} projects · ${langs.size} languages · updated ${esc((m.generated || "").slice(0, 10))}</div>
        <div class="filters" role="group" aria-label="Filter by language">${filters}</div>
      </section>
      ${sections}
    </div>`;

  $view.querySelectorAll(".chip").forEach(b => b.addEventListener("click", () => {
    state.lang = b.dataset.lang;
    renderHome();
  }));
}

function projectHead(p) {
  const meta = [
    langPill(p),
    p.license ? `<span>${esc(p.license)} license</span>` : "",
    p.pushedAt ? `<span title="${esc(p.pushedAt)}">updated ${esc(ago(p.pushedAt))}</span>` : "",
    p.stars ? `<span>★ ${esc(p.stars)}</span>` : "",
  ].filter(Boolean).join('<span class="sep">·</span>');
  const tags = (p.highlights || []).map(t => `<li>${esc(t)}</li>`).join("");
  return `
    <header class="proj-head">
      <h1>${esc(p.title)}</h1>
      ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ""}
      ${p.summary ? `<p class="summary">${esc(p.summary)}</p>` : ""}
      ${tags ? `<ul class="tags">${tags}</ul>` : ""}
      <div class="meta">${meta}</div>
      <div class="actions">
        ${p.homepage ? `<a class="btn primary" href="${esc(p.homepage)}" target="_blank" rel="noopener">Visit site ↗</a>` : ""}
        <a class="btn${p.homepage ? "" : " primary"}" href="${esc(repoUrl(p))}" target="_blank" rel="noopener">View on GitHub ↗</a>
      </div>
    </header>`;
}

async function renderProject(p, file, anchor) {
  const key = `${p.repo}/${file}`;
  if (state.current === key && anchor) return scrollToAnchor(anchor);
  state.current = key;
  const token = ++state.seq;
  setAccent(p.accent);
  $sourceLink.href = blobUrl(p, file);
  const isReadme = file === p.readme;
  document.title = `${p.title}${isReadme ? "" : ` · ${file}`} · ${state.manifest.profile.name || state.manifest.owner}`;

  const crumbs = `<div class="doc-crumbs"><a href="#/">Projects</a> / ${isReadme
    ? esc(p.repo) : `<a href="#/${esc(p.repo)}">${esc(p.repo)}</a> / ${esc(file)}`}</div>`;
  $view.innerHTML = `<div class="doc">${crumbs}${isReadme ? projectHead(p) : ""}<div class="loading">Loading ${esc(file)}…</div></div>`;
  const $loading = $view.querySelector(".loading");
  window.scrollTo(0, 0);

  let md;
  try {
    md = await fetchDoc(rawUrl(p, file));
  } catch (err) {
    if (state.seq !== token) return;
    $loading.outerHTML = `
      <div class="markdown">
        <p class="msg">Couldn’t load <code>${esc(file)}</code> (${esc(err.message)}).
        <a href="${esc(blobUrl(p, file))}" target="_blank" rel="noopener">Open it on GitHub ↗</a></p>
      </div>`;
    return;
  }
  if (state.seq !== token) return;

  const body = document.createElement("div");
  body.className = "markdown";
  body.append(...renderMarkdown(md, p, file).childNodes);
  // The project header already shows the title.
  if (isReadme && body.firstElementChild?.tagName === "H1") body.firstElementChild.remove();
  $loading.replaceWith(body);

  const back = document.createElement("a");
  back.className = "back";
  back.href = isReadme ? "#/" : `#/${p.repo}`;
  back.textContent = isReadme ? "← All projects" : `← ${p.title}`;
  body.after(back);

  if (anchor) scrollToAnchor(anchor);
}

function scrollToAnchor(anchor) {
  const el = document.getElementById(anchor);
  if (el) el.scrollIntoView({ block: "start" });
}

/* ---------------- boot ---------------- */

async function boot() {
  try {
    const res = await fetch("manifest.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.manifest = await res.json();
  } catch (err) {
    $view.innerHTML = `<div class="msg">Failed to load <code>manifest.json</code> (${esc(err.message)}).
      Run <code>python3 gen_manifest.py</code> and serve the folder over HTTP.</div>`;
    return;
  }
  state.manifest.projects.forEach(p => { state.byRepo[p.repo] = p; });
  window.addEventListener("hashchange", route);
  route();
}

boot();
