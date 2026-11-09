import { create } from "zustand";
import { bridge } from "../bridge/events";

interface AppState {
  gameReady: boolean;
}

export const useStore = create<AppState>(() => ({
  gameReady: false,
}));

bridge.on("game:ready", () => {
  useStore.setState({ gameReady: true });
});
