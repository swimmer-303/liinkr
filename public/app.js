import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  onSnapshot, query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ADMIN_UID } from "/config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// grab the bits of the page
const signinEl = document.getElementById("signin");
const nopeEl = document.getElementById("nope");
const mainEl = document.getElementById("main");
const msg = document.getElementById("msg");
const linksEl = document.getElementById("links");

document.getElementById("signinBtn").onclick = () =>
  signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => alert(e.message));
document.getElementById("signoutBtn").onclick = () => signOut(auth);
document.getElementById("signoutBtn2").onclick = () => signOut(auth);

let unsub = null;

onAuthStateChanged(auth, (user) => {
  // flip everything off first
  signinEl.hidden = nopeEl.hidden = mainEl.hidden = true;
  if (unsub) { unsub(); unsub = null; }

  if (!user) {
    signinEl.hidden = false;
    return;
  }
  if (user.uid !== ADMIN_UID) {
    nopeEl.hidden = false;
    return;
  }
  mainEl.hidden = false;
  watchLinks();
});

// random 6 char code when you dont give a slug
function randomCode() {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

document.getElementById("newLink").addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "";

  const urlInput = document.getElementById("url");
  const slugInput = document.getElementById("slug");
  const url = urlInput.value.trim();
  let code = slugInput.value.trim();

  if (!url) return;

  // if they typed a slug, keep it clean-ish
  if (code) {
    code = code.toLowerCase().replace(/[^a-z0-9-_]/g, "");
    if (!code) { msg.textContent = "that slug has no usable characters"; return; }
    const existing = await getDoc(doc(db, "links", code));
    if (existing.exists()) { msg.textContent = "that slug is already taken"; return; }
  } else {
    // make sure the random one isnt somehow taken
    do { code = randomCode(); } while ((await getDoc(doc(db, "links", code))).exists());
  }

  try {
    await setDoc(doc(db, "links", code), {
      url,
      clicks: 0,
      created: serverTimestamp()
    });
    urlInput.value = "";
    slugInput.value = "";
    const full = location.origin + "/" + code;
    msg.textContent = "made " + full;
    navigator.clipboard?.writeText(full).catch(() => {});
  } catch (err) {
    msg.textContent = "couldnt save: " + err.message;
  }
});

function watchLinks() {
  const q = query(collection(db, "links"), orderBy("created", "desc"));
  unsub = onSnapshot(q, (snap) => {
    linksEl.innerHTML = "";
    snap.forEach((d) => {
      const data = d.data();
      const li = document.createElement("li");

      const code = document.createElement("span");
      code.className = "code";
      code.textContent = "/" + d.id;

      const dest = document.createElement("span");
      dest.className = "dest";
      dest.textContent = data.url;
      dest.title = data.url;

      const clicks = document.createElement("span");
      clicks.className = "clicks";
      clicks.textContent = (data.clicks || 0) + " hits";

      const copy = document.createElement("button");
      copy.textContent = "copy";
      copy.onclick = () => navigator.clipboard?.writeText(location.origin + "/" + d.id);

      const stats = document.createElement("button");
      stats.textContent = "stats";

      const del = document.createElement("button");
      del.textContent = "delete";
      del.onclick = () => {
        if (confirm("delete /" + d.id + " ?")) deleteDoc(doc(db, "links", d.id));
      };

      const panel = document.createElement("div");
      panel.className = "stats";
      panel.hidden = true;
      stats.onclick = () => {
        panel.hidden = !panel.hidden;
        if (!panel.hidden && !panel.dataset.loaded) {
          panel.dataset.loaded = "1";
          loadStats(d.id, panel);
        }
      };

      li.append(code, dest, clicks, copy, stats, del, panel);
      linksEl.appendChild(li);
    });
  });
}

// rough user-agent sniffing. not perfect but good enough to eyeball traffic.
function browserOf(ua) {
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "other";
}
function osOf(ua) {
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "other";
}
function refOf(r) {
  if (!r) return "direct";
  try { return new URL(r).hostname.replace(/^www\./, ""); } catch (e) { return "other"; }
}

// device bucket — prefer what the redirect page recorded, fall back to ua sniffing
// for older hits that predate the field.
function deviceOf(r) {
  if (r.dev) return r.dev;
  const ua = r.ua || "";
  if (/iPad|Tablet/.test(ua)) return "tablet";
  if (/Mobi|iPhone|Android/.test(ua)) return "mobile";
  return "desktop";
}

// roll a timezone up to a continent-ish region. its only a proxy (we never do a
// real geo-ip lookup) but its free and surprisingly decent.
function regionOf(tz) {
  if (!tz) return "?";
  const head = tz.split("/")[0];
  const map = {
    America: "americas", Europe: "europe", Asia: "asia", Africa: "africa",
    Australia: "oceania", Pacific: "oceania", Atlantic: "atlantic",
    Indian: "indian ocean", Antarctica: "antarctica"
  };
  return map[head] || head.toLowerCase() || "?";
}

const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// count distinct non-empty values for a field
function distinct(rows, key) {
  const s = new Set();
  for (const r of rows) { if (r[key]) s.add(r[key]); }
  return s.size;
}

// day-of-week chart, kept in sun..sat order instead of sorted by count
function dowChart(rows) {
  const buckets = new Array(7).fill(0);
  for (const r of rows) {
    if (typeof r.dow === "number" && r.dow >= 0 && r.dow < 7) buckets[r.dow]++;
  }
  const max = Math.max(1, ...buckets);
  const wrap = document.createElement("div");
  wrap.className = "bd";
  const h = document.createElement("h4");
  h.textContent = "day of week";
  wrap.appendChild(h);
  for (let i = 0; i < 7; i++) {
    const row = document.createElement("div");
    row.className = "bar";
    const bar = document.createElement("span");
    bar.style.width = Math.max(4, Math.round((buckets[i] / max) * 100)) + "%";
    const lab = document.createElement("em");
    lab.textContent = DOW[i];
    const cnt = document.createElement("b");
    cnt.textContent = buckets[i];
    row.append(bar, lab, cnt);
    wrap.appendChild(row);
  }
  return wrap;
}

// 24 cells, one per hour of the visitors local day, shaded by how busy it is
function hourHeat(rows) {
  const buckets = new Array(24).fill(0);
  let any = false;
  for (const r of rows) {
    if (typeof r.hr === "number" && r.hr >= 0 && r.hr < 24) { buckets[r.hr]++; any = true; }
  }
  const wrap = document.createElement("div");
  wrap.className = "bd";
  const h = document.createElement("h4");
  h.textContent = "hour of day (visitor local)";
  wrap.appendChild(h);
  if (!any) { wrap.appendChild(document.createTextNode("not enough data yet")); return wrap; }
  const max = Math.max(1, ...buckets);
  const grid = document.createElement("div");
  grid.className = "heat";
  buckets.forEach((n, i) => {
    const cell = document.createElement("span");
    const o = n ? 0.15 + 0.85 * (n / max) : 0.04;
    cell.style.background = "rgba(79,124,214," + o.toFixed(2) + ")";
    cell.title = i + ":00 — " + n;
    grid.appendChild(cell);
  });
  wrap.appendChild(grid);
  return wrap;
}

// dump some rows to a csv file the browser downloads. handy for digging in a sheet.
function exportCsv(name, rows) {
  const cols = ["ts", "code", "ref", "ua", "dev", "lang", "tz", "vid", "fresh", "hr", "dow", "net", "dark", "bot", "qs"];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [cols.join(",")];
  for (const r of rows) {
    const ts = r.ts && r.ts.toDate ? r.ts.toDate().toISOString() : "";
    lines.push(cols.map((c) => esc(c === "ts" ? ts : r[c])).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// little "X unique / Y new" style header used in a few spots
function statLine(label, n) {
  const span = document.createElement("span");
  span.className = "kpi";
  const b = document.createElement("b");
  b.textContent = n;
  const e = document.createElement("em");
  e.textContent = label;
  span.append(b, e);
  return span;
}

// count things into a map, then hand back the top few sorted high->low
function tally(rows, fn) {
  const m = {};
  for (const r of rows) { const k = fn(r) || "?"; m[k] = (m[k] || 0) + 1; }
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

function breakdown(title, pairs, limit) {
  const wrap = document.createElement("div");
  wrap.className = "bd";
  const h = document.createElement("h4");
  h.textContent = title;
  wrap.appendChild(h);
  const top = limit ? pairs.slice(0, limit) : pairs;
  const max = top.length ? top[0][1] : 1;
  for (const [label, n] of top) {
    const row = document.createElement("div");
    row.className = "bar";
    const bar = document.createElement("span");
    bar.style.width = Math.max(4, Math.round((n / max) * 100)) + "%";
    const lab = document.createElement("em");
    lab.textContent = label;
    const cnt = document.createElement("b");
    cnt.textContent = n;
    row.append(bar, lab, cnt);
    wrap.appendChild(row);
  }
  if (!top.length) wrap.appendChild(document.createTextNode("none yet"));
  return wrap;
}

// last 30 days as little daily bars
function timeline(rows) {
  const days = 30;
  const buckets = new Array(days).fill(0);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)).getTime();
  for (const r of rows) {
    const t = r.ts && r.ts.toMillis ? r.ts.toMillis() : 0;
    if (!t || t < start) continue;
    const idx = Math.floor((t - start) / 86400000);
    if (idx >= 0 && idx < days) buckets[idx]++;
  }
  const max = Math.max(1, ...buckets);
  const wrap = document.createElement("div");
  wrap.className = "bd";
  const h = document.createElement("h4");
  h.textContent = "last 30 days";
  wrap.appendChild(h);
  const chart = document.createElement("div");
  chart.className = "spark";
  buckets.forEach((n, i) => {
    const col = document.createElement("span");
    col.style.height = Math.round((n / max) * 100) + "%";
    const d = new Date(start + i * 86400000);
    col.title = (d.getMonth() + 1) + "/" + d.getDate() + ": " + n;
    chart.appendChild(col);
  });
  wrap.appendChild(chart);
  return wrap;
}

async function loadStats(code, panel) {
  panel.textContent = "loading…";
  try {
    const snap = await getDocs(query(collection(db, "hits"), where("code", "==", code)));
    const rows = snap.docs.map((d) => d.data());
    panel.textContent = "";

    if (!rows.length) { panel.textContent = "no clicks logged yet"; return; }

    const uniq = distinct(rows, "vid");
    const fresh = rows.filter((r) => r.fresh === true).length;
    const bots = rows.filter((r) => r.bot === true).length;

    const sum = document.createElement("div");
    sum.className = "kpis";
    sum.appendChild(statLine("clicks", rows.length));
    if (uniq) sum.appendChild(statLine("unique", uniq));
    if (fresh) sum.appendChild(statLine("new", fresh));
    if (uniq) sum.appendChild(statLine("returning", Math.max(0, rows.length - fresh)));
    if (bots) sum.appendChild(statLine("bot hits", bots));
    panel.appendChild(sum);

    panel.appendChild(timeline(rows));
    panel.appendChild(hourHeat(rows));
    panel.appendChild(dowChart(rows));
    panel.appendChild(breakdown("referrers", tally(rows, (r) => refOf(r.ref)), 6));
    panel.appendChild(breakdown("region", tally(rows, (r) => regionOf(r.tz)), 6));
    panel.appendChild(breakdown("timezone", tally(rows, (r) => r.tz || "?"), 6));
    panel.appendChild(breakdown("device", tally(rows, (r) => deviceOf(r)), 6));
    panel.appendChild(breakdown("browser", tally(rows, (r) => browserOf(r.ua || "")), 6));
    panel.appendChild(breakdown("os", tally(rows, (r) => osOf(r.ua || "")), 6));
    panel.appendChild(breakdown("language", tally(rows, (r) => r.lang || "?"), 6));
    const nets = tally(rows.filter((r) => r.net), (r) => r.net);
    if (nets.length) panel.appendChild(breakdown("connection", nets, 6));

    const tools = document.createElement("div");
    tools.className = "tools";
    const csv = document.createElement("button");
    csv.textContent = "export csv";
    csv.onclick = () => exportCsv("liinkr-" + code + ".csv", rows);
    tools.appendChild(csv);
    panel.appendChild(tools);
  } catch (err) {
    panel.textContent = "couldnt load stats: " + err.message;
  }
}

// ----- the all-links dashboard -----

const dashEl = document.getElementById("dash");
const dashBtn = document.getElementById("dashBtn");
if (dashBtn) {
  dashBtn.onclick = () => {
    dashEl.hidden = !dashEl.hidden;
    if (!dashEl.hidden) loadDashboard(dashEl);
  };
}

async function loadDashboard(panel) {
  panel.innerHTML = "";
  panel.textContent = "crunching…";
  try {
    const [hitSnap, linkSnap] = await Promise.all([
      getDocs(collection(db, "hits")),
      getDocs(collection(db, "links"))
    ]);
    const rows = hitSnap.docs.map((d) => d.data());
    const links = linkSnap.docs.map((d) => ({ code: d.id, ...d.data() }));
    panel.innerHTML = "";

    const totalClicks = links.reduce((a, l) => a + (l.clicks || 0), 0);

    const kpis = document.createElement("div");
    kpis.className = "kpis";
    kpis.appendChild(statLine("links", links.length));
    kpis.appendChild(statLine("clicks", totalClicks));
    kpis.appendChild(statLine("logged hits", rows.length));
    kpis.appendChild(statLine("unique visitors", distinct(rows, "vid")));
    panel.appendChild(kpis);

    if (rows.length) {
      panel.appendChild(timeline(rows));
      panel.appendChild(hourHeat(rows));
      panel.appendChild(dowChart(rows));
    }

    // top links by clicks
    const top = links.slice().sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
    panel.appendChild(breakdown("top links", top.map((l) => ["/" + l.code, l.clicks || 0]), 8));

    if (rows.length) {
      panel.appendChild(breakdown("referrers", tally(rows, (r) => refOf(r.ref)), 6));
      panel.appendChild(breakdown("region", tally(rows, (r) => regionOf(r.tz)), 6));
      panel.appendChild(breakdown("device", tally(rows, (r) => deviceOf(r)), 6));
      panel.appendChild(breakdown("browser", tally(rows, (r) => browserOf(r.ua || "")), 6));
      panel.appendChild(breakdown("os", tally(rows, (r) => osOf(r.ua || "")), 6));
    }

    const tools = document.createElement("div");
    tools.className = "tools";
    const csv = document.createElement("button");
    csv.textContent = "export all csv";
    csv.onclick = () => exportCsv("liinkr-all.csv", rows);
    tools.appendChild(csv);
    panel.appendChild(tools);
  } catch (err) {
    panel.textContent = "couldnt load dashboard: " + err.message;
  }
}
