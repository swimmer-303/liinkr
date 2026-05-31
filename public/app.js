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

    const summary = document.createElement("p");
    summary.className = "sum";
    summary.textContent = rows.length + " clicks logged";
    panel.appendChild(summary);

    panel.appendChild(timeline(rows));
    panel.appendChild(breakdown("referrers", tally(rows, (r) => refOf(r.ref)), 6));
    panel.appendChild(breakdown("browser", tally(rows, (r) => browserOf(r.ua || "")), 6));
    panel.appendChild(breakdown("os", tally(rows, (r) => osOf(r.ua || "")), 6));
    panel.appendChild(breakdown("language", tally(rows, (r) => r.lang || "?"), 6));
    panel.appendChild(breakdown("timezone", tally(rows, (r) => r.tz || "?"), 6));
  } catch (err) {
    panel.textContent = "couldnt load stats: " + err.message;
  }
}
