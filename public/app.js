import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, setDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp
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

      const del = document.createElement("button");
      del.textContent = "delete";
      del.onclick = () => {
        if (confirm("delete /" + d.id + " ?")) deleteDoc(doc(db, "links", d.id));
      };

      li.append(code, dest, clicks, copy, del);
      linksEl.appendChild(li);
    });
  });
}
