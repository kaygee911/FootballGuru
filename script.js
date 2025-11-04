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
  const adminDash = document.getElementById("admin-dashboard");
  const userDash  = document.getElementById("user-dashboard");

  if (!gate || !app || !input || !btn) return;

  btn.onclick = async () => {
  const raw = (input.value || "").trim();
  const nameTyped = raw.replace(/\s+/g, " ").trim();
  const nameLower = nameTyped.toLowerCase();
  if (!nameLower) { alert("Please enter your name."); return; }

  gate.style.display = "none";
  app.style.display  = "block";

  if (nameLower === "admin") {
    // admin path
    adminDash.style.display = "block";
    wireAdminAuth();
    return;
  }

  // players-only check
  const db = window._fb.db;
  const { query, where } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
  const q = query(collection(db, "players"), where("nameLower", "==", nameLower));
  const snap = await getDocs(q);
  if (snap.empty) {
    // not on allowlist
    app.style.display = "none";
    gate.style.display = "block";
    alert("You're not on the players list yet. Ask the admin to add you.");
    return;
  }

  // allowed: save name to users/{uid} and continue
  const u = window._fb.user;
 await setDoc(doc(db, "users", u.uid), { name: nameTyped, nameLower, createdAt: new Date() }, { merge: true });
  const userDash = document.getElementById("user-dashboard");
  if (userDash) userDash.style.display = "block";
  renderMe();
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
  const adminPlayers = document.getElementById("admin-players");
  
  if (adminPlayers) {
    adminPlayers.style.display = isAdmin ? "block" : "none";
    if (isAdmin && !adminPlayers.dataset.wired) {
      adminPlayers.dataset.wired = "1";   // avoid double-wiring
      wireAdminPlayers();                 // attach Add Player logic
    }
  }

  const adminDash = document.getElementById("admin-dashboard");
  const adminAuth = document.getElementById("admin-auth");
  const loginBt   = document.getElementById("admin-login");
  const logoutBt  = document.getElementById("admin-logout");
  const toggleBtn = document.getElementById("toggle-results");

  // Always show admin panel so the login form is visible
  if (adminDash) adminDash.style.display = "block";

  // Keep the auth box visible, but switch which button is shown
  if (adminAuth) {
    adminAuth.style.display = "block";
    if (loginBt)  loginBt.style.display  = isAdmin ? "none" : "";
    if (logoutBt) logoutBt.style.display = isAdmin ? "" : "none";
  }

  // Admin-only controls
  if (toggleBtn) toggleBtn.style.display = isAdmin ? "" : "none";
  document.querySelectorAll(".save-result").forEach(btn => {
    btn.style.display = isAdmin ? "" : "none";
  });

  if (isAdmin) {
  wireAdminPlayers(); //admin can add/list players
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

async function wireAdminPlayers() {
  const db = window._fb?.db;
  if (!db) return;

  const nameInput = document.getElementById("player-name");
  const addBtn    = document.getElementById("add-player");
  const msgEl     = document.getElementById("player-msg");
  const listEl    = document.getElementById("player-list");
  if (!nameInput || !addBtn || !msgEl || !listEl) return;

  const say = (t) => { msgEl.textContent = t; };

  // Add player (to a simple allowlist)
  addBtn.onclick = async () => {
    const nameRaw = (nameInput.value || "").trim();
    if (!nameRaw) { say("Enter a name."); return; }
    const name = nameRaw.replace(/\s+/g, " ").trim();
    const nameLower = name.toLowerCase();

    // players collection: { name, nameLower, createdAt }
    const { addDoc, collection: coll, query, where, getDocs } =
      await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");

    // prevent duplicates (case-insensitive)
    const q = query(coll(db, "players"), where("nameLower", "==", nameLower));
    const existing = await getDocs(q);
    if (!existing.empty) { say("Player already exists."); return; }

    await addDoc(coll(db, "players"), { name, nameLower, createdAt: new Date() });
    nameInput.value = "";
    say("Player added.");
    await refreshPlayerList(); // refresh UI
  };

  // List players
  async function refreshPlayerList() {
    listEl.innerHTML = "Loading...";
    const { getDocs, collection: coll } =
      await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const snap = await getDocs(coll(db, "players"));
    const items = [];
    snap.forEach(d => items.push(d.data().name));
    items.sort((a,b)=>a.localeCompare(b));
    listEl.innerHTML = items.length
      ? items.map(n => `<li>${n}</li>`).join("")
      : "<li>No players yet.</li>";
  }

  // initial load
  refreshPlayerList();
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

  // --- Load results ---
  const resultsSnap = await getDocs(collection(db, "results"));
  const results = {};
  resultsSnap.forEach(d => {
    const v = d.data();
    results[d.id] = { home: Number(v.home ?? 0), away: Number(v.away ?? 0) };
  });

  // --- Load allowed players (admin list) ---
  const playersSnap = await getDocs(collection(db, "players"));
  const players = [];                   // [{name, nameLower}]
  const allowed = new Set();            // nameLower
  playersSnap.forEach(d => {
    const v = d.data();
    if (v?.nameLower) {
      players.push({ name: v.name, nameLower: String(v.nameLower) });
      allowed.add(String(v.nameLower));
    }
  });

  // --- Map user uid -> nameLower (from users collection) ---
  const nameByUid = {};
  // Pull all 'users' docs that exist (small scale family app; OK to fetch all)
  const usersSnap = await getDocs(collection(db, "users"));
  usersSnap.forEach(d => {
    const v = d.data();
    if (v?.nameLower) nameByUid[d.id] = String(v.nameLower);
  });

  // --- Accumulate totals by player nameLower ---
  const totalsByName = {}; // { nameLower: pts }
  const picksSnap = await getDocs(collection(db, "picks"));
  picksSnap.forEach(d => {
    const data = d.data();
    const uid  = String(d.id).split("_")[0];
    const nameLower = nameByUid[uid];        // whose pick is this?
    if (!nameLower || !allowed.has(nameLower)) return;  // ignore non-players
    const mid = data.matchId;
    const pick = { home: Number(data.home ?? 0), away: Number(data.away ?? 0) };
    const res  = results[mid];
    const pts  = scorePick(pick, res);
    totalsByName[nameLower] = (totalsByName[nameLower] || 0) + pts;
  });

  // --- Ensure every allowed player appears (even with 0) ---
  players.forEach(p => {
    if (!(p.nameLower in totalsByName)) totalsByName[p.nameLower] = 0;
  });

  // --- Build rows from players list (keeps nice display names) ---
  let rows = players
    .map(p => ({ name: p.name, key: p.nameLower, pts: totalsByName[p.nameLower] || 0 }))
    .sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));

  // --- Compute movement (Δ) by player key (nameLower) ---
  const prevOrder = state.prevOrder || {};
  const currOrder = {};
  rows.forEach((r, i) => { currOrder[r.key] = i + 1; });
  rows.forEach((r, i) => {
    const prev = prevOrder[r.key] || i + 1;
    r.delta = prev - (i + 1);
  });
  state.prevOrder = currOrder;

  // --- Render ---
  let lb = document.getElementById("leaderboard");
  if (!lb) {
    lb = document.createElement("div");
    lb.id = "leaderboard";
    (document.getElementById("user-dashboard") || document.body).appendChild(lb);
  }

  const body = rows.length
    ? rows.map((r, i) => {
        const delta = r.delta === 0 ? "0" : (r.delta > 0 ? `+${r.delta}` : `${r.delta}`);
        return `<tr><td>${i + 1}</td><td>${r.name}</td><td>${r.pts}</td><td>${delta}</td></tr>`;
      }).join("")
    : `<tr><td>–</td><td>No players</td><td>0</td><td>0</td></tr>`;

  lb.innerHTML = `
    <h2>Leaderboard</h2>
    <table>
      <thead><tr><th>#</th><th>Player</th><th>Pts</th><th>Δ</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p><em>(Only players added by admin are listed. Players with no picks show 0.)</em></p>
  `;
}

async function wireSwitchUser() {
  const btn = document.getElementById("switch-user");
  if (!btn) return;

  btn.onclick = async () => {
    const auth = window._fb?.auth;
    const db = window._fb?.db;
    if (!auth || !db) return;

    // Clear name for this UID (optional but clean)
    const u = window._fb.user;
    if (u) {
      await setDoc(doc(db, "users", u.uid), { name: null, nameLower: null }, { merge: true });
    }

    // Sign out + return to anonymous (like reset)
    await signOut(auth);
    const { signInAnonymously } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    await signInAnonymously(auth);

    // Reset UI to show name gate again
    document.getElementById("app").style.display = "none";
    document.getElementById("gate").style.display = "block";
  };
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
  wireSwitchUser();
})();


