import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createGame } from "./game/config";
import { Hud } from "./ui/Hud";
import "./state/store";
import "./styles.css";

const uiRoot = document.getElementById("ui");
if (!uiRoot) throw new Error("Missing #ui element");

createRoot(uiRoot).render(
  <StrictMode>
    <Hud />
  </StrictMode>,
);

const game = createGame("game");

if (import.meta.env.DEV) {
  // Lets browser-driven checks read game state.
  (window as unknown as { __game: typeof game }).__game = game;
}
