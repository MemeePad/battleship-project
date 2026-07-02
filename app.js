const MODES = {
  classic: {
    title: "CLASSIC PROTOCOL", size: 10, energy: false,
    ships: [
      { name: "CARRIER", code: "CV-05", shape: [[0,0],[1,0],[2,0],[3,0],[4,0]] },
      { name: "BATTLESHIP", code: "BB-04", shape: [[0,0],[1,0],[2,0],[3,0]] },
      { name: "CRUISER", code: "CG-03", shape: [[0,0],[1,0],[2,0]] },
      { name: "SUBMARINE", code: "SS-03", shape: [[0,0],[1,0],[2,0]] },
      { name: "DESTROYER", code: "DD-02", shape: [[0,0],[1,0]] }
    ]
  },
  rogue: {
    title: "ROGUE FLEET PROTOCOL", size: 12, energy: false,
    ships: [
      { name: "HOOK CARRIER", code: "HX-06", shape: [[0,0],[1,0],[2,0],[3,0],[3,1],[3,2]] },
      { name: "DIAGONAL", code: "DG-05", shape: [[0,0],[1,1],[2,2],[3,3],[4,4]] },
      { name: "TRIDENT", code: "TR-05", shape: [[0,0],[1,0],[2,0],[1,1],[1,2]] },
      { name: "CORVETTE", code: "CV-04", shape: [[0,0],[1,0],[1,1],[2,1]] },
      { name: "SPEAR", code: "SP-03", shape: [[0,0],[1,1],[2,2]] },
      { name: "WRAITH", code: "WR-02", shape: [[0,0],[1,1]] }
    ]
  },
  command: {
    title: "COMMANDER PROTOCOL", size: 10, energy: true,
    ships: [
      { name: "DREADNOUGHT", code: "DN-05", shape: [[0,0],[1,0],[2,0],[3,0],[4,0]] },
      { name: "BATTLESHIP", code: "BB-04", shape: [[0,0],[1,0],[2,0],[3,0]] },
      { name: "HUNTER", code: "HT-03", shape: [[0,0],[1,0],[2,0]] },
      { name: "SUBMARINE", code: "SS-03", shape: [[0,0],[1,0],[2,0]] },
      { name: "SCOUT", code: "SC-02", shape: [[0,0],[1,0]] }
    ]
  }
};

const WEAPONS = {
  cannon: { name: "NAVAL GUN", desc: "Single precision strike", cost: 0, icon: "crosshair" },
  sonar: { name: "SONAR PULSE", desc: "Scan a 3 × 3 sector", cost: 2, icon: "radar" },
  torpedo: { name: "TORPEDO", desc: "Strike entire row", cost: 4, icon: "bolt" },
  barrage: { name: "BARRAGE", desc: "Strike a 2 × 2 sector", cost: 5, icon: "anchor" }
};

const state = {
  mode: "classic", config: null, own: [], enemy: [], ownShots: new Set(), enemyShots: new Set(),
  turn: "player", round: 1, energy: 2, weapon: "cannon", shots: 0, hits: 0, gameOver: false,
  audio: true, audioCtx: null, enemyQueue: []
};

const $ = (s) => document.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const coordKey = (x,y) => `${x},${y}`;
const coordName = (x,y) => `${String.fromCharCode(65 + x)}${y + 1}`;
const rand = (n) => Math.floor(Math.random() * n);

function init() {
  setupLanding();
  setInterval(() => {
    $("#clock").textContent = new Date().toISOString().slice(11,19) + " UTC";
  }, 1000);
  $("#launchBtn").addEventListener("click", startGame);
  $("#homeBtn").addEventListener("click", showMenu);
  $("#menuBtn").addEventListener("click", showMenu);
  $("#rematchBtn").addEventListener("click", startGame);
  $("#redeployBtn").addEventListener("click", () => {
    if (state.shots > 0) return showToast("FLEET LOCKED", "Redeployment unavailable after first contact", "warn");
    state.own = placeFleet(state.config.ships, state.config.size);
    renderAll();
    log("Fleet coordinates randomized");
    sound("select");
  });
  $("#surrenderBtn").addEventListener("click", () => endGame(false));
  $("#clearLog").addEventListener("click", () => $("#logEntries").innerHTML = "");
  $("#audioBtn").addEventListener("click", () => {
    state.audio = !state.audio;
    $("#audioBtn").classList.toggle("muted", !state.audio);
    sound("select");
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Enter" && $("#landing").classList.contains("active")) startGame();
    if (e.key === "Escape" && $("#game").classList.contains("active")) showMenu();
  });
}

function setupLanding() {
  $$(".mode-card").forEach(card => {
    const select = () => {
      state.mode = card.dataset.mode;
      $$(".mode-card").forEach(c => c.classList.toggle("selected", c === card));
      $$(".mode-card").forEach(c => {
        c.querySelector(".card-select span").textContent = c === card ? "PROTOCOL SELECTED" : "SELECT PROTOCOL";
        c.querySelector(".card-select b").textContent = c === card ? "✓" : "↗";
      });
      sound("select");
    };
    card.addEventListener("click", select);
    card.addEventListener("keydown", e => { if (e.key === " " || e.key === "Enter") select(); });
  });
}

function showMenu() {
  $("#resultModal").classList.remove("show");
  $("#game").classList.remove("active");
  $("#landing").classList.add("active");
}

function startGame() {
  state.config = MODES[state.mode];
  state.own = placeFleet(state.config.ships, state.config.size);
  state.enemy = placeFleet(state.config.ships, state.config.size);
  state.ownShots = new Set();
  state.enemyShots = new Set();
  state.turn = "player";
  state.round = 1;
  state.energy = state.config.energy ? 2 : 0;
  state.weapon = "cannon";
  state.shots = 0;
  state.hits = 0;
  state.gameOver = false;
  state.enemyQueue = [];
  $("#resultModal").classList.remove("show");
  $("#landing").classList.remove("active");
  $("#game").classList.add("active");
  $("#gameModeTitle").textContent = state.config.title;
  $("#operationCode").textContent = ["NORTHSTAR-07","BLACKTIDE-12","IRONVEIL-03"][["classic","rogue","command"].indexOf(state.mode)];
  document.documentElement.style.setProperty("--cols", state.config.size);
  document.documentElement.style.setProperty("--rows", state.config.size);
  document.documentElement.style.setProperty("--cell", state.config.size === 12 ? "30px" : "");
  buildGrids();
  buildWeapons();
  $("#logEntries").innerHTML = "";
  log(`Protocol ${state.mode.toUpperCase()} initialized`);
  log("Hostile fleet detected. Weapons free");
  renderAll();
  sound("start");
}

function transformShape(shape, rotation, mirror) {
  let pts = shape.map(([x,y]) => {
    let a = mirror ? -x : x, b = y;
    for (let i=0; i<rotation; i++) [a,b] = [-b,a];
    return [a,b];
  });
  const minX = Math.min(...pts.map(p=>p[0])), minY = Math.min(...pts.map(p=>p[1]));
  return pts.map(([x,y]) => [x-minX,y-minY]);
}

function placeFleet(defs, size) {
  for (let restart=0; restart<200; restart++) {
    const occupied = new Set(), fleet = [];
    let failed = false;
    for (const def of defs) {
      let placed = null;
      for (let attempt=0; attempt<500 && !placed; attempt++) {
        const shape = transformShape(def.shape, rand(4), Math.random() > .5);
        const maxX = Math.max(...shape.map(p=>p[0])), maxY = Math.max(...shape.map(p=>p[1]));
        const ox = rand(size - maxX), oy = rand(size - maxY);
        const cells = shape.map(([x,y]) => [x+ox,y+oy]);
        if (cells.every(([x,y]) => !occupied.has(coordKey(x,y)))) placed = cells;
      }
      if (!placed) { failed = true; break; }
      placed.forEach(([x,y]) => occupied.add(coordKey(x,y)));
      fleet.push({ ...def, cells: placed, hits: new Set(), sunk: false });
    }
    if (!failed) return fleet;
  }
  throw new Error("Unable to place fleet");
}

function buildGrids() {
  ["enemy","own"].forEach(type => {
    const grid = $(`#${type}Grid`);
    grid.innerHTML = "";
    for (let y=0; y<state.config.size; y++) for (let x=0; x<state.config.size; x++) {
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.dataset.x = x; cell.dataset.y = y;
      cell.setAttribute("aria-label", `${type === "enemy" ? "Fire at" : "Own coordinate"} ${coordName(x,y)}`);
      if (type === "enemy") {
        cell.addEventListener("click", () => playerAction(x,y));
        cell.addEventListener("mouseenter", () => positionReticle(x,y));
      } else cell.tabIndex = -1;
      grid.appendChild(cell);
    }
    const top = $(`#${type}LabelsTop`), side = $(`#${type}LabelsSide`);
    top.innerHTML = Array.from({length:state.config.size},(_,i)=>`<span>${String.fromCharCode(65+i)}</span>`).join("");
    side.innerHTML = Array.from({length:state.config.size},(_,i)=>`<span>${String(i+1).padStart(2,"0")}</span>`).join("");
  });
}

function positionReticle(x,y) {
  if (state.turn !== "player" || state.gameOver) return;
  const r = $("#targetReticle");
  const cell = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell")) || (state.config.size === 12 ? 30 : 36);
  r.style.left = `${18 + x*cell + cell/2}px`;
  r.style.top = `${18 + y*cell + cell/2}px`;
  r.style.display = "block";
}

function buildWeapons() {
  const wrap = $("#weapons");
  const keys = state.config.energy ? ["cannon","sonar","torpedo","barrage"] : ["cannon"];
  wrap.innerHTML = keys.map(key => {
    const w = WEAPONS[key];
    return `<button class="weapon ${key === "cannon" ? "active":""}" data-weapon="${key}">
      <svg><use href="#icon-${w.icon}"/></svg>
      <div><b>${w.name}</b><small>${w.desc}</small></div>
      <span class="weapon-cost">${w.cost ? w.cost+"⚡" : "FREE"}</span>
    </button>`;
  }).join("");
  $$(".weapon").forEach(btn => btn.addEventListener("click", () => {
    const key = btn.dataset.weapon, w = WEAPONS[key];
    if (state.energy < w.cost) return showToast("LOW ENERGY", `Requires ${w.cost} command energy`);
    state.weapon = key;
    $$(".weapon").forEach(b => b.classList.toggle("active", b === btn));
    sound("select");
  }));
  $("#energyBox").style.display = state.config.energy ? "" : "none";
}

function playerAction(x,y) {
  if (state.turn !== "player" || state.gameOver) return;
  const weapon = WEAPONS[state.weapon];
  if (state.energy < weapon.cost) return showToast("LOW ENERGY", `Requires ${weapon.cost} command energy`);
  let targets = [];
  if (state.weapon === "cannon") targets = [[x,y]];
  if (state.weapon === "sonar") {
    state.energy -= weapon.cost;
    let contacts = 0;
    for (let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
      const tx=x+dx, ty=y+dy;
      if (inside(tx,ty)) {
        const c = enemyCell(tx,ty); c.classList.add("scanned");
        if (shipAt(state.enemy,tx,ty)) contacts++;
      }
    }
    enemyCell(x,y).classList.toggle("sonar-positive", contacts > 0);
    log(`Sonar at ${coordName(x,y)}: ${contacts} contact segment${contacts===1?"":"s"}`);
    showToast("SONAR RETURN", contacts ? `${contacts} hostile signal${contacts===1?"":"s"} in sector` : "Sector is clear");
    sound("sonar");
    finishPlayerTurn();
    renderAll();
    return;
  }
  if (state.weapon === "torpedo") {
    for (let tx=0;tx<state.config.size;tx++) targets.push([tx,y]);
  }
  if (state.weapon === "barrage") {
    [[0,0],[1,0],[0,1],[1,1]].forEach(([dx,dy]) => { if (inside(x+dx,y+dy)) targets.push([x+dx,y+dy]); });
  }
  const valid = targets.filter(([tx,ty]) => !state.ownShots.has(coordKey(tx,ty)));
  if (!valid.length) return showToast("INVALID TARGET", "All affected coordinates were already fired upon");
  state.energy -= weapon.cost;
  let anyHit = false, sunkNames = [];
  valid.forEach(([tx,ty]) => {
    state.ownShots.add(coordKey(tx,ty)); state.shots++;
    const ship = shipAt(state.enemy,tx,ty);
    if (ship) {
      ship.hits.add(coordKey(tx,ty)); state.hits++; anyHit = true;
      if (ship.hits.size === ship.cells.length && !ship.sunk) { ship.sunk = true; sunkNames.push(ship.name); }
    }
  });
  if (anyHit && state.config.energy) state.energy = Math.min(6, state.energy + 1);
  renderAll();
  const focus = coordName(x,y);
  if (sunkNames.length) {
    showToast("VESSEL DESTROYED", `${sunkNames.join(" + ")} sunk`);
    log(`${sunkNames.join(", ")} destroyed near ${focus}`, true);
    sound("sink");
  } else if (anyHit) {
    showToast("DIRECT HIT", `Hostile vessel damaged near ${focus}`);
    log(`${weapon.name} scored a hit near ${focus}`, true);
    sound("hit");
  } else {
    showToast("SHOT WIDE", `No contact near ${focus}`);
    log(`${weapon.name} missed near ${focus}`);
    sound("miss");
  }
  if (state.enemy.every(s => s.sunk)) return setTimeout(() => endGame(true), 700);
  finishPlayerTurn();
}

function finishPlayerTurn() {
  state.weapon = "cannon";
  $$(".weapon").forEach(b => b.classList.toggle("active", b.dataset.weapon === "cannon"));
  state.turn = "enemy";
  renderHud();
  setTimeout(enemyTurn, 700);
}

function enemyTurn() {
  if (state.gameOver) return;
  let target = null;
  while (state.enemyQueue.length && !target) {
    const p = state.enemyQueue.shift();
    if (inside(...p) && !state.enemyShots.has(coordKey(...p))) target = p;
  }
  if (!target) {
    let tries = 0;
    do { target = [rand(state.config.size), rand(state.config.size)]; tries++; }
    while (state.enemyShots.has(coordKey(...target)) && tries < 1000);
  }
  const [x,y] = target;
  state.enemyShots.add(coordKey(x,y));
  const ship = shipAt(state.own,x,y);
  if (ship) {
    ship.hits.add(coordKey(x,y));
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dy]) => state.enemyQueue.push([x+dx,y+dy]));
    if (ship.hits.size === ship.cells.length) {
      ship.sunk = true;
      state.enemyQueue = [];
      showToast("VESSEL LOST", `${ship.name} has gone down`);
      log(`Enemy destroyed ${ship.name} at ${coordName(x,y)}`, true);
      sound("sink");
    } else {
      showToast("HULL BREACH", `Incoming strike at ${coordName(x,y)}`);
      log(`Enemy hit at ${coordName(x,y)}`, true);
      sound("hit");
    }
  } else {
    log(`Enemy missed at ${coordName(x,y)}`);
    sound("miss");
  }
  renderAll();
  if (state.own.every(s => s.sunk)) return setTimeout(() => endGame(false), 700);
  state.turn = "player";
  state.round++;
  renderHud();
}

function inside(x,y) { return x>=0 && y>=0 && x<state.config.size && y<state.config.size; }
function shipAt(fleet,x,y) { return fleet.find(s => s.cells.some(([sx,sy]) => sx===x && sy===y)); }
function enemyCell(x,y) { return $(`#enemyGrid .cell[data-x="${x}"][data-y="${y}"]`); }

function renderAll() {
  renderBoard("enemy");
  renderBoard("own");
  renderFleet();
  renderHud();
}

function renderBoard(type) {
  const isEnemy = type === "enemy", grid = isEnemy ? $("#enemyGrid") : $("#ownGrid");
  const fleet = isEnemy ? state.enemy : state.own, shots = isEnemy ? state.ownShots : state.enemyShots;
  $$(".cell", grid).forEach(cell => {
    const x=+cell.dataset.x, y=+cell.dataset.y, key=coordKey(x,y), ship=shipAt(fleet,x,y);
    cell.classList.toggle("miss", shots.has(key) && !ship);
    cell.classList.toggle("hit", shots.has(key) && !!ship);
    cell.classList.toggle("sunk-cell", !!ship?.sunk && shots.has(key));
    const reveal = !isEnemy || (ship && ship.sunk);
    cell.querySelector(".ship-segment")?.remove();
    if (reveal && ship) {
      const seg=document.createElement("span"); seg.className="ship-segment"; cell.prepend(seg);
    }
  });
}

function renderFleet() {
  const fleet = state.own;
  $("#fleetList").innerHTML = fleet.map((ship,i) => `
    <div class="fleet-item ${ship.sunk?"sunk":""}">
      <svg class="fleet-icon" viewBox="0 0 100 30" aria-hidden="true">
        <path class="hull" d="M4 18 17 12h${Math.max(35, ship.cells.length*12)}l13 6-8 8H13Z"/>
        <path d="M28 12V7h17v5M35 7V3" fill="none" stroke="#91aaaa" stroke-width="1"/>
      </svg>
      <div class="fleet-info"><b>${ship.name}</b><small>${ship.code}</small>
        <span class="fleet-pips">${ship.cells.map(([x,y])=>`<i class="${ship.hits.has(coordKey(x,y))?"hit":""}"></i>`).join("")}</span>
      </div>
    </div>`).join("");
  $("#ownAlive").textContent = fleet.filter(s=>!s.sunk).length;
}

function renderHud() {
  $("#turnLabel").textContent = state.turn === "player" ? "YOUR TURN" : "ENEMY FIRING";
  $("#turnLabel").style.color = state.turn === "player" ? "var(--teal)" : "var(--orange)";
  $("#roundCount").textContent = String(state.round).padStart(2,"0");
  $("#energyValue").textContent = `${state.energy} / 6`;
  $("#energyTrack").innerHTML = Array.from({length:6},(_,i)=>`<i class="${i<state.energy?"filled":""}"></i>`).join("");
  $$(".weapon").forEach(btn => btn.disabled = state.turn !== "player" || state.energy < WEAPONS[btn.dataset.weapon].cost);
}

function log(message, isHit=false) {
  const el=document.createElement("div"); el.className=`log-entry ${isHit?"hit-log":""}`;
  el.innerHTML=`<time>${String(state.round).padStart(2,"0")}:${state.turn==="player"?"P":"E"}</time><span>${message}</span>`;
  $("#logEntries").prepend(el);
}

let toastTimer;
function showToast(title,text,type="") {
  clearTimeout(toastTimer);
  $("#toastTitle").textContent=title; $("#toastText").textContent=text;
  $("#toast").classList.add("show");
  toastTimer=setTimeout(()=>$("#toast").classList.remove("show"),2200);
}

function endGame(won) {
  state.gameOver=true;
  const alive=state.own.filter(s=>!s.sunk).length;
  $("#resultTitle").textContent=won?"DECISIVE VICTORY":"FLEET LOST";
  $("#resultText").textContent=won?"The hostile fleet has been neutralized. The sea is ours.":"The operation is lost, but the war is not over.";
  $("#resultRounds").textContent=state.round;
  $("#resultAccuracy").textContent=`${state.shots?Math.round(state.hits/state.shots*100):0}%`;
  $("#resultShips").textContent=alive;
  $("#resultModal").classList.add("show");
  sound(won?"victory":"sink");
}

function sound(type) {
  if (!state.audio) return;
  try {
    if (!state.audioCtx) state.audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    const ctx=state.audioCtx, now=ctx.currentTime, gain=ctx.createGain(), osc=ctx.createOscillator();
    const map={select:[340,.05],start:[190,.18],hit:[75,.18],miss:[220,.06],sink:[55,.42],sonar:[680,.35],victory:[440,.5]};
    const [freq,dur]=map[type]||map.select;
    osc.type=type==="hit"||type==="sink"?"sawtooth":"sine";
    osc.frequency.setValueAtTime(freq,now);
    if(type==="sonar") osc.frequency.exponentialRampToValueAtTime(1100,now+dur);
    if(type==="victory") osc.frequency.exponentialRampToValueAtTime(880,now+dur);
    gain.gain.setValueAtTime(.045,now); gain.gain.exponentialRampToValueAtTime(.001,now+dur);
    osc.connect(gain).connect(ctx.destination); osc.start(now); osc.stop(now+dur);
  } catch {}
}

init();
