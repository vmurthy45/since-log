"use strict";
/* Since Log — count the days since the moments that matter. Offline-first, data in localStorage. */

const LS_DATA = "sincelog.v1";
const LS_THEME = "sincelog.theme";

/* ---------------- categories ---------------- */
const CATS = [
  { key: "Health",       emoji: "🌿", color: "#2e9e5b" },
  { key: "Habit",        emoji: "🔥", color: "#e0752d" },
  { key: "Milestone",    emoji: "🎉", color: "#8256d0" },
  { key: "Relationship", emoji: "❤️", color: "#d84f7a" },
  { key: "Home",         emoji: "🏠", color: "#2f9c9c" },
  { key: "Money",        emoji: "💰", color: "#2a78d6" },
  { key: "Other",        emoji: "📌", color: "#6b7280" },
];
const BASE_KEYS = CATS.map((c) => c.key);
// colours for user-defined categories, assigned deterministically by name
const CUSTOM_PALETTE = ["#0891b2", "#65a30d", "#c026d3", "#ea580c", "#0d9488", "#7c3aed", "#db2777", "#4f46e5", "#b45309"];
function customColor(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return CUSTOM_PALETTE[h % CUSTOM_PALETTE.length];
}
// resolve any category key (built-in or user-defined) to {key, emoji, color}
function catOf(key) {
  const base = CATS.find((c) => c.key === key);
  if (base) return base;
  return { key, emoji: "🏷️", color: customColor(key) };
}
// distinct user-defined categories currently in use
function customCats() {
  return [...new Set(events.map((e) => e.category))].filter((k) => !BASE_KEYS.includes(k)).sort();
}

/* ---------------- state & storage ---------------- */
let events = [];          // {id, name, date (ISO start), category, notes}
let editingId = null;
let catFilter = "all";
let sortMode = "longest";  // longest | newest | name
let currentTab = "counters";

const SORTS = { longest: "Longest first", newest: "Newest first", name: "A–Z" };
const SORT_ORDER = ["longest", "newest", "name"];

function load() {
  try {
    const raw = localStorage.getItem(LS_DATA);
    if (raw) { events = JSON.parse(raw).events || []; return; }
  } catch (e) { /* corrupted store — start fresh */ }
  events = [];
}
function save() { localStorage.setItem(LS_DATA, JSON.stringify({ v: 1, events })); }
function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

/* ---------------- date maths ---------------- */
function todayISO() {
  const n = new Date();
  return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
const MS_DAY = 86400000;
// whole days between start and today; negative = event is in the future
function daysSince(iso) {
  const a = new Date(iso + "T00:00:00");
  const b = new Date(todayISO() + "T00:00:00");
  return Math.round((b - a) / MS_DAY);
}
// calendar breakdown into {y,m,d} (only meaningful for past dates)
function breakdown(iso) {
  const from = new Date(iso + "T00:00:00");
  const to = new Date(todayISO() + "T00:00:00");
  let y = to.getFullYear() - from.getFullYear();
  let m = to.getMonth() - from.getMonth();
  let d = to.getDate() - from.getDate();
  if (d < 0) { m--; d += new Date(to.getFullYear(), to.getMonth(), 0).getDate(); }
  if (m < 0) { y--; m += 12; }
  return { y, m, d };
}
function humanSpan(iso) {
  const n = daysSince(iso);
  if (n === 0) return "today";
  if (n < 0) return "";
  const { y, m, d } = breakdown(iso);
  const parts = [];
  if (y) parts.push(y + (y === 1 ? " year" : " years"));
  if (m) parts.push(m + (m === 1 ? " month" : " months"));
  if (!y && d) parts.push(d + (d === 1 ? " day" : " days"));
  if (!parts.length) return "today";
  return parts.slice(0, 2).join(", ");
}

// Next round-number milestone (day counts + yearly anniversaries).
function milestoneInfo(days) {
  if (days < 0) return null;
  const cand = new Set([7, 30, 50]);
  for (let h = 100; h <= days + 1000; h += 100) cand.add(h);
  for (let y = 365; y <= days + 400; y += 365) cand.add(y);
  const arr = [...cand].sort((a, b) => a - b);
  let next = null, prev = 0;
  for (const v of arr) { if (v <= days) prev = v; else { next = v; break; } }
  if (next == null) return null;
  return { next, prev };
}
function milestoneLabel(n) {
  if (n % 365 === 0) { const y = n / 365; return y + (y === 1 ? " year" : " years"); }
  return fmtInt(n) + " days";
}

/* ---------------- formatting ---------------- */
const fmtInt = (n) => n.toLocaleString("en-NZ");
const fmtNZDate = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtNiceDate = (iso) => { const [y, m, d] = iso.split("-"); return `${+d} ${MONTHS[+m - 1]} ${y}`; };

/* ---------------- tiny DOM helpers ---------------- */
const $ = (s) => document.querySelector(s);
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

/* ---------------- tabs ---------------- */
function switchTab(name) {
  currentTab = name;
  document.querySelectorAll(".tab").forEach((s) => { s.hidden = s.id !== "tab-" + name; });
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  if (name === "counters") renderCounters();
  if (name === "stats") renderStats();
  if (name === "data") renderData();
  if (name === "add" && !editingId) prepAddForm();
  window.scrollTo(0, 0);
}

/* ---------------- add / edit form ---------------- */
function buildCatChips() {
  const box = $("#eCat");
  box.textContent = "";
  const chip = (c) => {
    const b = el("button", null);
    b.type = "button";
    b.dataset.v = c.key;
    b.style.setProperty("--cat", c.color);
    b.append(el("span", null, c.emoji), el("span", null, c.key));
    b.setAttribute("role", "radio");
    b.addEventListener("click", () => {
      setCat(c.key);
      if (c.key === "Other") $("#customCat").focus();
    });
    box.appendChild(b);
  };
  for (const c of CATS) if (c.key !== "Other") chip(c);   // built-ins (Other goes last)
  for (const k of customCats()) chip(catOf(k));            // reuse your own categories
  chip(catOf("Other"));                                   // gateway to a new custom name
}
function setCat(v) {
  document.querySelectorAll("#eCat button").forEach((b) =>
    b.setAttribute("aria-checked", b.dataset.v === v ? "true" : "false"));
  $("#customCatWrap").hidden = v !== "Other";
}
// select the chip matching `cat`; if none exists it's a fresh custom name → Other + fill input
function selectCategory(cat) {
  let found = false;
  document.querySelectorAll("#eCat button").forEach((b) => { if (b.dataset.v === cat) found = true; });
  if (found) { setCat(cat); $("#customCat").value = ""; }
  else { setCat("Other"); $("#customCat").value = cat; }
}
function getCat() {
  const b = document.querySelector('#eCat button[aria-checked="true"]');
  const key = b ? b.dataset.v : "Other";
  if (key === "Other") {
    const custom = $("#customCat").value.trim();
    if (custom) return custom;
  }
  return key;
}

function prepAddForm() {
  editingId = null;
  $("#addTitle").textContent = "Add event";
  $("#saveBtn").textContent = "Save event";
  $("#cancelEditBtn").hidden = true;
  $("#deleteBtn").hidden = true;
  $("#eventForm").reset();
  $("#eDate").value = todayISO();
  buildCatChips();
  $("#customCat").value = "";
  setCat("Milestone");
  updatePreview();
}

function updatePreview() {
  const box = $("#livePreview");
  const iso = $("#eDate").value;
  const hint = $("#dateHint");
  box.textContent = "";
  if (!iso) { box.hidden = true; hint.textContent = ""; return; }
  const n = daysSince(iso);
  hint.textContent = fmtNiceDate(iso);
  if (n === 0) {
    box.append("That's ", el("strong", null, "today"), " — the count starts now.");
  } else if (n > 0) {
    box.append("That's ", el("strong", null, fmtInt(n) + (n === 1 ? " day" : " days")), " ago");
    const span = humanSpan(iso);
    if (span && span !== fmtInt(n) + " days") box.append(" · " + span);
    box.append(".");
  } else {
    box.append(el("strong", null, fmtInt(-n) + (n === -1 ? " day" : " days")), " to go — counting down.");
  }
  box.hidden = false;
}

function onSubmit(ev) {
  ev.preventDefault();
  const entry = {
    id: editingId || uid(),
    name: $("#eName").value.trim(),
    date: $("#eDate").value,
    category: getCat(),
    notes: $("#eNotes").value.trim() || null,
  };
  if (!entry.name) { toast("Give the event a name"); return; }
  if (!entry.date) { toast("Pick a start date"); return; }
  if (editingId) {
    events = events.map((e) => (e.id === editingId ? entry : e));
    toast("Event updated");
    editingId = null;
  } else {
    events.push(entry);
    const n = daysSince(entry.date);
    toast(n > 0 ? `Saved — ${fmtInt(n)} days and counting` : "Event saved");
  }
  save();
  switchTab("counters");
}

function startEdit(id) {
  const e = events.find((x) => x.id === id);
  if (!e) return;
  editingId = id;
  switchTab("add");
  $("#addTitle").textContent = "Edit event";
  $("#saveBtn").textContent = "Save changes";
  $("#cancelEditBtn").hidden = false;
  $("#deleteBtn").hidden = false;
  $("#eName").value = e.name;
  $("#eDate").value = e.date;
  buildCatChips();
  selectCategory(e.category);
  $("#eNotes").value = e.notes || "";
  updatePreview();
}

/* ---------------- counters (home) ---------------- */
function usedCats() {
  const present = new Set(events.map((e) => e.category));
  const base = CATS.filter((c) => present.has(c.key));
  return [...base, ...customCats().map(catOf)];
}
function renderCatFilters() {
  const box = $("#catFilters");
  box.textContent = "";
  const mk = (key, label, emoji, color) => {
    const b = el("button", catFilter === key ? "on" : null);
    if (emoji) b.append(el("span", null, emoji));
    b.append(el("span", null, label));
    if (color && catFilter !== key) b.style.setProperty("--cat", color);
    b.addEventListener("click", () => { catFilter = key; renderCounters(); });
    box.appendChild(b);
  };
  mk("all", "All", "", "");
  for (const c of usedCats()) mk(c.key, c.key, c.emoji, c.color);
}

function sortedEvents(list) {
  const arr = [...list];
  if (sortMode === "longest") arr.sort((a, b) => daysSince(b.date) - daysSince(a.date));
  else if (sortMode === "newest") arr.sort((a, b) => daysSince(a.date) - daysSince(b.date));
  else arr.sort((a, b) => a.name.localeCompare(b.name));
  return arr;
}

function counterCard(e) {
  const c = catOf(e.category);
  const n = daysSince(e.date);
  const card = el("button", "counter" + (n < 0 ? " upcoming" : ""));
  card.type = "button";
  card.style.setProperty("--cat", c.color);
  card.addEventListener("click", () => startEdit(e.id));

  const top = el("div", "c-top");
  top.appendChild(el("div", "c-emoji", c.emoji));
  const mid = el("div", "c-mid");
  mid.appendChild(el("div", "c-name", e.name));
  const meta = el("div", "c-meta");
  meta.appendChild(el("span", "c-cat", c.key));
  meta.append(" · since " + fmtNiceDate(e.date));
  if (e.notes) meta.append(" · " + e.notes);
  mid.appendChild(meta);
  top.appendChild(mid);

  const right = el("div", "c-right");
  right.appendChild(el("div", "c-num", fmtInt(Math.abs(n))));
  right.appendChild(el("div", "c-unit", n < 0 ? (n === -1 ? "day to go" : "days to go") : (Math.abs(n) === 1 ? "day" : "days")));
  top.appendChild(right);
  card.appendChild(top);

  // milestone progress (past events only)
  const mi = milestoneInfo(n);
  if (n === 0) {
    card.appendChild(el("div", "c-today", "🎉 The count starts today!"));
  } else if (mi && mi.next === n) {
    card.appendChild(el("div", "c-today", `🎯 ${milestoneLabel(n)} today!`));
  } else if (mi) {
    const wrap = el("div", "c-mile");
    const row = el("div", "c-mile-row");
    const left = el("span");
    left.append("Next: ");
    left.appendChild(el("strong", null, milestoneLabel(mi.next)));
    row.appendChild(left);
    row.appendChild(el("span", null, fmtInt(mi.next - n) + " to go"));
    wrap.appendChild(row);
    const bar = el("div", "c-bar");
    const fill = el("span");
    fill.style.width = Math.round(((n - mi.prev) / (mi.next - mi.prev)) * 100) + "%";
    bar.appendChild(fill);
    wrap.appendChild(bar);
    card.appendChild(wrap);
  }
  return card;
}

function renderCounters() {
  renderCatFilters();
  $("#sortBtn").textContent = "↕ " + SORTS[sortMode];
  const box = $("#counterList");
  box.textContent = "";

  if (!events.length) {
    box.appendChild(el("div", "empty", "No events yet. Tap ＋ Add to start counting the days since something — a habit kicked, a milestone hit, a date worth remembering."));
    $("#countersSummary").textContent = "";
    return;
  }
  const filtered = catFilter === "all" ? events : events.filter((e) => e.category === catFilter);
  const past = filtered.filter((e) => daysSince(e.date) >= 0).length;
  $("#countersSummary").textContent =
    `${filtered.length} event${filtered.length === 1 ? "" : "s"}` + (filtered.length - past ? ` · ${filtered.length - past} upcoming` : "");

  if (!filtered.length) { box.appendChild(el("div", "empty", "No events in this category.")); return; }
  for (const e of sortedEvents(filtered)) box.appendChild(counterCard(e));
}

/* ---------------- stats ---------------- */
function renderStats() {
  renderTiles();
  renderCatChart();
  renderUpcoming();
  renderInsights();
}

function renderTiles() {
  const box = $("#tiles");
  box.textContent = "";
  const past = events.filter((e) => daysSince(e.date) >= 0);
  const longest = past.reduce((m, e) => (!m || daysSince(e.date) > daysSince(m.date) ? e : m), null);
  const newest = past.reduce((m, e) => (!m || daysSince(e.date) < daysSince(m.date) ? e : m), null);
  const nCats = new Set(events.map((e) => e.category)).size;
  const tiles = [
    ["Tracking", events.length ? fmtInt(events.length) : "–", "", events.length === 1 ? "event" : "events"],
    ["Longest run", longest ? fmtInt(daysSince(longest.date)) : "–", "days", longest ? longest.name : ""],
    ["Most recent", newest ? fmtInt(daysSince(newest.date)) : "–", "days", newest ? newest.name : ""],
    ["Categories", nCats ? fmtInt(nCats) : "–", "", "in use"],
  ];
  for (const [label, value, unit, note] of tiles) {
    const t = el("div", "tile");
    t.appendChild(el("div", "t-label", label));
    const v = el("div", "t-value", value);
    if (unit) v.appendChild(el("span", "t-unit", unit));
    t.appendChild(v);
    t.appendChild(el("div", "t-note", note));
    box.appendChild(t);
  }
}

function renderCatChart() {
  const box = $("#catChart");
  box.textContent = "";
  if (!events.length) { box.appendChild(el("div", "empty", "Add events to see the breakdown.")); return; }
  const order = [...CATS.map((c) => c.key).filter((k) => events.some((e) => e.category === k)), ...customCats()];
  const counts = order.map((k) => ({ c: catOf(k), n: events.filter((e) => e.category === k).length }));
  const max = Math.max(...counts.map((x) => x.n));
  for (const { c, n } of counts) {
    const row = el("div", "cat-bar");
    row.appendChild(el("div", "cb-emoji", c.emoji));
    const body = el("div", "cb-body");
    const label = el("div", "cb-label");
    label.appendChild(el("span", null, c.key));
    label.appendChild(el("b", null, String(n)));
    body.appendChild(label);
    const track = el("div", "cb-track");
    const fill = el("span");
    fill.style.width = Math.round((n / max) * 100) + "%";
    fill.style.background = c.color;
    track.appendChild(fill);
    body.appendChild(track);
    row.appendChild(body);
    box.appendChild(row);
  }
}

function renderUpcoming() {
  const box = $("#upcomingList");
  box.textContent = "";
  const rows = events
    .map((e) => ({ e, n: daysSince(e.date), mi: milestoneInfo(daysSince(e.date)) }))
    .filter((r) => r.mi)
    .map((r) => ({ ...r, togo: r.mi.next - r.n }))
    .sort((a, b) => a.togo - b.togo)
    .slice(0, 6);
  if (!rows.length) { box.appendChild(el("div", "empty", "No milestones on the horizon yet.")); return; }
  for (const r of rows) {
    const c = catOf(r.e.category);
    const row = el("div", "up-row");
    const left = el("div", "up-name");
    left.appendChild(el("strong", null, r.e.name));
    left.append(" → " + milestoneLabel(r.mi.next));
    row.appendChild(left);
    const when = el("div", "up-when");
    when.appendChild(el("b", null, fmtInt(r.togo)));
    when.append(r.togo === 1 ? " day" : " days");
    row.appendChild(when);
    row.style.setProperty("--cat", c.color);
    box.appendChild(row);
  }
}

function renderInsights() {
  const ul = $("#insightsList");
  ul.textContent = "";
  const add = (emoji, frag) => {
    const li = el("li");
    li.appendChild(el("span", "em", emoji));
    const d = el("div");
    d.append(...frag);
    li.appendChild(d);
    ul.appendChild(li);
  };
  const b = (t) => el("strong", null, t);
  const past = events.filter((e) => daysSince(e.date) >= 0);
  if (!past.length) { add("·", ["No events to summarise yet."]); return; }

  const total = past.reduce((s, e) => s + daysSince(e.date), 0);
  add("📆", [`Across ${past.length} event${past.length === 1 ? "" : "s"} you're tracking `, b(fmtInt(total) + " days"), ` in total — about `, b(fmtInt(Math.round(total / past.length)) + " days"), ` each on average.`]);

  const longest = past.reduce((m, e) => (daysSince(e.date) > daysSince(m.date) ? e : m), past[0]);
  add(catOf(longest.category).emoji, [b(longest.name), ` is your longest run at `, b(fmtInt(daysSince(longest.date)) + " days"), ` — since ${fmtNiceDate(longest.date)}.`]);

  // soonest milestone
  const up = events
    .map((e) => ({ e, mi: milestoneInfo(daysSince(e.date)), n: daysSince(e.date) }))
    .filter((r) => r.mi).map((r) => ({ ...r, togo: r.mi.next - r.n }))
    .sort((a, b2) => a.togo - b2.togo)[0];
  if (up) add("🎯", [b(up.e.name), ` reaches `, b(milestoneLabel(up.mi.next)), ` in `, b(fmtInt(up.togo) + (up.togo === 1 ? " day" : " days")), `.`]);

  // busiest category
  const byCat = {};
  for (const e of events) byCat[e.category] = (byCat[e.category] || 0) + 1;
  const top = Object.entries(byCat).sort((a, b2) => b2[1] - a[1])[0];
  if (top && top[1] > 1) add(catOf(top[0]).emoji, [`Most of your events sit in `, b(top[0]), ` (${top[1]} of ${events.length}).`]);

  const upcoming = events.filter((e) => daysSince(e.date) < 0).length;
  if (upcoming) add("⏳", [b(fmtInt(upcoming) + (upcoming === 1 ? " event" : " events")), ` still counting down to their start date.`]);
}

/* ---------------- data tab: export / import ---------------- */
function toCSV() {
  const head = "Event,Start date,Category,Notes,Days since";
  const esc = (s) => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
  const lines = [...events].sort((a, b) => a.date.localeCompare(b.date)).map((e) =>
    [esc(e.name), e.date, e.category, esc(e.notes || ""), daysSince(e.date)].join(","));
  return head + "\n" + lines.join("\n") + "\n";
}
function csvFileName() { return "since-log-" + todayISO() + ".csv"; }
function downloadCSV(text, name) {
  const blob = new Blob([text], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast("CSV downloaded");
}
async function shareCSV() {
  try {
    await navigator.share({ files: [new File([toCSV()], csvFileName(), { type: "text/csv" })], title: "Since Log export" });
  } catch (e) { /* user cancelled the share sheet */ }
}

function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}
function parseDateCell(s) {
  s = (s || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}
function importCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error("No data rows found");
  const head = rows[0].map((h) => h.toLowerCase());
  const col = (name) => head.findIndex((h) => h.startsWith(name));
  const iName = col("event"), iDate = col("start date") >= 0 ? col("start date") : col("date"),
    iCat = col("category"), iNotes = col("notes");
  if (iName < 0 || iDate < 0) throw new Error("Missing Event / Start date columns");
  const out = [];
  for (const r of rows.slice(1)) {
    const name = (r[iName] || "").trim();
    const date = parseDateCell(r[iDate]);
    if (!name || !date) continue;
    const cat = (iCat >= 0 ? r[iCat] || "" : "").trim();
    out.push({
      id: uid(), name, date,
      category: cat || "Other",
      notes: iNotes >= 0 ? (r[iNotes] || "").trim() || null : null,
    });
  }
  if (!out.length) throw new Error("No valid rows found");
  return out;
}

function renderData() {
  $("#dataSummary").textContent = `${events.length} event${events.length === 1 ? "" : "s"} on this device.`;
  $("#shareBtn").hidden = !(navigator.share && navigator.canShare &&
    navigator.canShare({ files: [new File(["x"], "x.csv", { type: "text/csv" })] }));
}

/* ---------------- theme ---------------- */
function applyTheme() {
  const t = localStorage.getItem(LS_THEME) || "auto";
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}
function cycleTheme() {
  const order = ["auto", "light", "dark"];
  const cur = localStorage.getItem(LS_THEME) || "auto";
  const next = order[(order.indexOf(cur) + 1) % order.length];
  localStorage.setItem(LS_THEME, next);
  applyTheme();
  toast("Theme: " + next);
}

/* ---------------- wire up ---------------- */
function init() {
  load();
  applyTheme();
  buildCatChips();

  document.querySelectorAll(".tabbar button").forEach((b) =>
    b.addEventListener("click", () => {
      if (editingId && b.dataset.tab !== "add") editingId = null;
      switchTab(b.dataset.tab);
    }));

  $("#eventForm").addEventListener("submit", onSubmit);
  $("#eDate").addEventListener("input", updatePreview);
  $("#eName").addEventListener("input", updatePreview);
  $("#cancelEditBtn").addEventListener("click", () => { editingId = null; switchTab("counters"); });
  $("#deleteBtn").addEventListener("click", () => {
    if (!editingId) return;
    const e = events.find((x) => x.id === editingId);
    if (confirm(`Delete "${e.name}"? This can't be undone.`)) {
      events = events.filter((x) => x.id !== editingId);
      save();
      editingId = null;
      toast("Event deleted");
      switchTab("counters");
    }
  });

  $("#sortBtn").addEventListener("click", () => {
    sortMode = SORT_ORDER[(SORT_ORDER.indexOf(sortMode) + 1) % SORT_ORDER.length];
    renderCounters();
  });

  $("#themeBtn").addEventListener("click", cycleTheme);
  $("#exportBtn").addEventListener("click", () => {
    if (!events.length) { toast("Nothing to export yet"); return; }
    downloadCSV(toCSV(), csvFileName());
  });
  $("#shareBtn").addEventListener("click", shareCSV);
  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = "";
    if (!f) return;
    try {
      const records = importCSV(await f.text());
      if (confirm(`Replace the ${events.length} event${events.length === 1 ? "" : "s"} on this device with ${records.length} imported one${records.length === 1 ? "" : "s"}?`)) {
        events = records;
        save();
        toast(`Imported ${records.length} event${records.length === 1 ? "" : "s"}`);
        renderData();
      }
    } catch (err) {
      alert("Couldn't import that file: " + err.message);
    }
  });
  $("#wipeBtn").addEventListener("click", () => {
    if (confirm("Erase ALL events from this device? Consider exporting a CSV first.") &&
        confirm("Really erase everything? This cannot be undone.")) {
      events = [];
      save();
      toast("All data erased");
      renderData();
    }
  });

  switchTab("counters");

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

init();
