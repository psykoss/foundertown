import { createRoot } from "react-dom/client";
import { createGame } from "./game/createGame";
import { joinLobby, lobbyFromUrl } from "./net/room";
import { initSession } from "./net/session";
import { startVoice } from "./net/voice";
import { startRouter } from "./router";
import { startReminders } from "./state/calendar";
import { store } from "./state/store";
import { App } from "./ui/App";
import "./ui/styles.css";

createRoot(document.getElementById("ui")!).render(<App />);

// The world starts once there is someone to put in it: signed in and onboarded.
const invitedTo = lobbyFromUrl(); // read before sign-in redirects can touch the URL
let started = false;
function start() {
  if (started || store.get().session.status !== "ready") return;
  started = true;
  const game = createGame(document.getElementById("game")!);
  startVoice();
  startReminders();
  void joinLobby(invitedTo);
  // Expose for debugging / automated tests.
  (window as unknown as { __game: unknown }).__game = game;
}
store.subscribe(start);
startRouter();
initSession();
start();
