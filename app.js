const SHIP_CATALOG = {
  carrier:    { id:"carrier", name:"CARRIER", code:"CV-05", shape:[[0,0],[1,0],[2,0],[3,0],[4,0]] },
  battleship: { id:"battleship", name:"BATTLESHIP", code:"BB-04", shape:[[0,0],[1,0],[2,0],[3,0]] },
  cruiser:    { id:"cruiser", name:"CRUISER", code:"CG-03", shape:[[0,0],[1,0],[2,0]] },
  submarine:  { id:"submarine", name:"SUBMARINE", code:"SS-03", shape:[[0,0],[1,0],[2,0]] },
  destroyer:  { id:"destroyer", name:"DESTROYER", code:"DD-02", shape:[[0,0],[1,0]] },
  hook:       { id:"hook", name:"HOOK CARRIER", code:"HX-06", shape:[[0,0],[1,0],[2,0],[3,0],[3,1],[3,2]] },
  trident:    { id:"trident", name:"TRIDENT", code:"TR-05", shape:[[0,0],[1,0],[2,0],[1,1],[1,2]] },
  zigzag:     { id:"zigzag", name:"CORVETTE", code:"CV-04", shape:[[0,0],[1,0],[1,1],[2,1]] },
  stair:      { id:"stair", name:"STAIRCASE", code:"ST-05", shape:[[0,0],[1,0],[1,1],[2,1],[2,2]] },
  elbow:      { id:"elbow", name:"RAIDER", code:"RD-03", shape:[[0,0],[1,0],[1,1]] }
};

const CATALOG_ORDER = ["carrier","battleship","cruiser","submarine","destroyer","hook","trident","zigzag","stair","elbow"];
const WEAPONS = {
  cannon:  { name:"NAVAL GUN", desc:"Single precision strike", cost:0, icon:"crosshair" },
  sonar:   { name:"SONAR PULSE", desc:"Scan 3 × 3; center can hit", cost:2, icon:"radar" },
  torpedo: { name:"TORPEDO", desc:"Strike an entire row", cost:4, icon:"bolt" },
  barrage: { name:"BARRAGE", desc:"Strike a 2 × 2 sector", cost:5, icon:"anchor" }
};

const MODE_TEMPLATES = {
  classic: {
    title:"CLASSIC PROTOCOL", label:"CLASSIC", size:10, abilities:["cannon"],
    shipIds:["carrier","battleship","cruiser","submarine","destroyer"]
  },
  rogue: {
    title:"ROGUE FLEET PROTOCOL", label:"ROGUE FLEET", size:12, abilities:["cannon"],
    shipIds:["hook","stair","trident","zigzag","elbow","destroyer"]
  },
  command: {
    title:"COMMANDER PROTOCOL", label:"COMMANDER", size:10, abilities:["cannon","sonar","torpedo","barrage"],
    shipIds:["carrier","battleship","cruiser","submarine","destroyer"]
  }
};

const $ = s => document.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const key = (x,y) => `${x},${y}`;
const coord = (x,y) => `${String.fromCharCode(65+x)}${y+1}`;
const rand = n => Math.floor(Math.random()*n);
const clone = v => JSON.parse(JSON.stringify(v));

const state = {
  mode:"classic", config:null, custom:null, phase:"menu",
  own:[], enemy:[], ownShots:new Set(), enemyShots:new Set(), enemyHitCells:new Set(), enemySunkCells:new Set(),
  sonarMarks:new Map(), turn:"player", round:1, energy:2, weapon:"cannon", selectedShip:null, rotation:0,
  shots:0, hits:0, gameOver:false, audio:true, audioCtx:null, enemyQueue:[],
  profile:{ name:"", games:0, wins:0 },
  multiplayer:false, host:false, peer:null, conn:null, joinId:null, localReady:false, remoteReady:false,
  remoteName:"OPPONENT", remoteShipsRemaining:0, pendingAttack:null, identityNext:null
};

function makeConfig(mode) {
  const base = clone(MODE_TEMPLATES[mode] || state.custom);
  base.ships = base.shipIds.map((id,i) => ({ ...clone(SHIP_CATALOG[id]), uid:`${id}-${i}` }));
  base.energy = base.abilities.some(a => a !== "cannon");
  return base;
}

function init() {
  loadProfile();
  setupLanding();
  setupIdentity();
  setupCustom();
  setupLobby();
  setupGameControls();
  setInterval(() => $("#clock").textContent = new Date().toISOString().slice(11,19)+" UTC", 1000);
  const join = new URLSearchParams(location.search).get("join");
  if (join) {
    state.joinId = join;
    ensureIdentity(() => showGuestLobby(join));
  }
}

function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem("deadReckoningProfile") || "{}");
    state.profile = { name:saved.name || "", games:saved.games || 0, wins:saved.wins || 0 };
  } catch {}
  renderProfile();
}

function saveProfile() {
  localStorage.setItem("deadReckoningProfile", JSON.stringify(state.profile));
  renderProfile();
}

function renderProfile() {
  const name = state.profile.name || "SET NAME";
  const initial = state.profile.name.charAt(0).toUpperCase() || "?";
  $("#profileName").textContent = name;
  $$(".profile-avatar").forEach(a => {
    if (!a.closest("#remoteLobbyPlayer")) a.textContent = initial;
  });
  $("#identityRecord").textContent = `${state.profile.wins} WINS · ${state.profile.games} GAMES`;
}

function setupLanding() {
  $$(".mode-card").forEach(card => {
    const select = () => {
      state.mode = card.dataset.mode;
      setSelectedCard(card);
      if (state.mode === "custom") openCustom();
      sound("select");
    };
    card.addEventListener("click", select);
    card.addEventListener("keydown", e => { if (e.key === " " || e.key === "Enter") select(); });
  });
  $("#launchBtn").addEventListener("click", () => ensureIdentity(() => startDeployment(false)));
  $("#multiplayerBtn").addEventListener("click", () => ensureIdentity(createHostLobby));
  $("#profileBtn").addEventListener("click", () => openIdentity());
  $("#homeBtn").addEventListener("click", showMenu);
  document.addEventListener("keydown", e => {
    if (e.key.toLowerCase() === "r" && state.phase === "deployment") rotateSelected();
    if (e.key === "Escape" && state.phase !== "menu") showMenu();
  });
}

function setSelectedCard(card) {
  $$(".mode-card").forEach(c => {
    const selected = c === card;
    c.classList.toggle("selected", selected);
    c.querySelector(".card-select span").textContent = selected
      ? (c.dataset.mode === "custom" ? "PROTOCOL CONFIGURED" : "PROTOCOL SELECTED")
      : (c.dataset.mode === "custom" ? "CONFIGURE PROTOCOL" : "SELECT PROTOCOL");
    c.querySelector(".card-select b").textContent = selected ? "✓" : (c.dataset.mode === "custom" ? "＋" : "↗");
  });
}

function setupIdentity() {
  $("#saveUsernameBtn").addEventListener("click", saveIdentity);
  $("#usernameInput").addEventListener("keydown", e => { if (e.key === "Enter") saveIdentity(); });
}

function ensureIdentity(next) {
  if (state.profile.name) return next();
  openIdentity(next);
}

function openIdentity(next=null) {
  state.identityNext = next;
  $("#usernameInput").value = state.profile.name;
  $("#identityModal").classList.add("show");
  setTimeout(() => $("#usernameInput").focus(), 80);
}

function saveIdentity() {
  const name = $("#usernameInput").value.trim().replace(/[<>]/g,"").slice(0,18);
  if (name.length < 2) return showToast("CALLSIGN REQUIRED","Use at least two characters");
  state.profile.name = name;
  saveProfile();
  $("#identityModal").classList.remove("show");
  const next = state.identityNext;
  state.identityNext = null;
  if (next) next();
  sound("start");
}

function setupCustom() {
  state.custom = {
    title:"CUSTOM PROTOCOL", label:"CUSTOM", size:10, abilities:["cannon","sonar"],
    shipIds:["carrier","battleship","cruiser","submarine","destroyer"]
  };
  $("#gridSizeInput").addEventListener("input", e => {
    $("#gridSizeLabel").textContent = `${e.target.value} × ${e.target.value}`;
    renderCustomSummary();
  });
  $("#closeCustomBtn").addEventListener("click", () => $("#customModal").classList.remove("show"));
  $("#saveCustomBtn").addEventListener("click", saveCustom);
}

function openCustom() {
  renderCustomEditor();
  $("#customModal").classList.add("show");
}

function countsFromCustom() {
  const counts = {};
  state.custom.shipIds.forEach(id => counts[id] = (counts[id] || 0) + 1);
  return counts;
}

function renderCustomEditor() {
  $("#gridSizeInput").value = state.custom.size;
  $("#gridSizeLabel").textContent = `${state.custom.size} × ${state.custom.size}`;
  const counts = countsFromCustom();
  $("#customFleet").innerHTML = CATALOG_ORDER.map(id => {
    const s=SHIP_CATALOG[id], count=counts[id] || 0;
    return `<div class="custom-ship-row" data-ship="${id}">
      <div><b>${s.name}</b><small>${s.shape.length} CELLS · ${isLinear(s.shape)?"LINE":"CONNECTED SHAPE"}</small></div>
      <div class="counter"><button data-delta="-1">−</button><span>${count}</span><button data-delta="1">＋</button></div>
    </div>`;
  }).join("");
  $$(".custom-ship-row button").forEach(btn => btn.addEventListener("click", () => {
    const row=btn.closest(".custom-ship-row"), countEl=row.querySelector(".counter span");
    const total=$$(".custom-ship-row .counter span").reduce((n,e)=>n+(+e.textContent),0);
    let n=+countEl.textContent + +btn.dataset.delta;
    if (n<0 || n>3 || (btn.dataset.delta==="1" && total>=10)) return;
    countEl.textContent=n;
    renderCustomSummary();
  }));
  $("#abilityToggles").innerHTML = Object.entries(WEAPONS).map(([id,w]) => `
    <label class="ability-toggle"><svg><use href="#icon-${w.icon}"/></svg>
      <span><b>${w.name}</b><small>${w.desc} · ${w.cost?w.cost+" ENERGY":"FREE"}</small></span>
      <input type="checkbox" data-ability="${id}" ${state.custom.abilities.includes(id)?"checked":""} ${id==="cannon"?"disabled":""}>
    </label>`).join("");
  $$("#abilityToggles input").forEach(input => input.addEventListener("change", renderCustomSummary));
  renderCustomSummary();
}

function renderCustomSummary() {
  const count = $$(".custom-ship-row .counter span").reduce((n,e)=>n+(+e.textContent),0);
  const abilities = $$("#abilityToggles input:checked").length || state.custom.abilities.length;
  const size = +$("#gridSizeInput").value;
  $("#customSummary").textContent = `${size} × ${size} · ${count} SHIPS · ${abilities} SYSTEM${abilities===1?"":"S"}`;
}

function saveCustom() {
  const ids=[];
  $$(".custom-ship-row").forEach(row => {
    const n=+row.querySelector(".counter span").textContent;
    for(let i=0;i<n;i++) ids.push(row.dataset.ship);
  });
  if (!ids.length) return showToast("FLEET REQUIRED","Add at least one vessel");
  state.custom = {
    title:"CUSTOM PROTOCOL", label:"CUSTOM", size:+$("#gridSizeInput").value,
    abilities:$$("#abilityToggles input:checked").map(e=>e.dataset.ability), shipIds:ids
  };
  if (!state.custom.abilities.includes("cannon")) state.custom.abilities.unshift("cannon");
  state.mode="custom";
  $("#customModal").classList.remove("show");
  setSelectedCard($('.mode-card[data-mode="custom"]'));
  showToast("PROTOCOL SAVED",`${state.custom.size} × ${state.custom.size} grid · ${ids.length} ships`);
}

function setupLobby() {
  $("#closeLobbyBtn").addEventListener("click", () => closeLobby(true));
  $("#copyInviteBtn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#inviteLinkInput").value); }
    catch { $("#inviteLinkInput").select(); document.execCommand("copy"); }
    $("#copyInviteBtn").textContent="COPIED";
    setTimeout(()=>$("#copyInviteBtn").textContent="COPY LINK",1200);
  });
  $("#joinPlayBtn").addEventListener("click", connectAsGuest);
}

function currentConfig() {
  return makeConfig(state.mode);
}

function protocolText(config=currentConfig()) {
  return `${config.label} · ${config.size} × ${config.size} · ${config.ships?.length || config.shipIds.length} SHIPS`;
}

function resetLobbyUI() {
  $("#remoteLobbyPlayer").classList.remove("ready");
  $("#remoteLobbyName").textContent="WAITING...";
  $("#remoteLobbyStatus").textContent="OFFLINE";
  $("#localLobbyName").textContent=state.profile.name;
  $("#lobbyProtocol").textContent=protocolText();
}

function createHostLobby() {
  if (!window.Peer) return showToast("NETWORK UNAVAILABLE","Multiplayer service could not load");
  destroyNetwork();
  state.multiplayer=true; state.host=true; state.config=currentConfig();
  resetLobbyUI();
  $("#lobbyTitle").textContent="INVITE YOUR OPPONENT";
  $("#lobbyDescription").textContent="Share this one-time battle link. Keep this tab open while your opponent joins.";
  $("#inviteLinkRow").style.display="";
  $("#joinPlayBtn").style.display="none";
  $("#lobbyStatus").textContent="Creating secure room...";
  $("#lobbyModal").classList.add("show");
  state.peer = new Peer();
  state.peer.on("open", id => {
    const url=new URL(location.href); url.search=""; url.searchParams.set("join",id);
    $("#inviteLinkInput").value=url.toString();
    $("#lobbyStatus").textContent="Room online · waiting for opponent";
  });
  state.peer.on("connection", connection => {
    if (state.conn?.open) return connection.close();
    attachConnection(connection);
  });
  state.peer.on("error", networkError);
}

function showGuestLobby(joinId) {
  state.multiplayer=true; state.host=false; state.joinId=joinId;
  resetLobbyUI();
  $("#lobbyTitle").textContent="BATTLE INVITATION";
  $("#lobbyDescription").textContent="A commander has invited you to battle. Confirm your callsign and connect.";
  $("#inviteLinkRow").style.display="none";
  $("#joinPlayBtn").style.display="flex";
  $("#lobbyStatus").textContent="Invitation verified · ready to connect";
  $("#lobbyModal").classList.add("show");
}

function connectAsGuest() {
  if (!window.Peer) return showToast("NETWORK UNAVAILABLE","Multiplayer service could not load");
  $("#joinPlayBtn").disabled=true;
  $("#lobbyStatus").textContent="Establishing encrypted channel...";
  state.peer = new Peer();
  state.peer.on("open", () => {
    const connection=state.peer.connect(state.joinId,{ reliable:true, serialization:"json", metadata:{name:state.profile.name} });
    attachConnection(connection);
  });
  state.peer.on("error", networkError);
}

function attachConnection(connection) {
  state.conn=connection;
  connection.on("open", () => {
    $("#lobbyStatus").textContent="Peer channel connected";
    if (!state.host) connection.send({type:"hello",name:state.profile.name});
  });
  connection.on("data", handleNetworkMessage);
  connection.on("close", () => {
    if (!state.gameOver) showToast("CONNECTION LOST","The opposing commander disconnected");
  });
  connection.on("error", networkError);
}

function handleNetworkMessage(data) {
  if (!data || typeof data!=="object") return;
  if (data.type==="hello" && state.host) {
    state.remoteName=(data.name||"OPPONENT").slice(0,18);
    markRemoteConnected();
    state.conn.send({type:"welcome",name:state.profile.name,config:plainConfig(state.config)});
    setTimeout(() => { closeLobby(false); startDeployment(true,state.config); },450);
  }
  if (data.type==="welcome" && !state.host) {
    state.remoteName=(data.name||"HOST").slice(0,18);
    state.config=restoreConfig(data.config);
    markRemoteConnected();
    setTimeout(() => { closeLobby(false); startDeployment(true,state.config); },450);
  }
  if (data.type==="ready") {
    state.remoteReady=true;
    showToast("OPPONENT READY",`${state.remoteName} has deployed`);
    maybeStartMultiplayer();
  }
  if (data.type==="start") beginBattle(data.first==="host" ? (state.host?"player":"enemy") : (state.host?"enemy":"player"));
  if (data.type==="attack") receiveRemoteAttack(data);
  if (data.type==="attack-result") receiveAttackResult(data);
  if (data.type==="abort") endGame(true,"OPPONENT WITHDREW");
}

function markRemoteConnected() {
  $("#remoteLobbyName").textContent=state.remoteName;
  $("#remoteLobbyStatus").textContent="CONNECTED";
  $("#remoteLobbyPlayer").classList.add("ready");
  $("#lobbyStatus").textContent="Opponent found · preparing deployment";
}

function plainConfig(config) {
  return clone({title:config.title,label:config.label,size:config.size,abilities:config.abilities,ships:config.ships});
}

function restoreConfig(config) {
  const restored=clone(config);
  restored.energy=restored.abilities.some(a=>a!=="cannon");
  return restored;
}

function networkError(err) {
  console.warn("Peer connection:",err?.type||err);
  $("#joinPlayBtn").disabled=false;
  $("#lobbyStatus").textContent="Connection failed · try the invitation again";
  showToast("LINK FAILED","Could not reach the other commander");
}

function closeLobby(destroy=false) {
  $("#lobbyModal").classList.remove("show");
  if (destroy) destroyNetwork();
}

function destroyNetwork() {
  try { state.conn?.close(); } catch {}
  try { state.peer?.destroy(); } catch {}
  state.conn=null; state.peer=null;
}

function setupGameControls() {
  $("#rotateBtn").addEventListener("click",rotateSelected);
  $("#clearFleetBtn").addEventListener("click",clearPlacement);
  $("#autoPlaceBtn").addEventListener("click",autoPlaceRemaining);
  $("#redeployBtn").addEventListener("click",autoPlaceRemaining);
  $("#readyBtn").addEventListener("click",confirmDeployment);
  $("#clearLog").addEventListener("click",()=>$("#logEntries").innerHTML="");
  $("#surrenderBtn").addEventListener("click",()=>{
    if(state.multiplayer && state.conn?.open) state.conn.send({type:"abort"});
    endGame(false,"OPERATION ABORTED");
  });
  $("#menuBtn").addEventListener("click",showMenu);
  $("#rematchBtn").addEventListener("click",()=>{
    $("#resultModal").classList.remove("show");
    if(state.multiplayer) showMenu(); else startDeployment(false);
  });
  $("#audioBtn").addEventListener("click",()=>{
    state.audio=!state.audio; $("#audioBtn").classList.toggle("muted",!state.audio); sound("select");
  });
}

function startDeployment(multiplayer=false, suppliedConfig=null) {
  state.multiplayer=multiplayer;
  state.config=suppliedConfig ? restoreConfig(plainConfig(suppliedConfig)) : currentConfig();
  state.phase="deployment"; state.own=[]; state.enemy=[]; state.ownShots=new Set(); state.enemyShots=new Set();
  state.enemyHitCells=new Set(); state.enemySunkCells=new Set(); state.sonarMarks=new Map();
  state.turn="deployment"; state.round=1; state.energy=state.config.energy?2:0; state.weapon="cannon";
  state.selectedShip=null; state.rotation=0; state.shots=0; state.hits=0; state.gameOver=false; state.enemyQueue=[];
  state.localReady=false; state.remoteReady=false; state.remoteShipsRemaining=state.config.ships.length;
  state.own=state.config.ships.map(s=>({...clone(s),cells:[],hits:new Set(),sunk:false}));
  $("#landing").classList.remove("active"); $("#game").classList.add("active","deploying"); $("#game").classList.remove("in-battle");
  $("#deploymentStage").classList.remove("hidden");
  $("#gameModeTitle").textContent=state.config.title;
  $("#operationCode").textContent=multiplayer?"PEERLINK-LIVE":["NORTHSTAR-07","BLACKTIDE-12","IRONVEIL-03","FREEFORM-01"][["classic","rogue","command","custom"].indexOf(state.mode)];
  document.documentElement.style.setProperty("--cols",state.config.size);
  document.documentElement.style.setProperty("--rows",state.config.size);
  buildGrids(); buildWeapons(); renderShipyard(); renderAll();
  $("#logEntries").innerHTML="";
  log(`${state.config.label} deployment initialized`);
  log(multiplayer?`Linked with ${state.remoteName}`:"AI opponent standing by");
  sound("start");
}

function buildGrids() {
  ["enemy","own"].forEach(type=>{
    const grid=$(`#${type}Grid`); grid.innerHTML="";
    for(let y=0;y<state.config.size;y++) for(let x=0;x<state.config.size;x++){
      const cell=document.createElement("button");
      cell.className="cell"; cell.dataset.x=x; cell.dataset.y=y;
      cell.setAttribute("aria-label",type==="enemy"?`Fire at ${coord(x,y)}`:`Place at ${coord(x,y)}`);
      if(type==="enemy"){
        cell.addEventListener("click",()=>playerAction(x,y));
        cell.addEventListener("mouseenter",()=>positionReticle(x,y));
      } else {
        cell.addEventListener("click",()=>placeSelectedAt(x,y));
        cell.addEventListener("mouseenter",()=>previewPlacement(x,y));
        cell.addEventListener("mouseleave",clearPreview);
      }
      grid.appendChild(cell);
    }
    const top=$(`#${type}LabelsTop`), side=$(`#${type}LabelsSide`);
    top.innerHTML=Array.from({length:state.config.size},(_,i)=>`<span>${String.fromCharCode(65+i)}</span>`).join("");
    side.innerHTML=Array.from({length:state.config.size},(_,i)=>`<span>${String(i+1).padStart(2,"0")}</span>`).join("");
    const shell=grid.closest(".grid-shell");
    shell.querySelector(".board-ship-layer")?.remove();
    const layer=document.createElement("div"); layer.className="board-ship-layer"; layer.id=`${type}ShipLayer`;
    layer.style.width=`${state.config.size*cellSize()}px`; layer.style.height=`${state.config.size*cellSize()}px`;
    shell.appendChild(layer);
    if(type==="own") shell.classList.add("placement");
  });
}

function renderShipyard() {
  $("#shipyard").innerHTML=state.own.map((s,i)=>`
    <button class="yard-ship" data-uid="${s.uid}">
      <svg viewBox="0 0 70 34"><path d="M3 22 13 14h39l14 8-9 8H12Z" fill="rgba(99,151,151,.4)" stroke="currentColor"/><path d="M25 14V8h17v6M31 8V4" fill="none" stroke="currentColor"/></svg>
      <span><b>${s.name}</b><small>${s.code}</small></span><em>${s.shape.length}</em>
    </button>`).join("");
  $$(".yard-ship").forEach(btn=>btn.addEventListener("click",()=>selectShip(btn.dataset.uid)));
  selectFirstUnplaced();
}

function selectShip(uid) {
  const ship=state.own.find(s=>s.uid===uid);
  if(!ship || ship.cells.length) return;
  state.selectedShip=uid;
  $$(".yard-ship").forEach(b=>b.classList.toggle("active",b.dataset.uid===uid));
}

function selectFirstUnplaced() {
  const ship=state.own.find(s=>!s.cells.length);
  state.selectedShip=ship?.uid||null;
  $$(".yard-ship").forEach(b=>{
    const placed=!!state.own.find(s=>s.uid===b.dataset.uid)?.cells.length;
    b.classList.toggle("placed",placed);
    b.classList.toggle("active",b.dataset.uid===state.selectedShip);
  });
  $("#readyBtn").disabled=state.own.some(s=>!s.cells.length);
}

function rotateShape(shape,rotation) {
  let pts=shape.map(p=>[...p]);
  for(let i=0;i<rotation;i++) pts=pts.map(([x,y])=>[-y,x]);
  const minX=Math.min(...pts.map(p=>p[0])),minY=Math.min(...pts.map(p=>p[1]));
  return pts.map(([x,y])=>[x-minX,y-minY]);
}

function rotatedSelected() {
  const ship=state.own.find(s=>s.uid===state.selectedShip);
  return ship?rotateShape(ship.shape,state.rotation):[];
}

function occupiedWithout(uid=null) {
  return new Set(state.own.filter(s=>s.uid!==uid).flatMap(s=>s.cells.map(([x,y])=>key(x,y))));
}

function placementCells(x,y,shape=rotatedSelected()) { return shape.map(([dx,dy])=>[x+dx,y+dy]); }
function placementValid(cells,occupied=occupiedWithout()) {
  return cells.length && cells.every(([x,y])=>inside(x,y)&&!occupied.has(key(x,y)));
}

function previewPlacement(x,y) {
  if(state.phase!=="deployment"||!state.selectedShip) return;
  clearPreview();
  const cells=placementCells(x,y), valid=placementValid(cells);
  cells.filter(([cx,cy])=>inside(cx,cy)).forEach(([cx,cy])=>{
    ownCell(cx,cy).classList.add(valid?"preview-valid":"preview-invalid");
  });
}

function clearPreview() { $$("#ownGrid .cell").forEach(c=>c.classList.remove("preview-valid","preview-invalid")); }

function placeSelectedAt(x,y) {
  if(state.phase!=="deployment"||!state.selectedShip) return;
  const cells=placementCells(x,y);
  if(!placementValid(cells)) return sound("miss");
  const ship=state.own.find(s=>s.uid===state.selectedShip);
  ship.cells=cells;
  clearPreview(); selectFirstUnplaced(); renderAll(); sound("select");
}

function rotateSelected() {
  if(state.phase!=="deployment") return;
  state.rotation=(state.rotation+1)%4; clearPreview(); sound("select");
}

function clearPlacement() {
  if(state.phase!=="deployment"||state.localReady) return;
  state.own.forEach(s=>s.cells=[]); state.rotation=0; selectFirstUnplaced(); renderAll();
}

function autoPlaceRemaining() {
  if(state.phase!=="deployment"||state.localReady) return;
  const occupied=occupiedWithout();
  for(const ship of state.own.filter(s=>!s.cells.length)){
    let placed=null;
    for(let attempt=0;attempt<800&&!placed;attempt++){
      const shape=rotateShape(ship.shape,rand(4));
      const maxX=Math.max(...shape.map(p=>p[0])),maxY=Math.max(...shape.map(p=>p[1]));
      const ox=rand(state.config.size-maxX),oy=rand(state.config.size-maxY);
      const cells=shape.map(([x,y])=>[x+ox,y+oy]);
      if(placementValid(cells,occupied)) placed=cells;
    }
    if(!placed) return showToast("NO VALID FORMATION","Clear the board and try again");
    ship.cells=placed; placed.forEach(([x,y])=>occupied.add(key(x,y)));
  }
  selectFirstUnplaced(); renderAll(); sound("start");
}

function confirmDeployment() {
  if(state.own.some(s=>!s.cells.length)) return showToast("FLEET INCOMPLETE","Place every vessel before continuing");
  state.localReady=true; $("#readyBtn").disabled=true; $("#readyBtn span").textContent=state.multiplayer?"WAITING FOR OPPONENT":"DEPLOYING...";
  if(state.multiplayer){
    state.conn?.send({type:"ready"}); maybeStartMultiplayer();
  } else {
    state.enemy=autoPlaceFleet(state.config.ships,state.config.size);
    setTimeout(()=>beginBattle("player"),350);
  }
}

function maybeStartMultiplayer() {
  if(!state.localReady||!state.remoteReady) return;
  if(state.host){
    state.conn.send({type:"start",first:"host"});
    beginBattle("player");
  }
}

function beginBattle(firstTurn) {
  state.phase="battle"; state.turn=firstTurn; state.round=1;
  $("#deploymentStage").classList.add("hidden");
  $("#game").classList.remove("deploying"); $("#game").classList.add("in-battle");
  $(".own-wrap .grid-shell").classList.remove("placement");
  $("#readyBtn span").textContent="CONFIRM DEPLOYMENT";
  renderAll();
  log(firstTurn==="player"?"Weapons free — your turn":`${state.remoteName} has first strike`);
  showToast("BATTLE STATIONS",firstTurn==="player"?"You have the first shot":`${state.remoteName} is targeting`);
}

function autoPlaceFleet(defs,size) {
  for(let restart=0;restart<100;restart++){
    const fleet=defs.map(s=>({...clone(s),cells:[],hits:new Set(),sunk:false})),occupied=new Set();
    let failed=false;
    for(const ship of fleet){
      let placed=null;
      for(let attempt=0;attempt<700&&!placed;attempt++){
        const shape=rotateShape(ship.shape,rand(4));
        const maxX=Math.max(...shape.map(p=>p[0])),maxY=Math.max(...shape.map(p=>p[1]));
        const ox=rand(size-maxX),oy=rand(size-maxY),cells=shape.map(([x,y])=>[x+ox,y+oy]);
        if(cells.every(([x,y])=>!occupied.has(key(x,y)))) placed=cells;
      }
      if(!placed){failed=true;break;}
      ship.cells=placed; placed.forEach(([x,y])=>occupied.add(key(x,y)));
    }
    if(!failed)return fleet;
  }
  throw new Error("Unable to deploy fleet");
}

function buildWeapons() {
  $("#weapons").innerHTML=state.config.abilities.map(id=>{
    const w=WEAPONS[id];
    return `<button class="weapon ${id==="cannon"?"active":""}" data-weapon="${id}">
      <svg><use href="#icon-${w.icon}"/></svg><div><b>${w.name}</b><small>${w.desc}</small></div>
      <span class="weapon-cost">${w.cost?w.cost+"⚡":"FREE"}</span></button>`;
  }).join("");
  $$(".weapon").forEach(btn=>btn.addEventListener("click",()=>{
    const id=btn.dataset.weapon;
    if(state.energy<WEAPONS[id].cost)return showToast("LOW ENERGY",`Requires ${WEAPONS[id].cost} command energy`);
    state.weapon=id; $$(".weapon").forEach(b=>b.classList.toggle("active",b===btn)); sound("select");
  }));
  $("#energyBox").style.display=state.config.energy?"":"none";
}

function playerAction(x,y) {
  if(state.phase!=="battle"||state.turn!=="player"||state.gameOver)return;
  const weapon=WEAPONS[state.weapon];
  if(state.energy<weapon.cost)return showToast("LOW ENERGY",`Requires ${weapon.cost} command energy`);
  if(state.weapon==="sonar"&&state.sonarMarks.has(key(x,y)))return showToast("SECTOR SCANNED","Choose a new sonar center");
  if(state.multiplayer){
    state.energy-=weapon.cost; state.pendingAttack={weapon:state.weapon,x,y};
    state.turn="waiting"; state.conn.send({type:"attack",weapon:state.weapon,x,y});
    renderHud(); log(`${weapon.name} launched at ${coord(x,y)}`); return;
  }
  const outcome=resolveAction(state.enemy,state.ownShots,state.weapon,x,y);
  if(!outcome.valid)return showToast("INVALID TARGET","All affected coordinates were already fired upon");
  state.energy-=weapon.cost; consumeOutcome(outcome,x,y);
  if(state.enemy.every(s=>s.sunk))return setTimeout(()=>endGame(true),650);
  finishSoloTurn();
}

function actionTargets(weapon,x,y) {
  if(weapon==="cannon"||weapon==="sonar")return [[x,y]];
  if(weapon==="torpedo")return Array.from({length:state.config.size},(_,tx)=>[tx,y]);
  if(weapon==="barrage")return [[x,y],[x+1,y],[x,y+1],[x+1,y+1]].filter(p=>inside(...p));
  return [];
}

function resolveAction(fleet,shotSet,weapon,x,y) {
  let contacts=null;
  if(weapon==="sonar"){
    const found=new Set();
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(inside(x+dx,y+dy)){const s=shipAt(fleet,x+dx,y+dy);if(s)found.add(s.uid);}
    }
    contacts=found.size;
  }
  const targets=actionTargets(weapon,x,y).filter(([tx,ty])=>!shotSet.has(key(tx,ty)));
  if(!targets.length && weapon!=="sonar")return {valid:false,results:[]};
  const results=[];
  targets.forEach(([tx,ty])=>{
    shotSet.add(key(tx,ty));
    const ship=shipAt(fleet,tx,ty);
    const result={x:tx,y:ty,hit:!!ship,sunk:false,shipName:ship?.name||null,sunkCells:[]};
    if(ship){
      ship.hits.add(key(tx,ty));
      if(ship.hits.size===ship.cells.length&&!ship.sunk){
        ship.sunk=true;result.sunk=true;result.sunkCells=ship.cells.map(p=>[...p]);
      }
    }
    results.push(result);
  });
  return {valid:true,weapon,x,y,contacts,results,gameOver:fleet.every(s=>s.sunk)};
}

function consumeOutcome(outcome,x,y) {
  if(outcome.weapon==="sonar")state.sonarMarks.set(key(x,y),outcome.contacts);
  const hits=outcome.results.filter(r=>r.hit),sunk=outcome.results.filter(r=>r.sunk);
  state.shots+=outcome.results.length; state.hits+=hits.length;
  if(hits.length&&state.config.energy)state.energy=Math.min(6,state.energy+1);
  renderAll();
  if(outcome.weapon==="sonar"){
    const centerHit=hits.length?` Center strike hit ${hits[0].shipName}.`:" Center strike missed.";
    showToast("SONAR RETURN",`${outcome.contacts} vessel${outcome.contacts===1?"":"s"} detected.${centerHit}`);
    log(`Sonar ${coord(x,y)}: ${outcome.contacts} vessel contact${outcome.contacts===1?"":"s"}`,!!hits.length);
    sound("sonar"); return;
  }
  if(sunk.length){showToast("VESSEL DESTROYED",`${sunk.map(r=>r.shipName).join(" + ")} sunk`);log(`${sunk.map(r=>r.shipName).join(", ")} destroyed`,true);sound("sink");}
  else if(hits.length){showToast("DIRECT HIT",`Hostile vessel damaged near ${coord(x,y)}`);log(`${WEAPONS[outcome.weapon].name} scored a hit`,true);sound("hit");}
  else{showToast("SHOT WIDE",`No contact near ${coord(x,y)}`);log(`${WEAPONS[outcome.weapon].name} missed`);sound("miss");}
}

function finishSoloTurn() {
  resetWeapon(); state.turn="enemy";renderHud();setTimeout(enemyTurn,650);
}

function enemyTurn() {
  if(state.gameOver)return;
  let target=null;
  while(state.enemyQueue.length&&!target){
    const p=state.enemyQueue.shift();if(inside(...p)&&!state.enemyShots.has(key(...p)))target=p;
  }
  while(!target||state.enemyShots.has(key(...target)))target=[rand(state.config.size),rand(state.config.size)];
  const [x,y]=target,outcome=resolveAction(state.own,state.enemyShots,"cannon",x,y),result=outcome.results[0];
  if(result.hit){
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dy])=>state.enemyQueue.push([x+dx,y+dy]));
    if(result.sunk){state.enemyQueue=[];showToast("VESSEL LOST",`${result.shipName} has gone down`);log(`Enemy destroyed ${result.shipName}`,true);sound("sink");}
    else{showToast("HULL BREACH",`Incoming strike at ${coord(x,y)}`);log(`Enemy hit at ${coord(x,y)}`,true);sound("hit");}
  }else{log(`Enemy missed at ${coord(x,y)}`);sound("miss");}
  renderAll();
  if(outcome.gameOver)return setTimeout(()=>endGame(false),650);
  state.turn="player";state.round++;renderHud();
}

function receiveRemoteAttack(data) {
  if(state.phase!=="battle"||state.gameOver)return;
  const outcome=resolveAction(state.own,state.enemyShots,data.weapon,data.x,data.y);
  renderAll();
  if(data.weapon==="sonar")log(`${state.remoteName} scanned ${coord(data.x,data.y)}`);
  else if(outcome.results.some(r=>r.hit))log(`${state.remoteName} hit your fleet`,true);
  else log(`${state.remoteName} missed`);
  state.conn.send({type:"attack-result",...outcome});
  if(outcome.gameOver)return setTimeout(()=>endGame(false),500);
  state.turn="player";state.round++;renderHud();
}

function receiveAttackResult(data) {
  if(!state.pendingAttack)return;
  data.results.forEach(r=>{
    state.ownShots.add(key(r.x,r.y));
    if(r.hit)state.enemyHitCells.add(key(r.x,r.y));
    if(r.sunk){
      r.sunkCells.forEach(([x,y])=>state.enemySunkCells.add(key(x,y)));
      state.remoteShipsRemaining=Math.max(0,state.remoteShipsRemaining-1);
    }
  });
  const outcome={valid:true,weapon:data.weapon,x:data.x,y:data.y,contacts:data.contacts,results:data.results,gameOver:data.gameOver};
  consumeOutcome(outcome,data.x,data.y);
  state.pendingAttack=null; resetWeapon();
  if(data.gameOver)return setTimeout(()=>endGame(true),500);
  state.turn="enemy";renderHud();
}

function resetWeapon() {
  state.weapon="cannon";$$(".weapon").forEach(b=>b.classList.toggle("active",b.dataset.weapon==="cannon"));
}

function renderAll() {
  renderBoard("enemy");renderBoard("own");renderFleet();renderHud();
}

function renderBoard(type) {
  const enemy=type==="enemy",grid=$(`#${type}Grid`);
  const fleet=enemy?state.enemy:state.own,shots=enemy?state.ownShots:state.enemyShots;
  $$(".cell",grid).forEach(cell=>{
    const x=+cell.dataset.x,y=+cell.dataset.y,k=key(x,y);
    const ship=enemy?(state.multiplayer?null:shipAt(fleet,x,y)):shipAt(fleet,x,y);
    const hit=enemy&&state.multiplayer?state.enemyHitCells.has(k):shots.has(k)&&!!ship;
    cell.classList.toggle("miss",shots.has(k)&&!hit);
    cell.classList.toggle("hit",hit);
    cell.classList.toggle("sunk-cell",enemy?state.enemySunkCells.has(k):!!ship?.sunk&&shots.has(k));
  });
  renderShips(type);
  renderEffects(type);
}

function renderShips(type) {
  const layer=$(`#${type}ShipLayer`);if(!layer)return;layer.innerHTML="";
  const fleet=type==="own"?state.own:state.enemy;
  if(type==="enemy"&&state.multiplayer)return;
  fleet.forEach(ship=>{
    const reveal=type==="own"||ship.sunk;
    if(!reveal||!ship.cells.length)return;
    layer.insertAdjacentHTML("beforeend",shipSvg(ship,type==="enemy"));
  });
}

function shipSvg(ship,enemy=false) {
  const cell=cellSize(),xs=ship.cells.map(p=>p[0]),ys=ship.cells.map(p=>p[1]);
  const minX=Math.min(...xs),minY=Math.min(...ys),maxX=Math.max(...xs),maxY=Math.max(...ys);
  const w=(maxX-minX+1)*cell,h=(maxY-minY+1)*cell;
  const local=ship.cells.map(([x,y])=>[x-minX,y-minY]);
  const occupied=new Set(local.map(p=>key(...p))),inset=3;
  const fills=local.map(([x,y])=>`<rect class="ship-fill" x="${x*cell+inset}" y="${y*cell+inset}" width="${cell-inset*2+1}" height="${cell-inset*2+1}" rx="${cell*.18}"/>`).join("");
  let edges="";
  local.forEach(([x,y])=>{
    const x0=x*cell+inset,y0=y*cell+inset,x1=(x+1)*cell-inset,y1=(y+1)*cell-inset;
    if(!occupied.has(key(x,y-1)))edges+=`M${x0},${y0}H${x1}`;
    if(!occupied.has(key(x+1,y)))edges+=`M${x1},${y0}V${y1}`;
    if(!occupied.has(key(x,y+1)))edges+=`M${x1},${y1}H${x0}`;
    if(!occupied.has(key(x-1,y)))edges+=`M${x0},${y1}V${y0}`;
  });
  const detail=local.map(([x,y])=>`<circle cx="${x*cell+cell/2}" cy="${y*cell+cell/2}" r="${Math.max(2,cell*.08)}" fill="none" stroke="rgba(224,237,232,.48)"/>`).join("");
  return `<svg class="board-ship ${enemy?"enemy-revealed":""}" style="left:${minX*cell}px;top:${minY*cell}px;width:${w}px;height:${h}px" viewBox="0 0 ${w} ${h}">
    ${fills}<path class="ship-outline" d="${edges}"/>${detail}
    <path class="ship-keel" d="M${cell*.22},${h/2} H${Math.max(cell*.22,w-cell*.22)}"/>
  </svg>`;
}

function renderEffects(type) {
  const shell=$(`#${type}Grid`).closest(".grid-shell");
  $$(".fire-effect,.sonar-marker",shell).forEach(e=>e.remove());
  const hitKeys=type==="enemy"?(state.multiplayer?state.enemyHitCells:new Set(state.enemy.flatMap(s=>[...s.hits]))):new Set(state.own.flatMap(s=>[...s.hits]));
  hitKeys.forEach(k=>{
    const [x,y]=k.split(",").map(Number),f=document.createElement("span");f.className="fire-effect";
    f.style.left=`${18+(x+.5)*cellSize()}px`;f.style.top=`${18+(y+.5)*cellSize()}px`;shell.appendChild(f);
  });
  if(type==="enemy")state.sonarMarks.forEach((count,k)=>{
    const [x,y]=k.split(",").map(Number),m=document.createElement("span");m.className="sonar-marker";m.textContent=count;
    m.title=`${count} vessel${count===1?"":"s"} detected`;
    m.style.left=`${18+(x+.5)*cellSize()}px`;m.style.top=`${18+(y+.5)*cellSize()}px`;shell.appendChild(m);
  });
}

function renderFleet() {
  $("#fleetList").innerHTML=state.own.map(ship=>`
    <div class="fleet-item ${ship.sunk?"sunk":""}">
      <svg class="fleet-icon" viewBox="0 0 100 30"><path class="hull" d="M4 18 17 12h${Math.max(35,ship.shape.length*12)}l13 6-8 8H13Z"/><path d="M28 12V7h17v5M35 7V3" fill="none" stroke="#91aaaa"/></svg>
      <div class="fleet-info"><b>${ship.name}</b><small>${ship.code}</small><span class="fleet-pips">${ship.shape.map((_,i)=>`<i class="${i<ship.hits.size?"hit":""}"></i>`).join("")}</span></div>
    </div>`).join("");
  $("#ownAlive").textContent=state.own.filter(s=>!s.sunk).length;
}

function renderHud() {
  const labels={player:"YOUR TURN",enemy:state.multiplayer?`${state.remoteName}'S TURN`:"ENEMY FIRING",waiting:"AWAITING RESULT",deployment:"DEPLOYMENT"};
  $("#turnLabel").textContent=labels[state.turn]||"STANDBY";
  $("#turnLabel").style.color=state.turn==="player"?"var(--teal)":state.turn==="deployment"?"var(--gold)":"var(--orange)";
  $("#roundCount").textContent=String(state.round).padStart(2,"0");
  $("#energyValue").textContent=`${state.energy} / 6`;
  $("#energyTrack").innerHTML=Array.from({length:6},(_,i)=>`<i class="${i<state.energy?"filled":""}"></i>`).join("");
  $$(".weapon").forEach(btn=>btn.disabled=state.turn!=="player"||state.energy<WEAPONS[btn.dataset.weapon].cost);
}

function positionReticle(x,y) {
  if(state.turn!=="player"||state.gameOver)return;
  const r=$("#targetReticle"),cell=cellSize();r.style.left=`${18+x*cell+cell/2}px`;r.style.top=`${18+y*cell+cell/2}px`;r.style.display="block";
}

function cellSize() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell"))||38; }
function inside(x,y){return x>=0&&y>=0&&x<state.config.size&&y<state.config.size;}
function shipAt(fleet,x,y){return fleet.find(s=>s.cells.some(([sx,sy])=>sx===x&&sy===y));}
function ownCell(x,y){return $(`#ownGrid .cell[data-x="${x}"][data-y="${y}"]`);}
function isLinear(shape){return shape.every(([,y])=>y===shape[0][1])||shape.every(([x])=>x===shape[0][0]);}

function log(message,hit=false) {
  const el=document.createElement("div");el.className=`log-entry ${hit?"hit-log":""}`;
  el.innerHTML=`<time>${String(state.round).padStart(2,"0")}:${state.turn==="player"?"P":"E"}</time><span>${message}</span>`;
  $("#logEntries").prepend(el);
}

let toastTimer;
function showToast(title,text){
  clearTimeout(toastTimer);$("#toastTitle").textContent=title;$("#toastText").textContent=text;$("#toast").classList.add("show");
  toastTimer=setTimeout(()=>$("#toast").classList.remove("show"),2400);
}

function endGame(won,customTitle=null) {
  if(state.gameOver)return;
  state.gameOver=true;state.phase="result";
  state.profile.games++;if(won)state.profile.wins++;saveProfile();
  $("#resultTitle").textContent=customTitle||(won?"DECISIVE VICTORY":"FLEET LOST");
  $("#resultText").textContent=won?"The hostile fleet has been neutralized. The sea is ours.":"The operation is lost, but the war is not over.";
  $("#resultRounds").textContent=state.round;$("#resultAccuracy").textContent=`${state.shots?Math.round(state.hits/state.shots*100):0}%`;
  $("#resultShips").textContent=state.own.filter(s=>!s.sunk).length;$("#resultModal").classList.add("show");sound(won?"victory":"sink");
}

function showMenu() {
  destroyNetwork();state.phase="menu";state.multiplayer=false;state.host=false;
  $("#resultModal").classList.remove("show");$("#identityModal").classList.remove("show");$("#lobbyModal").classList.remove("show");
  $("#game").classList.remove("active","deploying","in-battle");$("#landing").classList.add("active");
  history.replaceState({}, "", location.pathname);
}

function sound(type) {
  if(!state.audio)return;
  try{
    if(!state.audioCtx)state.audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    const ctx=state.audioCtx,now=ctx.currentTime,gain=ctx.createGain(),osc=ctx.createOscillator();
    const map={select:[340,.05],start:[190,.18],hit:[75,.18],miss:[220,.06],sink:[55,.42],sonar:[680,.35],victory:[440,.5]};
    const [freq,dur]=map[type]||map.select;osc.type=type==="hit"||type==="sink"?"sawtooth":"sine";osc.frequency.setValueAtTime(freq,now);
    if(type==="sonar")osc.frequency.exponentialRampToValueAtTime(1100,now+dur);
    if(type==="victory")osc.frequency.exponentialRampToValueAtTime(880,now+dur);
    gain.gain.setValueAtTime(.045,now);gain.gain.exponentialRampToValueAtTime(.001,now+dur);
    osc.connect(gain).connect(ctx.destination);osc.start(now);osc.stop(now+dur);
  }catch{}
}

init();
