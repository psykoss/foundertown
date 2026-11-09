import { createRoot } from "react-dom/client";
import { createGame } from "./game/createGame";
import { App } from "./ui/App";
import "./ui/styles.css";

const game = createGame(document.getElementById("game")!);
createRoot(document.getElementById("ui")!).render(<App />);

// Expose for debugging / automated tests.
(window as unknown as { __game: unknown }).__game = game;
