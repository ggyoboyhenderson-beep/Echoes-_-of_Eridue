/* ==========================================================================
 * AXIOM — Bootstrap & control flow (3D front-end)
 * ========================================================================== */

const Main = {};

Main.showScreen = function (which) {
  document.getElementById("screen-title").hidden = which !== "title";
  document.getElementById("screen-game").hidden = which !== "game";
};

Main.init = function () {
  UI.renderTitle();
  Main.showScreen("title");
  document.getElementById("modal-close").onclick = () => UI.closeModal();
  document.getElementById("modal").addEventListener("click", (e) => { if (e.target.id === "modal") UI.closeModal(); });
  // The 3D module attaches window.World3D and initialises its renderer.
  if (window.World3D) window.World3D.init();
};

Main.begin = function (protoId) {
  State.newGame(protoId);
  State.save();
  Main.showScreen("game");
  window.World3D.start();
};

Main.continueGame = function () {
  if (!State.load()) { alert("No saved history found."); return; }
  Main.showScreen("game");
  window.World3D.start();
};

window.addEventListener("DOMContentLoaded", Main.init);
