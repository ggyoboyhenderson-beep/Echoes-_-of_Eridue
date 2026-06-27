/* ==========================================================================
 * AXIOM — Bootstrap & control flow
 * ========================================================================== */

const Main = {};

Main.showScreen = function (which) {
  UI.$("#screen-title").hidden = which !== "title";
  UI.$("#screen-game").hidden = which !== "game";
};

Main.init = function () {
  UI.renderTitle();
  Main.showScreen("title");

  UI.$("#modal-close").onclick = () => UI.closeModal();
  UI.$("#btn-menu").onclick = () => UI.showMenu();
  UI.$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") UI.closeModal(); });
};

Main.begin = function (protoId) {
  State.newGame(protoId);
  State.save();
  Main.showScreen("game");
  UI.render();
};

Main.continueGame = function () {
  if (!State.load()) { alert("No saved history found."); return; }
  Main.showScreen("game");
  UI.render();
};

/* Run a player action, then re-render and autosave. */
Main.act = function (fn) {
  const g = State.data;
  if (g.over) return;
  const res = fn(g);
  if (res && res.msg && res.kind === "warn") {
    // surface immediate warnings that didn't already enter the log
    const last = g.log[g.log.length - 1];
    if (!last || last.text !== res.msg) Engine.push(g, res.msg, "warn");
  }
  Engine.checkRevelation(g);
  State.save();
  UI.render();
  if (res && res.revealed) {
    UI.modal(`<h2>Recognition</h2><p style="font-style:italic">${AXIOM.REVELATION}</p>
      <p class="muted small">The narrative goal was never catharsis. It was understanding something true about power, time, and what it costs to be a person inside history.</p>`);
  }
};

Main.saveNow = function () {
  const ok = State.save();
  UI.$("#modal-body").innerHTML = `<h2>Saved</h2><p>${ok ? "Your history is kept." : "Could not save (storage unavailable)."}</p>
    <button class="primary" onclick="UI.closeModal()">Back to the City</button>`;
};

window.addEventListener("DOMContentLoaded", Main.init);
