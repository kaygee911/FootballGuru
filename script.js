// FootballGuru starter JS
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

// App state placeholders (hook these to Firebase later)
const state = {
  user: null,
  predictions: {},   // { matchId: {home: n, away: n} }
  results: {},       // { matchId: {home: n, away: n} }
  scores: {},        // { username: points }
};

// Minimal demo: one mock match + simple scoring logic
const matches = [
  { id: "m1", home: "Team A", away: "Team B", kickoff: "2025-11-10T18:00:00Z" },
  { id: "m2", home: "Team C", away: "Team D", kickoff: "2025-11-11T18:00:00Z" }
];

// Render helpers
function $(sel) { return document.querySelector(sel); }

// admin auth wiring
async function wireAdminAuth() {
  await waitForUser();
  const auth = window._fb?.auth;
  const db   = window._fb?.db;
  if (!auth || !db) return;

  const emailEl = document.getElementById("admin-email");
  const passEl  = document.getElementById("admin-pass");
  const loginBt = document.getElementById("admin-login");
  const outBt   = document.getElementById("admin-logout");
  const status  = document.getElementById("admin-auth-status");
  if (!emailEl || !passEl || !loginBt || !outBt || !status) return;

  const setStatus = (msg) => { status.textContent = msg; };

  loginBt.onclick = async () => {
    const email = (emailEl.value || "").trim();
    const pass  = (passEl.value || "").trim();
    if (!email || !pass) { setStatus("Enter email and password."); return; }
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      setStatus("Admin logged in.");
      outBt.style.display = "";
      loginBt.style.display = "none";
      // refresh UI for admin
      ensureAdminView();
      renderLeaderboard();
    } catch (e) {
      setStatus("Login failed.");
      console.error(e);
    }
  };

  outBt.onclick = async () => {
    try {
      await signOut(auth);
      setStatus("Signed out. Returning to guest mode…");
      // fall back to anonymous so users can still play
      const { signInAnonymously } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
      await signInAnonymously(auth);
      // reset UI
      loginBt.style.display = "";
      outBt.style.display = "none";
      ensureAdminView();
      renderLeaderboard();
      renderMe();
    } catch (e) {
      setStatus("Logout failed.");
      console.error(e);
    }
  };
}

async function wireGate() {
  await waitForUser();
  const u = window._fb?.user;
  if (!u) return;

  const gate = document.getElementById("gate");
  const app  = document.getElementById("app");
  const input = document.getElementById("gate-name");
  const btn   = document.getElementById("gate-continue");
  if (!gate || !app || !input || !btn) return;

  btn.onclick = async () => {
    const name = (input.value || "").trim();
    if (!name) { alert("Please enter your name."); return; }

    const db = window._fb.db;
    await setDoc(doc(db, "users", u.uid), { name, createdAt: new Date() }, { merge: true });

    gate.style.display = "none";
    app.style.display  = "block";
    const userDash = document.getElementById("user-dashboard");
    if (userDash) userDash.style.display = "block";

    renderMe();
    ensureAdminView();
    renderPredictions();
    renderLeaderboard();
  };
}

async function renderMe() {
  await waitForUser();
  const u = window._fb?.user;
  if (!u) return;
  const db = window._fb.db;
  const s = await getDoc(doc(db, "users", u.uid));
  const name = s.exists() ? s.data().name : u.uid.slice(0,6);
  const slot = document.getElementById("me");
  if (slot) slot.textContent = `Player: ${name}`;
}

async function ensureAdminView() {
  await waitForUser();
  const u = window._fb?.user;
  if (!u) return;

  const db = window._fb.db;
  const s = await getDoc(doc(db, "users", u.uid));
  const isAdmin = s.exists() && s.data().admin === true;

  const adminDash = document.getElementById("admin-dashboard");
  if (adminDash) adminDash.style.display = isAdmin ? "block" : "none";

  document.querySelectorAll(".save-result").forEach(btn => {
    btn.style.display = isAdmin ? "" : "none";
  });

  const toggle = document.getElementById("toggle-results");
  if (toggle && isAdmin) {
    toggle.onclick = () => {
      const show = toggle.dataset.mode !== "on";
      toggle.dataset.mode = show ? "on" : "off";
      document.querySelectorAll(".save-result").forEach(btn => {
        btn.style.visibility = show ? "visible" : "hidden";
      });
    };
  }
}

async function ensureUserName() {
  // wait for Firebase user
  for (let i = 0; i < 20; i++) {
    const u = window._fb?.user;
    if (u) break;
    await new Promise(r => setTimeout(r, 250));
  }
  const u = window._fb?.user;
  if (!u) return;

  const db = window._fb.db;
  const profileRef = doc(db, "users", u.uid);
  const snap = await getDoc(profileRef);
  if (snap.exists()) return;

  let name = "";
  while (!name) {
    name = (prompt("Enter your first name (for leaderboard):") || "").trim();
    if (!name) alert("Name cannot be empty.");
  }
  await setDoc(profileRef, { name, createdAt: new Date() });
}

// helper: wait for Firebase auth user (max ~5s)
async function waitForUser() {
  const auth = window._fb?.auth;
  const db = window._fb?.db;

  for (let i = 0; i < 20; i++) {
    const u = window._fb?.user;
    if (u) return u;
    await new Promise(r => setTimeout(r, 250));
  }
  return null;
}
  
function renderPredictions() {
  const root = document.body;
  const containerId = "predictions";

  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement("div");
    container.id = containerId;
    root.appendChild(container);
  }
  container.innerHTML = `<h2>Make Your Picks</h2>` + matches.map(m => `
    <div data-id="${m.id}">
      <strong>${m.home}</strong> vs <strong>${m.away}</strong>
      <div>
        <label>${m.home} goals: <input type="number" min="0" value="0" class="home"></label>
        <label>${m.away} goals: <input type="number" min="0" value="0" class="away"></label>
        <button class="save">Save Pick</button>
        <button class="save-result">Save Result (admin)</button>
      </div>
    </div>
  `).join("");

  container.addEventListener("click", async (e) => {
    const wrap = e.target.closest("[data-id]");
    if (!wrap) return;
    const id = wrap.getAttribute("data-id");
    const home = parseInt(wrap.querySelector(".home").value || "0", 10);
    const away = parseInt(wrap.querySelector(".away").value || "0", 10);

    if (e.target.classList.contains("save")) {
      const user = await waitForUser();
      if (!user) { alert("Still signing in—try again in a moment."); return; }
      const db = window._fb.db;
      const pickRef = doc(db, "picks", `${user.uid}_${id}`);
      await setDoc(pickRef, { matchId: id, home, away, timestamp: new Date() });
      alert("Pick saved to database!");
      renderLeaderboard();
    }

    if (e.target.classList.contains("save-result")) {
      const user = await waitForUser();
      if (!user) { alert("Still signing in—try again in a moment."); return; }
      const db = window._fb.db;
      const resultRef = doc(db, "results", id);
      await setDoc(resultRef, { matchId: id, home, away, timestamp: new Date() });
      alert("Result saved!");
      renderLeaderboard();
    }
  });
}

function setResult(matchId, home, away) {
  state.results[matchId] = { home, away };
}

function outcome(h, a) {
  if (h > a) return "H";
  if (h < a) return "A";
  return "D";
}

// 3/1/0 scoring: exact score = 3; correct outcome = 1; else 0
function scorePick(pick, result) {
  if (!pick || !result) return 0;
  if (pick.home === result.home && pick.away === result.away) return 3;
  return outcome(pick.home, pick.away) === outcome(result.home, result.away) ? 1 : 0;
}

async function renderLeaderboard() {
  const db = window._fb?.db;
  if (!db) return;

  // 1) Load results
  const resultsSnap = await getDocs(collection(db, "results"));
  const results = {};
  resultsSnap.forEach(d => {
    const v = d.data();
    results[d.id] = { home: Number(v.home ?? 0), away: Number(v.away ?? 0) };
  });

  // 2) Load picks and accumulate totals
  const picksSnap = await getDocs(collection(db, "picks"));
  const totals = {};              // { uid: points }
  const uids = new Set();         // collect unique users
  picksSnap.forEach(d => {
    const data = d.data();
    const uid = String(d.id).split("_")[0];
    uids.add(uid);
    const mid = data.matchId;
    const pick = { home: Number(data.home ?? 0), away: Number(data.away ?? 0) };
    const res  = results[mid];
    const pts  = scorePick(pick, res);
    totals[uid] = (totals[uid] || 0) + pts;
  });

  // 3) Fetch user names (no await inside map)
  const names = {};
  for (const uid of uids) {
    const s = await getDoc(doc(db, "users", uid));
    names[uid] = s.exists() ? (s.data().name || uid.slice(0,6)) : uid.slice(0,6);
  }

  // 4) Sort and compute movement (Δ)
  const rows = Object.entries(totals).map(([uid, pts]) => ({ uid, pts }))
    .sort((a, b) => b.pts - a.pts);

  const prevOrder = state.prevOrder || {};
  const currOrder = {};
  rows.forEach((r, i) => { currOrder[r.uid] = i + 1; });
  rows.forEach((r, i) => {
    const prev = prevOrder[r.uid] || i + 1;
    r.delta = prev - (i + 1);
  });
  state.prevOrder = currOrder;

  // 5) Render
  let lb = document.getElementById("leaderboard");
  if (!lb) {
    lb = document.createElement("div");
    lb.id = "leaderboard";
    document.body.appendChild(lb);
  }

  const body = rows.length
    ? rows.map((r, i) => {
        const delta = r.delta === 0 ? "0" : (r.delta > 0 ? `+${r.delta}` : `${r.delta}`);
        const nm = names[r.uid];
        return `<tr><td>${i + 1}</td><td>${nm}</td><td>${r.pts}</td><td>${delta}</td></tr>`;
      }).join("")
    : `<tr><td>–</td><td>No picks</td><td>0</td><td>0</td></tr>`;

  lb.innerHTML = `
    <h2>Leaderboard</h2>
    <table>
      <thead><tr><th>#</th><th>User</th><th>Pts</th><th>Δ</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p><em>(Δ = places moved since last refresh)</em></p>
  `;
}

// Demo boot
//enderPredictions();
//renderLeaderboard();
//ensureUserName(); // ask for player name
//renderMe(); // show player name at the top of the page
//ensureAdminView();

(async function init() {
  await waitForUser();
  wireGate();
  wireAdminAuth();
})();


