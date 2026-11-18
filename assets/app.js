/* AZ ROC Prep — single-page app. No dependencies. Data comes from assets/data.js (built by tools/build_site.py). */
(function () {
  "use strict";
  const D = window.DATA;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const app = $("#app");

  /* ---------- helpers ---------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const fmtTime = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  };
  const shuffle = (a) => {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const HUES = [200, 18, 38, 350, 150, 265, 95, 225, 320, 175];
  const hue = (d) => HUES[(d.n - 1) % HUES.length];
  const L = "ABCD";

  const DOM = Object.fromEntries(D.domains.map((d) => [d.id, d]));
  const Q = Object.fromEntries(D.questions.map((q) => [q.id, q]));
  const BY_DOM = {};
  D.questions.forEach((q) => (BY_DOM[q.d] = BY_DOM[q.d] || []).push(q));
  const byWeight = D.domains.slice().sort((a, b) => b.items - a.items || a.n - b.n);

  /* ---------- persistent state ---------- */
  const KEY = "azroc:v1";
  const fresh = () => ({ studied: {}, seen: {}, missed: {}, history: [], plan: {}, session: null });
  let S = fresh();
  try { S = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { /* private mode */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };

  function record(qid, ok, drill) {
    const r = (S.seen[qid] = S.seen[qid] || { r: 0, w: 0 });
    ok ? r.r++ : r.w++;
    if (!ok) S.missed[qid] = Date.now();
    else if (drill) delete S.missed[qid];
  }
  function domStats(id) {
    const qs = BY_DOM[id] || [];
    let seen = 0, r = 0, w = 0;
    qs.forEach((q) => { const s = S.seen[q.id]; if (s) { seen++; r += s.r; w += s.w; } });
    return { seen, total: qs.length, acc: r + w ? Math.round((r / (r + w)) * 100) : null };
  }

  /* ---------- tiny UI kit ---------- */
  function modal({ title, body, actions }) {
    const el = document.createElement("div");
    el.className = "modal-back";
    el.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h3>${esc(title)}</h3><div class="modal-body">${body}</div><div class="modal-actions"></div></div>`;
    const box = $(".modal-actions", el);
    const close = () => el.remove();
    actions.forEach((a) => {
      const b = document.createElement("button");
      b.className = "btn " + (a.cls || "");
      b.textContent = a.label;
      b.onclick = () => { close(); a.fn && a.fn(); };
      box.appendChild(b);
    });
    el.addEventListener("click", (e) => { if (e.target === el) close(); });
    document.body.appendChild(el);
    const f = $(".btn.primary", el) || $(".btn", el);
    f && f.focus();
    return close;
  }
  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2200);
  }
  const ring = (pct, size, label, sub) => {
    const r = 52, c = 2 * Math.PI * r, off = c * (1 - Math.min(100, pct) / 100);
    return `<div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-bg" cx="60" cy="60" r="${r}"/><circle class="ring-fg" cx="60" cy="60" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 60 60)"/></svg><div class="ring-txt"><b>${label}</b>${sub ? `<small>${sub}</small>` : ""}</div></div>`;
  };

  /* ---------- sessions (exam / practice / drill) ---------- */
  function largestRemainder(total) {
    const raw = D.domains.map((d) => ({ d, x: (d.items * total) / 100 }));
    const alloc = raw.map((r) => ({ d: r.d, n: Math.floor(r.x), f: r.x - Math.floor(r.x) }));
    let left = total - alloc.reduce((a, b) => a + b.n, 0);
    alloc.slice().sort((a, b) => b.f - a.f).forEach((a) => { if (left > 0) { a.n++; left--; } });
    return alloc;
  }
  function pickExam(total) {
    let ids = [];
    largestRemainder(total).forEach((a) => {
      const bank = BY_DOM[a.d.id] || [];
      ids = ids.concat(shuffle(bank).slice(0, Math.min(a.n, bank.length)).map((q) => q.id));
    });
    return shuffle(ids);
  }
  function startSession(mode, ids, o) {
    if (!ids.length) { toast("No questions available for that selection."); return; }
    S.session = {
      mode, title: o.title, domain: o.domain || null, limit: o.limit || 0,
      qs: ids.map((id) => ({ id, order: shuffle([0, 1, 2, 3]) })),
      ans: ids.map(() => -1), flags: ids.map(() => false),
      i: 0, elapsed: 0, lastTick: Date.now(), done: false, created: Date.now(),
    };
    save();
    location.hash = "#/run";
  }
  const sElapsed = (s) => s.elapsed + (s.lastTick ? Date.now() - s.lastTick : 0);
  function pauseSession() {
    const s = S.session;
    if (s && !s.done && s.lastTick) { s.elapsed += Date.now() - s.lastTick; s.lastTick = null; save(); }
  }
  let timerId = null;
  const stopTimer = () => { clearInterval(timerId); timerId = null; };

  function finishSession(auto) {
    const s = S.session;
    if (!s || s.done) return;
    pauseSession();
    stopTimer();
    let correct = 0, answered = 0;
    const per = {};
    s.qs.forEach((qq, k) => {
      const q = Q[qq.id];
      const a = s.ans[k];
      const ok = a === q.a;
      per[q.d] = per[q.d] || { c: 0, t: 0 };
      per[q.d].t++;
      if (a !== -1) answered++;
      if (ok) { correct++; per[q.d].c++; }
      if (s.mode === "exam") record(q.id, ok, false); // practice/drill record per answer
    });
    s.done = true;
    s.finished = Date.now();
    s.result = { correct, answered, total: s.qs.length, pct: Math.round((correct / s.qs.length) * 100), per, auto: !!auto };
    S.history.push({ t: s.finished, mode: s.mode, title: s.title, correct, total: s.qs.length, answered, pct: s.result.pct, secs: Math.round(s.elapsed / 1000) });
    S.history = S.history.slice(-60);
    save();
    location.hash = "#/results";
  }

  /* ---------- router ---------- */
  let pendingJump = null;
  const routes = [
    [/^\/?$/, viewHome],
    [/^\/study(?:\/([\w-]+))?$/, viewStudy],
    [/^\/quiz$/, viewQuiz],
    [/^\/exam$/, viewExam],
    [/^\/run$/, viewRun],
    [/^\/results$/, viewResults],
    [/^\/missed$/, viewMissed],
    [/^\/plan$/, viewPlan],
    [/^\/resources(?:\/(\w+))?$/, viewResources],
  ];
  function route() {
    stopTimer();
    const path = location.hash.replace(/^#/, "") || "/";
    // leaving a run view pauses the clock so a 4-hour exam is forgiving
    if (!path.startsWith("/run")) pauseSession();
    let hit = null;
    for (const [rx, fn] of routes) { const m = path.match(rx); if (m) { hit = [fn, m.slice(1)]; break; } }
    if (!hit) { hit = [viewNotFound, []]; }
    document.body.dataset.route = path.split("/")[1] || "home";
    app.innerHTML = "";
    app.className = "";
    hit[0](...hit[1]);
    $$("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === (path.split("/")[1] || "home") || (a.dataset.nav === "exam" && /^\/(run|results)$/.test(path) && S.session && S.session.mode === "exam")));
    if (pendingJump === null) window.scrollTo(0, 0);
    document.title = "AZ ROC Prep · KB-2 Contractor Exam";
  }
  function viewNotFound() {
    app.innerHTML = `<section class="wrap narrow center"><h1>Page not found</h1><p class="lede">That page doesn't exist.</p><a class="btn primary" href="#/">Back to home</a></section>`;
  }

  /* ---------- HOME ---------- */
  function daysUntil() {
    const [y, m, d] = D.exam.date.split("-").map(Number);
    const target = new Date(y, m - 1, d);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - today) / 86400000);
  }
  function viewHome() {
    const n = daysUntil();
    const studied = Object.keys(S.studied).filter((k) => S.studied[k]).length;
    const seen = Object.keys(S.seen).length;
    let r = 0, w = 0;
    Object.values(S.seen).forEach((x) => { r += x.r; w += x.w; });
    const acc = r + w ? Math.round((r / (r + w)) * 100) : null;
    const exams = S.history.filter((h) => h.mode === "exam" && h.total >= 100);
    const best = exams.length ? Math.max(...exams.map((h) => h.pct)) : null;
    const inRoom = D.domains.filter((d) => d.books === "in-room").reduce((a, d) => a + d.items, 0);
    const resume = S.session && !S.session.done ? S.session : null;
    const cd = n > 1 ? `<b>${n}</b><span>days to go</span>` : n === 1 ? `<b>1</b><span>day to go</span>` : n === 0 ? `<b>Today</b><span>is exam day. You've got this.</span>` : `<b>✓</b><span>Exam date has passed</span>`;

    app.innerHTML = `
    <section class="hero">
      <svg class="mesa" viewBox="0 0 1440 260" preserveAspectRatio="none" aria-hidden="true">
        <path class="m3" d="M0 190 L120 160 L210 160 L260 120 L400 120 L450 165 L600 150 L700 100 L860 100 L920 150 L1100 140 L1180 90 L1330 90 L1380 150 L1440 140 V260 H0Z"/>
        <path class="m2" d="M0 220 L180 200 L260 170 L380 170 L440 205 L640 190 L760 150 L930 150 L1010 200 L1200 190 L1290 160 L1440 190 V260 H0Z"/>
        <path class="m1" d="M0 250 L220 235 L330 215 L470 215 L560 240 L820 228 L940 205 L1080 205 L1180 235 L1440 225 V260 H0Z"/>
      </svg>
      <div class="wrap hero-in">
        <div class="hero-copy">
          <span class="eyebrow">Arizona Registrar of Contractors</span>
          <h1>Pass the <em>KB-2</em> trade exam.</h1>
          <p class="lede">A complete self-study system for the Dual Residential &amp; Small Commercial contractor license: a guide for every exam domain, ${D.questions.length} practice questions, and a timed 100-question simulator weighted like the real test.</p>
          <div class="cta">
            ${resume ? `<a class="btn primary lg" href="#/run">Resume ${esc(resume.title)}</a>` : `<a class="btn primary lg" href="#/exam">Take a practice exam</a>`}
            <a class="btn ghost lg" href="#/study">Open the study guide</a>
          </div>
          <ul class="facts">
            <li><b>${D.exam.questions}</b><span>questions</span></li>
            <li><b>${D.exam.minutes / 60}h</b><span>time limit</span></li>
            <li><b>${D.exam.pass}%</b><span>to pass</span></li>
            <li><b>3</b><span>open books</span></li>
          </ul>
        </div>
        <aside class="count card-glass" aria-label="Countdown to exam day">
          <small>Exam day · Friday, Nov 20</small>
          <div class="count-n">${cd}</div>
          <div class="count-plan"><a href="#/plan">See the 3-day plan →</a></div>
        </aside>
      </div>
    </section>

    <section class="wrap">
      <div class="stats">
        <div class="stat"><small>Domains studied</small><b>${studied}<i>/${D.domains.length}</i></b></div>
        <div class="stat"><small>Questions practiced</small><b>${seen}<i>/${D.questions.length}</i></b></div>
        <div class="stat"><small>Accuracy</small><b>${acc === null ? "—" : acc + "%"}</b></div>
        <div class="stat"><small>Best full exam</small><b>${best === null ? "—" : best + "%"}</b></div>
        <a class="stat link" href="#/missed"><small>To review</small><b>${Object.keys(S.missed).length}</b></a>
      </div>
    </section>

    <section class="wrap">
      <div class="head"><h2>Where the points are</h2><p>The exam is built from ten domains. ${inRoom} of the 100 items come from books you can bring into the room; the other ${100 - inRoom} depend on what you actually know.</p></div>
      <div class="blueprint" role="img" aria-label="Exam blueprint by domain">
        ${byWeight.map((d) => `<a href="#/study/${d.id}" class="bp" style="--h:${hue(d)};flex:${d.items}" title="${esc(d.name)}: ${d.items} items"><b>${d.items}</b><span>${esc(d.name.replace(" Protection", "").replace("General Building Code", "Building Code").replace("Thermal & Moisture", "Thermal").replace("Doors & Windows", "Doors"))}</span></a>`).join("")}
      </div>
      <div class="legend"><span><i class="dot room"></i>In-room book lookup: ${D.domains.filter((d) => d.books === "in-room").map((d) => d.name.replace(" Protection", "")).join(", ")}</span></div>
    </section>

    <section class="wrap">
      <div class="head"><h2>Study by domain</h2><p>Ordered by exam weight. Read the guide, then quiz yourself.</p></div>
      <div class="grid">
        ${byWeight.map((d) => {
          const st = domStats(d.id);
          return `<article class="dcard" style="--h:${hue(d)}">
            <div class="dtop"><span class="num">${pad(d.n)}</span><span class="pill ${d.books}">${d.books === "in-room" ? "In-room books" : "Study-only"}</span></div>
            <h3>${esc(d.name)}</h3>
            <p>${esc(d.blurb)}</p>
            <div class="meter"><i style="width:${(d.items / 14) * 100}%"></i></div>
            <div class="dmeta"><span><b>${d.items}</b> exam items</span><span>${S.studied[d.id] ? "✓ studied" : "not yet studied"}</span><span>${st.acc === null ? "no quiz yet" : st.acc + "% accuracy"}</span></div>
            <div class="dact"><a class="btn sm primary" href="#/study/${d.id}">Study</a><button class="btn sm" data-quiz="${d.id}">Quiz (${d.qcount})</button></div>
          </article>`;
        }).join("")}
      </div>
    </section>

    <section class="wrap">
      <div class="head"><h2>How it works</h2></div>
      <ol class="steps">
        <li><b>1</b><h4>Read</h4><p>Concise notes for each domain with the numbers, code locations and tab maps that show up on the test.</p></li>
        <li><b>2</b><h4>Drill</h4><p>Practice quizzes give instant feedback, with the reason and the book section for every answer.</p></li>
        <li><b>3</b><h4>Simulate</h4><p>Sit a full timed exam, then review your score by domain. Every miss goes into a review list.</p></li>
      </ol>
    </section>`;
    $$("[data-quiz]").forEach((b) => (b.onclick = () => startDomainQuiz(b.dataset.quiz)));
  }

  /* ---------- STUDY ---------- */
  const BLOCK_SEL = "p,li,tr,h2,h3";
  function viewStudy(id) {
    const d = DOM[id] || byWeight[0];
    const i = byWeight.indexOf(d);
    const prev = byWeight[i - 1], next = byWeight[i + 1];
    app.innerHTML = `
    <div class="wrap study" style="--h:${hue(d)}">
      <aside class="side" aria-label="Domains">
        <div class="side-t">Domains</div>
        ${byWeight.map((x) => `<a href="#/study/${x.id}" class="${x.id === d.id ? "on" : ""}" style="--h:${hue(x)}"><i></i><span>${esc(x.name.replace(" Protection", ""))}</span><em>${S.studied[x.id] ? "✓" : x.items}</em></a>`).join("")}
      </aside>
      <article class="doc">
        <header class="doc-h">
          <div class="crumbs"><span class="num">${pad(d.n)}</span><span class="pill ${d.books}">${d.books === "in-room" ? "In-room books" : "Study-only"}</span><span class="pill plain">${d.items} of 100 exam items</span></div>
          <h1>${esc(d.name)}</h1>
          <p class="lede">${esc(d.blurb)}</p>
          <div class="callout">${d.ref}</div>
          <nav class="jump" aria-label="On this page"></nav>
        </header>
        <div class="prose" id="prose">${d.html}</div>
        <footer class="doc-f">
          <div class="doc-actions">
            <button class="btn ${S.studied[d.id] ? "" : "primary"}" id="studied">${S.studied[d.id] ? "✓ Marked as studied" : "Mark as studied"}</button>
            <button class="btn" id="quizit">Quiz me on ${esc(d.name)} (${d.qcount})</button>
          </div>
          <div class="pn">${prev ? `<a href="#/study/${prev.id}">← ${esc(prev.name.replace(" Protection", ""))}</a>` : "<span></span>"}${next ? `<a href="#/study/${next.id}">${esc(next.name.replace(" Protection", ""))} →</a>` : "<span></span>"}</div>
        </footer>
      </article>
    </div>`;
    // anchors for in-page jump
    const jump = $(".jump");
    $$("#prose h2").forEach((h, k) => {
      h.id = "s" + k;
      const a = document.createElement("a");
      a.href = "javascript:void(0)";
      a.textContent = h.textContent;
      a.onclick = () => h.scrollIntoView({ behavior: "smooth", block: "start" });
      jump.appendChild(a);
    });
    $("#studied").onclick = () => { S.studied[d.id] = !S.studied[d.id]; save(); viewStudyRefresh(d.id); };
    $("#quizit").onclick = () => startDomainQuiz(d.id);
    // search jump target
    if (pendingJump !== null) {
      const el = $$(BLOCK_SEL, $("#prose"))[pendingJump];
      pendingJump = null;
      if (el) { setTimeout(() => { el.scrollIntoView({ block: "center" }); el.classList.add("flash"); }, 30); }
    }
  }
  function viewStudyRefresh(id) { const y = window.scrollY; viewStudy(id); window.scrollTo(0, y); }

  /* ---------- QUIZ PICKER ---------- */
  function startDomainQuiz(id) {
    const d = DOM[id];
    startSession("practice", shuffle(BY_DOM[id]).map((q) => q.id), { title: `${d.name} quiz`, domain: id });
  }
  function weakestDomain() {
    const arr = D.domains.map((d) => ({ d, s: domStats(d.id) })).filter((x) => x.s.acc !== null).sort((a, b) => a.s.acc - b.s.acc);
    return arr.length ? arr[0] : null;
  }
  function viewQuiz() {
    const weak = weakestDomain();
    const missedN = Object.keys(S.missed).length;
    app.innerHTML = `
    <section class="wrap">
      <div class="head page"><h1>Practice quizzes</h1><p>Instant feedback after every answer, with the explanation and where to find it in the books. Answers are shuffled each time.</p></div>
      <div class="grid quick">
        <article class="dcard accent"><h3>Quick-fire mix</h3><p>20 random questions across all domains.</p><div class="dact"><button class="btn primary sm" id="qf">Start 20</button></div></article>
        <article class="dcard accent"><h3>Review missed</h3><p>${missedN ? `${missedN} question${missedN === 1 ? "" : "s"} you've missed. Answer correctly to clear them.` : "Nothing to review yet. Missed questions collect here."}</p><div class="dact"><button class="btn primary sm" id="qm" ${missedN ? "" : "disabled"}>Drill missed</button></div></article>
        <article class="dcard accent"><h3>Weakest domain</h3><p>${weak ? `${esc(weak.d.name)} is at ${weak.s.acc}%. Work on it.` : "Take a few quizzes and your lowest-scoring domain shows up here."}</p><div class="dact"><button class="btn primary sm" id="qw" ${weak ? "" : "disabled"}>Practice it</button></div></article>
      </div>
      <div class="head"><h2>By domain</h2></div>
      <div class="grid">
        ${byWeight.map((d) => { const st = domStats(d.id); return `<article class="dcard" style="--h:${hue(d)}"><div class="dtop"><span class="num">${pad(d.n)}</span><span class="pill plain">${d.items} items</span></div><h3>${esc(d.name)}</h3><div class="meter acc"><i style="width:${st.total ? (st.seen / st.total) * 100 : 0}%"></i></div><div class="dmeta"><span>${st.seen}/${st.total} seen</span><span>${st.acc === null ? "no attempts" : st.acc + "% accuracy"}</span></div><div class="dact"><button class="btn primary sm" data-quiz="${d.id}">Start (${d.qcount})</button></div></article>`; }).join("")}
      </div>
    </section>`;
    $$("[data-quiz]").forEach((b) => (b.onclick = () => startDomainQuiz(b.dataset.quiz)));
    $("#qf").onclick = () => startSession("practice", shuffle(D.questions).slice(0, 20).map((q) => q.id), { title: "Quick-fire mix" });
    $("#qm").onclick = () => startSession("drill", shuffle(Object.keys(S.missed)), { title: "Missed-question drill" });
    $("#qw").onclick = () => weak && startDomainQuiz(weak.d.id);
  }

  /* ---------- EXAM INTRO ---------- */
  function viewExam() {
    const s = S.session && !S.session.done && S.session.mode === "exam" ? S.session : null;
    const exams = S.history.filter((h) => h.mode === "exam").slice(-5).reverse();
    app.innerHTML = `
    <section class="wrap narrow">
      <div class="head page"><span class="eyebrow">Simulator</span><h1>Practice exam</h1><p>Built to the PSI blueprint for the combined B-1 / B-2 / KB-1 / KB-2 trade exam: same number of questions per domain, same time limit, same pass mark.</p></div>
      ${s ? `<div class="card resume"><div><b>Exam in progress</b><p>${s.ans.filter((a) => a !== -1).length} of ${s.qs.length} answered · ${fmtTime(Math.max(0, s.limit - sElapsed(s)))} remaining (clock is paused while you're away).</p></div><a class="btn primary" href="#/run">Resume exam</a></div>` : ""}
      <div class="two">
        <article class="card big">
          <h3>Full exam</h3>
          <ul class="ticks"><li>100 questions, weighted by domain</li><li>240 minutes (2.4 min per question)</li><li>70 correct to pass</li><li>Flag questions and jump around freely</li><li>Score report by domain with explanations</li></ul>
          <button class="btn primary lg" id="full">Start full exam</button>
        </article>
        <article class="card big">
          <h3>Mini exam</h3>
          <ul class="ticks"><li>25 questions, same domain mix</li><li>60 minutes</li><li>Good for a warm-up or a quick check</li><li>Same review and scoring</li></ul>
          <button class="btn lg" id="mini">Start mini exam</button>
        </article>
      </div>
      <p class="note">The question bank has ${D.questions.length} questions, so each full exam draws about two thirds of them and repeat attempts will overlap. Questions and answer order are reshuffled every time. On test day, you may bring bound copies of 29 CFR 1926, the 2018 IRC and the 2018 IBC with permanent tabs; this simulator does not model the open-book lookups.</p>
      ${exams.length ? `<div class="head"><h2>Recent exams</h2></div><div class="card"><table class="hist"><thead><tr><th>When</th><th>Exam</th><th>Score</th><th>Time</th></tr></thead><tbody>${exams.map((h) => `<tr><td>${new Date(h.t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td><td>${esc(h.title)}</td><td><span class="badge ${h.pct >= 70 ? "ok" : "no"}">${h.correct}/${h.total} · ${h.pct}%</span></td><td>${fmtTime(h.secs * 1000)}</td></tr>`).join("")}</tbody></table></div>` : ""}
    </section>`;
    const go = (n, min, title) => {
      const begin = () => startSession("exam", pickExam(n), { title, limit: min * 60000 });
      if (s) modal({ title: "Replace the exam in progress?", body: "<p>Starting a new exam discards your current one.</p>", actions: [{ label: "Cancel" }, { label: "Start new exam", cls: "primary", fn: begin }] });
      else begin();
    };
    $("#full").onclick = () => go(100, 240, "Full practice exam");
    $("#mini").onclick = () => go(25, 60, "Mini exam");
  }

  /* ---------- RUN (question view) ---------- */
  function viewRun() {
    const s = S.session;
    if (!s || s.done) { location.hash = s && s.done ? "#/results" : "#/exam"; return; }
    if (s.mode !== "exam" && !s.lastTick) { s.lastTick = Date.now(); save(); }
    renderRun();
    if (s.limit) {
      timerId = setInterval(() => {
        const t = $("#timer");
        if (!s.lastTick) return;
        const left = s.limit - sElapsed(s);
        if (left <= 0) { toast("Time is up. Submitting your exam."); finishSession(true); return; }
        if (t) { t.textContent = fmtTime(left); t.parentElement.classList.toggle("warn", left < 10 * 60000); }
      }, 1000);
    }
  }
  function renderRun() {
    const s = S.session;
    const k = s.i;
    const qq = s.qs[k], q = Q[qq.id], d = DOM[q.d];
    const exam = s.mode === "exam";
    const paused = exam && !s.lastTick;
    const answered = s.ans.filter((a) => a !== -1).length;
    const a = s.ans[k];
    const locked = !exam && a !== -1;
    const left = s.limit ? Math.max(0, s.limit - sElapsed(s)) : 0;

    const opts = qq.order.map((oi, pos) => {
      let cls = "opt";
      if (exam && a === oi) cls += " sel";
      if (locked) { if (oi === q.a) cls += " right"; else if (oi === a) cls += " wrong"; else cls += " dim"; }
      return `<button class="${cls}" data-o="${oi}" ${locked ? "disabled" : ""} aria-label="Option ${L[pos]}"><span class="ltr">${L[pos]}</span><span class="otxt">${esc(q.o[oi])}</span>${locked && oi === q.a ? '<span class="mk">✓</span>' : locked && oi === a ? '<span class="mk">✕</span>' : ""}</button>`;
    }).join("");

    const nav = s.qs.map((x, j) => {
      const aj = s.ans[j];
      let c = "nb";
      if (j === k) c += " cur";
      if (aj !== -1) c += exam ? " done" : aj === Q[x.id].a ? " ok" : " no";
      if (s.flags[j]) c += " flag";
      return `<button class="${c}" data-j="${j}" aria-label="Question ${j + 1}">${j + 1}</button>`;
    }).join("");

    app.className = "runapp";
    app.innerHTML = `
    <div class="runbar">
      <div class="wrap rb-in">
        <div class="rb-title"><b>${esc(s.title)}</b><span>${answered}/${s.qs.length}<span class="hs"> answered</span></span></div>
        <div class="rb-prog"><i style="width:${(answered / s.qs.length) * 100}%"></i></div>
        ${s.limit ? `<div class="timer ${left < 600000 ? "warn" : ""}" title="Time remaining"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9v4l3 2M9 2h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span id="timer">${fmtTime(left)}</span></div>` : ""}
        ${exam ? `<button class="btn sm" id="pause">${paused ? "Resume" : "Pause"}</button>` : ""}
        <button class="btn sm ${exam ? "primary" : ""}" id="finish">${exam ? "Submit exam" : "Finish"}</button>
      </div>
    </div>
    <div class="wrap run">
      <section class="qcol" style="--h:${hue(d)}">
        ${paused ? `<div class="card pausecard"><h3>Exam paused</h3><p>The clock is stopped and the question is hidden. Resume when you're ready.</p><button class="btn primary lg" id="resume">Resume exam</button></div>` : `
        <div class="qmeta"><span class="chip">${esc(d.name)}</span><span class="qn">Question ${k + 1} of ${s.qs.length}</span><button class="flagbtn ${s.flags[k] ? "on" : ""}" id="flag" aria-pressed="${s.flags[k]}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 21V4m0 0h11l-2 4 2 4H5" fill="${s.flags[k] ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>${s.flags[k] ? "Flagged" : "Flag"}</button></div>
        <h2 class="qtext">${esc(q.q)}</h2>
        <div class="opts">${opts}</div>
        ${locked ? `<div class="fb ${a === q.a ? "ok" : "no"}"><b>${a === q.a ? "Correct." : "Not quite."}</b>${a === q.a ? "" : ` The answer is <b class="cans">${L[qq.order.indexOf(q.a)]}. ${esc(q.o[q.a])}</b>.`}${q.e.length > 2 ? ` <span>${esc(q.e)}.</span>` : ""}${q.r ? `<div class="ref">Where to find it: ${esc(q.r)}</div>` : ""}</div>` : ""}
        <div class="qnav"><button class="btn" id="prev" ${k === 0 ? "disabled" : ""}>← Previous</button><span class="hint">${exam ? "Press A–D to answer, F to flag, ← → to move" : locked ? "Press → or Enter for next" : "Press A–D to answer"}</span>${k < s.qs.length - 1 ? `<button class="btn primary" id="next">Next →</button>` : `<button class="btn primary" id="last">${exam ? "Review &amp; submit" : "Finish"}</button>`}</div>`}
      </section>
      <aside class="navcol">
        <div class="card"><h4>Questions</h4><div class="navgrid">${nav}</div>
        <div class="key">${exam ? '<span><i class="nb done"></i>Answered</span>' : '<span><i class="nb ok"></i>Right</span><span><i class="nb no"></i>Wrong</span>'}<span><i class="nb flag"></i>Flagged</span></div></div>
      </aside>
    </div>`;
    wireRun();
  }
  function wireRun() {
    const s = S.session, k = s.i, q = Q[s.qs[k].id], exam = s.mode === "exam";
    const go = (j) => { if (j >= 0 && j < s.qs.length) { s.i = j; save(); renderRun(); window.scrollTo(0, 0); } };
    $$(".opt").forEach((b) => (b.onclick = () => choose(+b.dataset.o)));
    $$(".nb[data-j]").forEach((b) => (b.onclick = () => go(+b.dataset.j)));
    const on = (id, fn) => { const el = $("#" + id); if (el) el.onclick = fn; };
    on("prev", () => go(k - 1));
    on("next", () => go(k + 1));
    on("flag", () => { s.flags[k] = !s.flags[k]; save(); renderRun(); });
    on("pause", () => { s.lastTick ? pauseSession() : (s.lastTick = Date.now(), save()); renderRun(); });
    on("resume", () => { s.lastTick = Date.now(); save(); renderRun(); });
    on("finish", () => confirmFinish());
    on("last", () => confirmFinish());
    function choose(oi) {
      if (s.lastTick === null && exam) return;
      if (!exam && s.ans[k] !== -1) return;
      s.ans[k] = oi;
      if (!exam) record(q.id, oi === q.a, s.mode === "drill");
      save();
      renderRun();
    }
    runKeys = (e) => {
      if (e.target.closest("input,textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (exam && !s.lastTick) return;
      const pos = "abcd".indexOf(key) >= 0 ? "abcd".indexOf(key) : "1234".indexOf(key);
      if (pos >= 0 && key.length === 1) { choose(s.qs[k].order[pos]); return; }
      if (key === "arrowright" || key === "enter") { if (k < s.qs.length - 1) go(k + 1); }
      else if (key === "arrowleft") go(k - 1);
      else if (key === "f" && exam) { s.flags[k] = !s.flags[k]; save(); renderRun(); }
    };
  }
  let runKeys = null;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { const m = $(".modal-back"); if (m) m.remove(); const so = $(".search-back"); if (so) so.remove(); return; }
    if (location.hash === "#/run" && runKeys && !$(".modal-back")) runKeys(e);
  });
  function confirmFinish() {
    const s = S.session;
    const un = s.ans.filter((a) => a === -1).length;
    const fl = s.flags.filter(Boolean).length;
    const exam = s.mode === "exam";
    modal({
      title: exam ? "Submit your exam?" : "Finish this quiz?",
      body: `<p>${un ? `<b>${un}</b> question${un === 1 ? " is" : "s are"} unanswered${exam ? " and will count as incorrect" : ""}.` : "All questions are answered."}${fl ? ` <b>${fl}</b> flagged for review.` : ""}</p>`,
      actions: [{ label: "Keep working" }, { label: exam ? "Submit and see score" : "See results", cls: "primary", fn: () => finishSession(false) }],
    });
  }

  /* ---------- RESULTS ---------- */
  function viewResults() {
    const s = S.session;
    if (!s || !s.done) { location.hash = "#/exam"; return; }
    const r = s.result, exam = s.mode === "exam";
    const pass = r.pct >= D.exam.pass;
    const secs = Math.round(s.elapsed / 1000);
    const rows = s.qs.map((qq, k) => ({ k, q: Q[qq.id], a: s.ans[k], order: qq.order, flag: s.flags[k] }));
    const wrong = rows.filter((x) => x.a !== x.q.a);
    const doms = D.domains.filter((d) => r.per[d.id]).sort((a, b) => b.items - a.items);
    app.innerHTML = `
    <section class="wrap narrow">
      <div class="result ${pass ? "pass" : "fail"}">
        ${ring(r.pct, 170, r.pct + "%", `${r.correct} / ${r.total}`)}
        <div>
          <span class="eyebrow">${esc(s.title)}</span>
          <h1>${exam ? (pass ? "Passing score." : "Not yet. Keep drilling.") : pass ? "Strong work." : "Good practice."}</h1>
          <p class="lede">${exam ? `You need ${D.exam.pass}% to pass. ${pass ? "That clears the line." : `You were ${Math.max(0, Math.ceil(D.exam.pass * r.total / 100) - r.correct)} question${Math.ceil(D.exam.pass * r.total / 100) - r.correct === 1 ? "" : "s"} short.`}` : `${r.answered} of ${r.total} answered.`} Time: ${fmtTime(secs * 1000)}${r.answered ? ` · about ${fmtTime((secs / Math.max(1, r.answered)) * 1000)} per question` : ""}.${r.auto ? " The timer ran out." : ""}</p>
          <div class="cta"><a class="btn primary" href="#/exam">Take another exam</a>${wrong.length ? `<button class="btn" id="retry">Retry ${wrong.length} missed</button>` : ""}<a class="btn ghost" href="#/study">Back to the guide</a></div>
        </div>
      </div>
      <div class="head"><h2>By domain</h2><p>The line marks 70%.</p></div>
      <div class="card bars">
        ${doms.map((d) => { const p = r.per[d.id], pc = Math.round((p.c / p.t) * 100); return `<a class="bar" href="#/study/${d.id}" style="--h:${hue(d)}"><span class="bn">${esc(d.name)}</span><span class="track"><i style="width:${pc}%"></i><u></u></span><span class="bv">${p.c}/${p.t}</span></a>`; }).join("")}
      </div>
      <div class="head"><h2>Review</h2><div class="tabs" id="rtabs"><button class="on" data-f="wrong">Missed (${wrong.length})</button><button data-f="flag">Flagged (${rows.filter((x) => x.flag).length})</button><button data-f="all">All (${rows.length})</button></div></div>
      <div id="review"></div>
    </section>`;
    const draw = (f) => {
      const list = f === "all" ? rows : f === "flag" ? rows.filter((x) => x.flag) : wrong;
      $("#review").innerHTML = list.length ? list.map((x) => reviewItem(x)).join("") : `<div class="card empty">${f === "wrong" ? "No misses. Perfect run." : "Nothing here."}</div>`;
    };
    draw("wrong");
    $$("#rtabs button").forEach((b) => (b.onclick = () => { $$("#rtabs button").forEach((x) => x.classList.toggle("on", x === b)); draw(b.dataset.f); }));
    const rb = $("#retry");
    if (rb) rb.onclick = () => startSession("drill", shuffle(wrong.map((x) => x.q.id)), { title: "Retry: missed questions" });
  }
  function reviewItem(x) {
    const q = x.q, d = DOM[q.d];
    const ok = x.a === q.a;
    const yours = x.a === -1 ? "No answer" : q.o[x.a];
    return `<article class="rev ${ok ? "ok" : "no"}" style="--h:${hue(d)}">
      <div class="rev-h"><span class="chip">${esc(d.name)}</span><span class="qn">Q${x.k + 1}</span>${x.flag ? '<span class="chip flagc">Flagged</span>' : ""}</div>
      <h4>${esc(q.q)}</h4>
      <div class="ans">${ok ? "" : `<div class="a no"><small>Your answer</small>${esc(yours)}</div>`}<div class="a ok"><small>Correct answer</small>${esc(q.o[q.a])}</div></div>
      <p class="why">${q.e.length > 2 ? esc(q.e) + "." : ""}${q.r ? ` <span class="ref">${esc(q.r)}</span>` : ""}</p>
    </article>`;
  }

  /* ---------- MISSED ---------- */
  function viewMissed() {
    const ids = Object.keys(S.missed).sort((a, b) => S.missed[b] - S.missed[a]);
    let filter = "all";
    app.innerHTML = `
    <section class="wrap narrow">
      <div class="head page"><h1>Review list</h1><p>Every question you miss lands here automatically. Answer it correctly in a drill and it leaves the list.</p></div>
      ${ids.length ? `<div class="cta"><button class="btn primary" id="drill">Drill all ${ids.length}</button><button class="btn ghost" id="clear">Clear list</button></div><div class="chips" id="fchips"></div><div id="mlist"></div>` : `<div class="card empty"><h3>Nothing to review yet</h3><p>Take a quiz or practice exam. Questions you miss will collect here with the correct answer and the book reference.</p><a class="btn primary" href="#/quiz">Start a quiz</a></div>`}
    </section>`;
    if (!ids.length) return;
    const present = D.domains.filter((d) => ids.some((i) => Q[i].d === d.id));
    const draw = () => {
      $("#fchips").innerHTML = `<button class="${filter === "all" ? "on" : ""}" data-f="all">All (${ids.length})</button>` + present.map((d) => `<button class="${filter === d.id ? "on" : ""}" data-f="${d.id}">${esc(d.name.replace(" Protection", ""))} (${ids.filter((i) => Q[i].d === d.id).length})</button>`).join("");
      $$("#fchips button").forEach((b) => (b.onclick = () => { filter = b.dataset.f; draw(); }));
      $("#mlist").innerHTML = ids.filter((i) => filter === "all" || Q[i].d === filter).map((i) => {
        const q = Q[i], d = DOM[q.d];
        return `<article class="rev no" style="--h:${hue(d)}"><div class="rev-h"><span class="chip">${esc(d.name)}</span><button class="x" data-rm="${i}" aria-label="Remove from list" title="I know this now">✓ Got it</button></div><h4>${esc(q.q)}</h4><div class="ans"><div class="a ok"><small>Correct answer</small>${esc(q.o[q.a])}</div></div><p class="why">${q.e.length > 2 ? esc(q.e) + "." : ""}${q.r ? ` <span class="ref">${esc(q.r)}</span>` : ""}</p></article>`;
      }).join("");
      $$("[data-rm]").forEach((b) => (b.onclick = () => { delete S.missed[b.dataset.rm]; save(); viewMissed(); }));
    };
    draw();
    $("#drill").onclick = () => startSession("drill", shuffle(ids), { title: "Missed-question drill" });
    $("#clear").onclick = () => modal({ title: "Clear the review list?", body: "<p>This removes all missed questions from the list. Your scores stay.</p>", actions: [{ label: "Cancel" }, { label: "Clear list", cls: "primary", fn: () => { S.missed = {}; save(); viewMissed(); } }] });
  }

  /* ---------- PLAN ---------- */
  function viewPlan() {
    app.innerHTML = `<section class="wrap narrow"><div class="head page"><span class="eyebrow">Plan</span><h1>Study plan</h1><p>Three days to exam day, then a longer plan for deeper prep or a retake. Tap a task to check it off.</p></div><div class="prose card plan" id="plan">${D.docs.plan}</div></section>`;
    const root = $("#plan");
    let inDays = false, n = 0;
    $$(":scope > *", root).forEach((el) => {
      if (el.tagName === "H2") inDays = /3-Day/i.test(el.textContent);
      if (inDays && el.tagName === "UL") {
        $$(":scope > li", el).forEach((li) => {
          const key = "t" + n++;
          li.classList.add("task");
          li.classList.toggle("done", !!S.plan[key]);
          li.insertAdjacentHTML("afterbegin", `<button class="cb ${S.plan[key] ? "on" : ""}" role="checkbox" aria-checked="${!!S.plan[key]}" aria-label="Mark done"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`);
          $(".cb", li).onclick = (e) => { e.preventDefault(); S.plan[key] = !S.plan[key]; save(); li.classList.toggle("done", S.plan[key]); e.currentTarget.classList.toggle("on", S.plan[key]); e.currentTarget.setAttribute("aria-checked", S.plan[key]); };
        });
      }
    });
  }

  /* ---------- RESOURCES ---------- */
  function viewResources(tab) {
    const tabs = [["official", "Official sources", D.docs.sources], ["books", "Books", D.docs.refs], ["practice", "Practice &amp; schools", D.docs.practice], ["blueprint", "Exam blueprint", D.docs.outline]];
    const cur = tabs.find((t) => t[0] === tab) || tabs[0];
    app.innerHTML = `<section class="wrap narrow"><div class="head page"><span class="eyebrow">Resources</span><h1>Official sources &amp; references</h1><p>Where the exam rules come from, which books you can bring, and where to practice.</p></div>
      <div class="tabs big" role="tablist">${tabs.map((t) => `<a role="tab" href="#/resources/${t[0]}" class="${t[0] === cur[0] ? "on" : ""}">${t[1]}</a>`).join("")}</div>
      <div class="prose card">${cur[2]}</div></section>`;
  }

  /* ---------- SEARCH ---------- */
  let SEARCH = null;
  function buildSearch() {
    if (SEARCH) return SEARCH;
    SEARCH = [];
    D.domains.forEach((d) => {
      const doc = new DOMParser().parseFromString("<div>" + d.html + "</div>", "text/html");
      let sec = d.name;
      $$(BLOCK_SEL, doc.body).forEach((el, idx) => {
        if (el.tagName === "H2" || el.tagName === "H3") sec = el.textContent;
        if (el.tagName === "LI" && el.querySelector("li")) return; // skip containers
        const text = el.textContent.replace(/\s+/g, " ").trim();
        if (text.length > 2) SEARCH.push({ d: d.id, idx, sec, text, low: text.toLowerCase() });
      });
    });
    return SEARCH;
  }
  function openSearch() {
    if ($(".search-back")) return;
    const el = document.createElement("div");
    el.className = "search-back";
    el.innerHTML = `<div class="search" role="dialog" aria-label="Search the study guide"><div class="sbox"><svg viewBox="0 0 24 24" width="18" height="18"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input id="sq" type="search" placeholder="Search the guide: slump, Type V, 4:1 ladder, guardrail…" autocomplete="off" /><kbd>esc</kbd></div><div id="sres" class="sres"><p class="sempty">Type to search all ten domains.</p></div></div>`;
    document.body.appendChild(el);
    el.addEventListener("click", (e) => { if (e.target === el) el.remove(); });
    const inp = $("#sq", el);
    inp.focus();
    inp.oninput = () => {
      const terms = inp.value.toLowerCase().split(/\s+/).filter(Boolean);
      const box = $("#sres", el);
      if (!terms.length) { box.innerHTML = '<p class="sempty">Type to search all ten domains.</p>'; return; }
      const hits = buildSearch().filter((r) => terms.every((t) => r.low.includes(t))).slice(0, 25);
      box.innerHTML = hits.length ? hits.map((r, i) => {
        const d = DOM[r.d];
        let t = esc(r.text.length > 170 ? r.text.slice(0, 170) + "…" : r.text);
        terms.forEach((w) => { t = t.replace(new RegExp("(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>"); });
        return `<button class="sh" data-i="${i}" style="--h:${hue(d)}"><span class="sd">${esc(d.name)}<em>${esc(r.sec)}</em></span><span class="st">${t}</span></button>`;
      }).join("") : '<p class="sempty">No matches.</p>';
      $$(".sh", box).forEach((b) => (b.onclick = () => {
        const r = hits[+b.dataset.i];
        el.remove();
        pendingJump = r.idx;
        if (location.hash === "#/study/" + r.d) route(); else location.hash = "#/study/" + r.d;
      }));
    };
  }
  $("#searchBtn").onclick = openSearch;
  document.addEventListener("keydown", (e) => {
    if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !e.target.closest("input,textarea") && location.hash !== "#/run")) { e.preventDefault(); openSearch(); }
  });

  /* ---------- theme ---------- */
  const root = document.documentElement;
  $("#themeBtn").onclick = () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("azroc:theme", next); } catch (e) { /* ignore */ }
  };

  window.addEventListener("hashchange", route);
  window.addEventListener("pagehide", pauseSession);
  route();
})();
