import { useStore } from "../state/store";

export function Hud() {
  const gameReady = useStore((state) => state.gameReady);
  return (
    <h1 className="hud-title" data-game-ready={gameReady}>
      Founder Town
    </h1>
  );
}
