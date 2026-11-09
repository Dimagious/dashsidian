/* Shared by every page under guides/. Does what the inline script in
   index.html does (theme, YAML colouring, copy, folders, drawer, quick
   switcher), but builds markup from DOM nodes where that one uses innerHTML,
   plus the Tracker/dataviewjs tabs. No dependencies, no requests.
   This is a web page, not plugin code: it reads `window.document` and
   `window.localStorage` by name and builds markup from DOM nodes, which is
   also what the community scanner asks of the files it walks. */
(function () {
  var doc = window.document;
  var root = doc.documentElement;
  root.classList.remove("no-js");

  /* ---------- "On this page" reads down the first column, then the second ---------- */
  doc.querySelectorAll(".toc ol").forEach(function (ol) {
    ol.style.setProperty("--toc-rows", String(Math.ceil(ol.children.length / 2)));
  });

  /* ---------- theme: system, light, dark (same storage key as the home page) ---------- */
  var order = ["system", "light", "dark"];
  var icons = { system: "#i-auto", light: "#i-sun", dark: "#i-moon" };
  function readTheme() { try { return window.localStorage.getItem("dashy-theme") || "system"; } catch (_e) { return "system"; } }
  function applyTheme(mode) {
    if (mode === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", mode);
    var media = mode === "dark" ? "all" : mode === "light" ? "not all" : "(prefers-color-scheme: dark)";
    doc.querySelectorAll("source[data-dark]").forEach(function (s) { s.media = media; });
    doc.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
      b.querySelector("use").setAttribute("href", icons[mode]);
      b.title = "Theme: " + mode + " (click to change)";
    });
  }
  var theme = readTheme();
  applyTheme(theme);
  doc.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
    b.addEventListener("click", function () {
      theme = order[(order.indexOf(theme) + 1) % order.length];
      try { window.localStorage.setItem("dashy-theme", theme); } catch (_e) { /* storage blocked: the choice lasts for this visit */ }
      applyTheme(theme);
    });
  });

  /* ---------- YAML colouring: fenced blocks and frontmatter ---------- */
  // Each piece goes into `into` as a text node, or as a span with a class.
  function put(into, cls, text) {
    if (!text) return;
    if (!cls) { into.appendChild(doc.createTextNode(text)); return; }
    var span = doc.createElement("span");
    span.className = cls;
    span.textContent = text;
    into.appendChild(span);
  }
  function scalar(v, into) {
    var t = v.trim();
    if (!t) { put(into, null, v); return; }
    var lead = v.match(/^\s*/)[0], trail = v.match(/\s*$/)[0];
    var cls = /^-?\d[\d_.]*$/.test(t) || /^(true|false)$/.test(t) ? "t-num" : "t-str";
    put(into, null, lead);
    put(into, cls, t);
    put(into, null, trail);
  }
  function inline(body, into) {
    var buf = "", inQ = false;
    function flush(isKey) {
      if (!buf) return;
      if (isKey) put(into, "t-key", buf); else scalar(buf, into);
      buf = "";
    }
    for (var i = 0; i < body.length; i++) {
      var c = body[i];
      if (c === '"' || c === "'") { inQ = !inQ; buf += c; continue; }
      if (inQ) { buf += c; continue; }
      if (c === ":" && (body[i + 1] === " " || i === body.length - 1)) { flush(true); put(into, "t-p", ":"); continue; }
      if ("{},[]".indexOf(c) >= 0) { flush(false); put(into, "t-p", c); continue; }
      buf += c;
    }
    flush(false);
  }
  function line(l, into) {
    var m;
    if ((m = l.match(/^```\s?([\w-]*)$/))) { put(into, "t-fence", "```"); put(into, "t-lang", m[1]); return; }
    if (l === "---") { put(into, "t-fence", "---"); return; }
    if ((m = l.match(/^(#{1,6}\s.*)$/))) { put(into, "t-p", m[1]); return; }
    if ((m = l.match(/^(\s*-\s)(.*)$/))) { put(into, "t-p", m[1]); inline(m[2], into); return; }
    if ((m = l.match(/^(\s*)([\w.-]+):(\s?)(.*)$/))) {
      put(into, null, m[1]); put(into, "t-key", m[2]); put(into, "t-p", ":"); put(into, null, m[3]);
      inline(m[4], into);
      return;
    }
    put(into, null, l);
  }
  doc.querySelectorAll("code.yaml-fenced").forEach(function (el) {
    var raw = el.textContent;
    el.dataset.raw = raw;
    var out = doc.createDocumentFragment();
    raw.split("\n").forEach(function (l, i) {
      if (i) put(out, null, "\n");
      line(l, out);
    });
    el.replaceChildren(out);
  });

  /* ---------- copy buttons ---------- */
  doc.querySelectorAll("[data-code] .copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var code = btn.closest("[data-code]").querySelector("code");
      var text = code.dataset.raw || code.textContent;
      function done(msg) { btn.textContent = msg; window.setTimeout(function () { btn.textContent = "Copy"; }, 1600); }
      if (!navigator.clipboard) { done("Select and copy"); return; }
      navigator.clipboard.writeText(text).then(function () { done("Copied"); }, function () { done("Copy blocked"); });
    });
  });

  /* ---------- Tracker / dataviewjs tabs ---------- */
  doc.querySelectorAll("[data-tabs]").forEach(function (box) {
    var tabs = box.querySelectorAll('[role="tab"]');
    function pick(tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        doc.getElementById(t.getAttribute("aria-controls")).hidden = !on;
      });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { pick(t); });
      t.addEventListener("keydown", function (ev) {
        var d = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
        if (d) { var n = tabs[(i + d + tabs.length) % tabs.length]; pick(n); n.focus(); ev.preventDefault(); }
      });
    });
    pick(tabs[0]);
  });

  /* ---------- folders ---------- */
  doc.querySelectorAll("[data-folder]").forEach(function (f) {
    f.addEventListener("click", function () { f.parentElement.classList.toggle("closed"); });
  });

  /* ---------- mobile drawer ---------- */
  var menuBtn = doc.getElementById("menuBtn");
  function drawer(open) {
    doc.body.classList.toggle("drawer", open);
    if (menuBtn) menuBtn.setAttribute("aria-expanded", String(open));
  }
  if (menuBtn) menuBtn.addEventListener("click", function () { drawer(!doc.body.classList.contains("drawer")); });
  var scrim = doc.getElementById("drawerScrim");
  if (scrim) scrim.addEventListener("click", function () { drawer(false); });

  /* ---------- quick switcher: headings on this page, then every page in the tree ---------- */
  var pal = doc.getElementById("palette"), palScrim = doc.getElementById("paletteScrim");
  if (!pal) return;
  var input = doc.getElementById("paletteInput"), list = doc.getElementById("paletteList");
  var entries = [];
  doc.querySelectorAll("main h2[id]").forEach(function (h) {
    entries.push({ href: "#" + h.id, title: h.dataset.short || h.textContent.replace(/^\d+\s*/, "").trim(), where: "on this page" });
  });
  doc.querySelectorAll("#tree a[href]").forEach(function (a) {
    if (a.classList.contains("active")) return;
    entries.push({ href: a.getAttribute("href"), title: a.textContent.replace(/\.md$/, "").trim(), where: a.dataset.where || "" });
  });
  var sel = 0, shown = [];
  function render() {
    var q = input.value.trim().toLowerCase();
    shown = entries.filter(function (e) { return !q || (e.title + " " + e.where).toLowerCase().indexOf(q) >= 0; });
    sel = Math.min(sel, Math.max(shown.length - 1, 0));
    list.replaceChildren();
    if (!shown.length) {
      var none = doc.createElement("li");
      none.className = "none";
      none.textContent = "No note by that name.";
      list.appendChild(none);
      return;
    }
    shown.forEach(function (e, i) {
      var li = doc.createElement("li"), a = doc.createElement("a");
      a.setAttribute("href", e.href);
      a.setAttribute("class", i === sel ? "sel" : "");
      a.textContent = e.title;
      if (e.where) {
        var small = doc.createElement("small");
        small.textContent = e.where;
        a.appendChild(small);
      }
      li.appendChild(a);
      list.appendChild(li);
    });
  }
  function openPal() { pal.classList.add("open"); palScrim.classList.add("open"); input.value = ""; sel = 0; render(); input.focus(); drawer(false); }
  function closePal() { pal.classList.remove("open"); palScrim.classList.remove("open"); }
  doc.querySelectorAll("[data-open-palette]").forEach(function (b) { b.addEventListener("click", openPal); });
  palScrim.addEventListener("click", closePal);
  input.addEventListener("input", function () { sel = 0; render(); });
  list.addEventListener("click", function () { closePal(); });
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "ArrowDown") { sel = Math.min(sel + 1, shown.length - 1); render(); ev.preventDefault(); }
    else if (ev.key === "ArrowUp") { sel = Math.max(sel - 1, 0); render(); ev.preventDefault(); }
    else if (ev.key === "Enter" && shown[sel]) { closePal(); location.href = shown[sel].href; }
  });
  doc.addEventListener("keydown", function (ev) {
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "k") { ev.preventDefault(); pal.classList.contains("open") ? closePal() : openPal(); }
    else if (ev.key === "Escape") { closePal(); drawer(false); }
  });
})();
