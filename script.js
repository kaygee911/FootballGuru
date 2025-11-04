// FootballGuru starter JS

// App state placeholders (hook these to Firebase later)
const state = {
  user: null,
  predictions: {},   // { matchId: {home: n, away: n} }
  results: {},       // { matchId: {home: n, away: n} }
  scores: {},        // { username: points }
};

// Minimal demo: one mock match + simple scoring logic
const matches = [
  { id: "m1", home: "Team A", away: "Team B", kickoff: "2025-11-10T18:00:00Z" }
];

// Render helpers
function $(sel) { return document.querySelector(sel); }

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
      </div>
    </div>
  `).join("");

  container.addEventListener("click", (e) => {
    if (e.target.classList.contains("save")) {
      const wrap = e.target.closest("[data-id]");
      const id = wrap.getAttribute("data-id");
      const home = parseInt(wrap.querySelector(".home").value || "0", 10);
      const away = parseInt(wrap.querySelector(".away").value || "0", 10);
      state.predictions[id] = { home, away };
      alert("Saved!");
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

function renderLeaderboard() {
  const root = document.body;
  let lb = document.getElementById("leaderboard");
  if (!lb) {
    lb = document.createElement("div");
    lb.id = "leaderboard";
    root.appendChild(lb);
  }
  // Demo: single user “You”
  const you = "You";
  const total = matches.reduce((sum, m) => sum + scorePick(state.predictions[m.id], state.results[m.id]), 0);
  state.scores[you] = total;

  lb.innerHTML = `
    <h2>Leaderboard</h2>
    <table>
      <thead><tr><th>#</th><th>Name</th><th>Pts</th><th>Δ</th></tr></thead>
      <tbody>
        <tr><td>1</td><td>${you}</td><td>${total}</td><td>0</td></tr>
      </tbody>
    </table>
    <p><em>(Δ shows places moved; demo fixed at 0 for now)</em></p>
  `;
}

// Demo boot
renderPredictions();
renderLeaderboard();

// Example: set a final result later (you can test scoring by uncommenting)
// setResult("m1", 1, 0);
// renderLeaderboard();
