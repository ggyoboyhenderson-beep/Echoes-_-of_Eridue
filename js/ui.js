/* ==========================================================================
 * AXIOM — UI Layer
 * Renders state; routes clicks to Actions; communicates the world through how
 * it responds, not through tutorials.
 * ========================================================================== */

const UI = {};
UI.$ = (sel) => document.querySelector(sel);
UI.el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

/* ---- Title / protagonist select ----------------------------------------- */
UI.renderTitle = function () {
  const wrap = UI.$("#proto-select");
  wrap.innerHTML = "";
  for (const p of AXIOM.PROTAGONISTS) {
    const st = AXIOM.STATUS[p.status];
    const skills = Object.entries(p.skills).map(([k, v]) => `${AXIOM.SKILLS[k].name} ${v}`).join(" · ");
    const card = UI.el("div", "proto-card");
    card.innerHTML = `
      <div class="pr-status">${st.label}</div>
      <h3>${p.name}</h3>
      <div class="pr-home">${p.role} — ${AXIOM.DISTRICTS[p.home].name}</div>
      <div class="pr-born">${p.born}</div>
      <div class="pr-skills">${skills} · ${p.money} shekels</div>
      <div class="pr-crisis">“${p.crisis}”</div>`;
    card.onclick = () => Main.begin(p.id);
    wrap.appendChild(card);
  }
  const cont = UI.$("#btn-continue"), wipe = UI.$("#btn-wipe");
  if (State.hasSave()) { cont.hidden = false; wipe.hidden = false; }
  cont.onclick = () => Main.continueGame();
  wipe.onclick = () => { if (confirm("Erase your history? This cannot be undone.")) { State.wipe(); location.reload(); } };
};

/* ---- Full game render ---------------------------------------------------- */
UI.render = function () {
  const g = State.data;
  if (!g) return;
  document.body.classList.toggle("era-neon", g.here === "neon_labyrinth" || g.here === "spire");

  UI.renderHud(g);
  UI.renderVitals(g);
  UI.renderLocation(g);
  UI.renderActions(g);
  UI.renderDetail(g);
  UI.renderLog(g);

  if (g.over) UI.gameOver(g);
};

UI.renderHud = function (g) {
  UI.$("#hud-name").textContent = g.name;
  UI.$("#hud-role").textContent = `${g.role} · ${AXIOM.STATUS[g.status].label}`;
  UI.$("#hud-day").textContent = `Day ${g.day}`;
  const per = Engine.period(g);
  UI.$("#hud-period").textContent = `${String(g.hour).padStart(2, "0")}:00 · ${per.name}${Engine.isNight(g) ? " · night" : ""}`;
  const w = AXIOM.WEATHER[g.weather];
  UI.$("#hud-weather").textContent = w.name;
  UI.$("#hud-money").textContent = `${g.money} shekels`;
};

UI.bar = function (label, val, max, color, invert) {
  const pct = Engine.clamp((val / max) * 100, 0, 100);
  // invert: high value is bad (hunger/fatigue)
  const c = invert
    ? (pct > 75 ? "var(--bad)" : pct > 50 ? "var(--warn)" : color)
    : (pct < 25 ? "var(--bad)" : pct < 50 ? "var(--warn)" : color);
  return `<div class="vital"><div class="vl">${label}</div>
    <div class="bar"><span style="width:${pct}%;background:${c}"></span></div></div>`;
};

UI.renderVitals = function (g) {
  let html = "";
  html += UI.bar("Health", g.health, 100, "var(--good)", false);
  html += UI.bar("Hunger", g.hunger, 100, "var(--good)", true);
  html += UI.bar("Fatigue", g.fatigue, 100, "var(--good)", true);
  if (g.aug) html += UI.bar("Aug Integrity", g.aug.integrity, 100, "var(--neon)", false);
  // Injuries summary card
  const injTxt = g.injuries.length
    ? g.injuries.map((i) => `${i.part} (${["", "minor", "serious", "grave"][i.severity] || "grave"})`).join(", ")
    : "none";
  html += `<div class="vital"><div class="vl">Injuries</div><div style="font-size:12px;color:${g.injuries.length ? "var(--bad)" : "var(--muted)"};margin-top:3px">${injTxt}</div></div>`;
  UI.$("#vitals").innerHTML = html;
};

UI.repLabel = function (v) {
  if (v > 50) return ["honored", "var(--good)"];
  if (v > 15) return ["trusted", "var(--good)"];
  if (v > -15) return ["unknown", "var(--muted)"];
  if (v > -50) return ["disliked", "var(--warn)"];
  return ["marked", "var(--bad)"];
};

UI.renderLocation = function (g) {
  const d = AXIOM.DISTRICTS[g.here];
  const [rl, rc] = UI.repLabel(g.rep[g.here] || 0);
  const per = Engine.period(g);
  const danger = Engine.dangerNow(g, g.here);
  const dangerTxt = ["calm", "watchful", "tense", "dangerous", "hostile", "lethal"][Engine.clamp(danger, 0, 5)];
  let live = "";
  if (g.here === "neon_labyrinth" && g.powerOut) live = `<div style="color:var(--neon-2)" class="flicker">⚠ The grid is down. Surveillance has gaps; the clinics are open.</div>`;
  if (g.here === "god_quarter" && per.prayer) live = `<div style="color:var(--gold)">A prayer period is observed. The streets near the temple keep ceremonial silence.</div>`;
  if (g.cascades.some((c) => c.id === "raid") && g.here === "ironwall") live = `<div style="color:var(--bad)">A family is collecting debts by force tonight. Blood is close.</div>`;

  UI.$("#location").innerHTML = `
    <div class="era">${d.era}</div>
    <h2>${d.name}</h2>
    <p class="tagline">${d.tagline}</p>
    <p class="ldesc">${d.desc}</p>
    ${live}
    <div class="lmeta">
      <div><b>Controlled by:</b> ${d.control}</div>
      <div><b>Your standing here:</b> <span class="rep-badge" style="color:${rc};border:1px solid ${rc}">${rl} (${g.rep[g.here] || 0})</span></div>
      <div><b>The street feels:</b> ${dangerTxt}</div>
    </div>`;
};

UI.renderActions = function (g) {
  const c = UI.$("#actions");
  c.innerHTML = "";
  const d = g.here;
  const mk = (label, fn, title) => {
    const b = UI.el("button", null, label);
    if (title) b.title = title;
    b.onclick = () => Main.act(fn);
    return b;
  };
  const group = (title, btns) => {
    const grp = UI.el("div", "agroup");
    grp.appendChild(UI.el("div", "ah", title));
    const row = UI.el("div", "abtns");
    btns.forEach((b) => row.appendChild(b));
    grp.appendChild(row);
    c.appendChild(grp);
  };

  // Survive
  const survive = [
    mk("Eat", (g) => Actions.eat(g)),
    mk("Sleep", (g) => Actions.sleep(g)),
  ];
  if (g.injuries.length) survive.push(mk("Treat wound", (g) => Actions.treat(g)));
  if (g.aug && d === "neon_labyrinth") survive.push(mk("Service augment", (g) => Actions.tuneAug(g)));
  group("Survive", survive);

  // Earn & explore
  group("Act on the world", [
    mk("Work", (g) => Actions.work(g), "Earn coin the district's way"),
    mk("Explore", (g) => Actions.explore(g), "Seek salvage, trouble, or what the world forgot"),
    ...(d === "god_quarter" ? [mk("Read the omens", (g) => Actions.omen(g))] : []),
  ]);

  // People here
  const npcs = Engine.npcAt(g, d);
  if (npcs.length) {
    group("People here", npcs.map((n) => mk(`Speak with ${n.name.split(" ").slice(-1)[0]}`, (g) => Actions.talk(g, n.id), n.role)));
  }

  // Travel
  const routes = AXIOM.ROUTES[d].map((dest) => {
    const dd = AXIOM.DISTRICTS[dest];
    const locked = AXIOM.STATUS[g.status].rank < dd.minStatus;
    const b = mk(`→ ${dd.name}${locked ? " 🔒" : ""}`, (g) => Actions.travel(g, dest), dd.tagline);
    return b;
  });
  group("Travel (the world does not compress)", routes);
};

UI.renderDetail = function (g) {
  const c = UI.$("#detail");
  const tab = g._tab || "skills";
  c.innerHTML = "";
  const tabs = UI.el("div", null,
    `<button class="ghost mini ${tab==="skills"?"primary":""}" data-t="skills">Skills</button>
     <button class="ghost mini ${tab==="trade"?"primary":""}" data-t="trade">Market</button>
     <button class="ghost mini ${tab==="pack"?"primary":""}" data-t="pack">Pack</button>
     <button class="ghost mini ${tab==="lore"?"primary":""}" data-t="lore">Lore</button>`);
  tabs.style.marginBottom = "10px";
  tabs.querySelectorAll("button").forEach((b) => b.onclick = () => { g._tab = b.dataset.t; UI.renderDetail(g); });
  c.appendChild(tabs);

  if (tab === "skills") {
    for (const k of Object.keys(AXIOM.SKILLS)) {
      const lvl = Engine.skillLevel(g, k);
      const known = g.skills[k].known;
      const line = UI.el("div", "skill-line" + (known ? "" : " locked"));
      line.innerHTML = `<span class="sname">${AXIOM.SKILLS[k].name}</span>
        <span class="sbar"><span style="width:${lvl}%"></span></span>
        <span class="sval">${known ? lvl : "🔒"}</span>`;
      if (known) {
        const t = UI.el("button", "ghost mini", "train");
        t.onclick = () => Main.act((g) => Actions.train(g, k));
        line.appendChild(t);
      }
      line.title = AXIOM.SKILLS[k].desc;
      c.appendChild(line);
    }
  }

  if (tab === "trade") {
    const goods = AXIOM.MARKETS[g.here];
    c.appendChild(UI.el("div", "muted small", `Prices in ${AXIOM.DISTRICTS[g.here].name} move with weather, events, and you.`));
    for (const id of goods) {
      const price = Engine.price(g, id, g.here);
      const drift = g.economy[id] || 1;
      const arrow = drift > 1.1 ? "▲" : drift < 0.9 ? "▼" : "·";
      const row = UI.el("div", "row");
      row.innerHTML = `<span>${AXIOM.GOODS[id].name} <span class="tag">${AXIOM.GOODS[id].tag}</span> <span class="muted">${arrow}</span></span>
        <span><span class="price">${price}</span></span>`;
      const buy = UI.el("button", "ghost mini", "buy");
      buy.onclick = () => Main.act((g) => Actions.buy(g, id));
      const sell = UI.el("button", "ghost mini", `sell${(g.inventory[id]||0)?` (${g.inventory[id]})`:""}`);
      sell.onclick = () => Main.act((g) => Actions.sell(g, id));
      const acts = UI.el("span"); acts.append(buy, sell);
      row.appendChild(acts);
      c.appendChild(row);
    }
  }

  if (tab === "pack") {
    const items = Object.entries(g.inventory).filter(([, q]) => q > 0);
    if (!items.length) c.appendChild(UI.el("div", "muted", "Your pack is empty."));
    for (const [id, q] of items) {
      const row = UI.el("div", "row");
      row.innerHTML = `<span>${AXIOM.GOODS[id].name}</span><span class="muted">×${q}</span>`;
      c.appendChild(row);
    }
    if (g.flags.haveMap) c.appendChild(UI.el("div", "row", `<span style="color:var(--cedar)">Sub-Strata Map</span><span class="muted">priceless</span>`));
  }

  if (tab === "lore") {
    c.appendChild(UI.el("div", "muted small", `Fragments of the world beneath the world (${g.fragments.length}/${AXIOM.FRAGMENTS.length}). Assembled by you, from the ground up.`));
    for (const f of AXIOM.FRAGMENTS) {
      const got = g.fragments.includes(f.id);
      const row = UI.el("div", "row");
      row.style.alignItems = "flex-start";
      row.innerHTML = got
        ? `<span style="font-size:12px"><b style="color:var(--cedar)">${f.name}</b><br><span class="muted">${f.text}</span></span>`
        : `<span class="muted" style="font-size:12px">??? — undiscovered (somewhere in ${AXIOM.DISTRICTS[f.where].name})</span>`;
      c.appendChild(row);
    }
    if (g.flags.revealed) {
      const rev = UI.el("div", null, `<p style="color:var(--gold);font-style:italic;margin-top:10px">${AXIOM.REVELATION}</p>`);
      c.appendChild(rev);
    }
  }
};

UI.renderLog = function (g) {
  const c = UI.$("#log");
  c.innerHTML = "";
  for (const l of g.log.slice(-60).reverse()) {
    const line = UI.el("div", "logline " + (l.kind || ""));
    line.innerHTML = `<span class="ts">D${l.day} ${String(l.hour).padStart(2,"0")}:00</span>${l.text}`;
    c.appendChild(line);
  }
};

/* ---- Modal helpers ------------------------------------------------------- */
UI.modal = function (html) {
  UI.$("#modal-body").innerHTML = html;
  UI.$("#modal").hidden = false;
};
UI.closeModal = function () { UI.$("#modal").hidden = true; };

UI.gameOver = function (g) {
  UI.modal(`<h2>The City Keeps Moving</h2>
    <p>${g.name} — ${g.role} — fell on Day ${g.day}.</p>
    <p class="muted">There is no chosen one. There was never going to be a rescue. Your specific history ends here, and somewhere the markets open on schedule.</p>
    <p>Fragments recovered: ${g.fragments.length}/${AXIOM.FRAGMENTS.length}.</p>
    <button class="primary" onclick="State.wipe();location.reload()">Be inserted into the world again</button>`);
};

UI.showMenu = function () {
  const g = State.data;
  UI.modal(`<h2>AXIOM</h2>
    <p class="muted">${AXIOM.STATUS[g.status].blurb}</p>
    <p><b>${g.name}</b>, ${g.role}. Day ${g.day}, ${AXIOM.DISTRICTS[g.here].name}.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button class="primary" onclick="Main.saveNow()">Save history</button>
      <button class="ghost" onclick="UI.closeModal()">Back to the City</button>
      <button class="ghost danger" onclick="if(confirm('Abandon this life?')){State.wipe();location.reload();}">Abandon &amp; restart</button>
    </div>
    <p class="muted small" style="margin-top:14px">Your progress also autosaves after every action.</p>`);
};
