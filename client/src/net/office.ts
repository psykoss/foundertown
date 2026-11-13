/**
 * Where the owner's office layout is kept: their `offices` row in Supabase (migration 0002), or
 * localStorage in guest mode. Reading goes through the room (the server loads the layout for
 * everyone in the lobby); this module only writes, one request at a time, latest layout wins.
 */
import type { OfficeLayout } from "@ft/shared";
import { store } from "../state/store";
import { supabase } from "./session";

const GUEST_KEY = "ft.office.v1";
/** Edits come in bursts (drag, undo, undo…): wait for a pause before writing. */
const SAVE_MS = 500;

let latest: OfficeLayout | null = null;
let writing = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Guest mode: the layout this browser saved for its own lobby (handed to the room on join). */
export function guestOffice(): OfficeLayout | undefined {
  if (supabase) return undefined;
  try {
    return (JSON.parse(localStorage.getItem(GUEST_KEY) ?? "null") as OfficeLayout | null) ?? undefined;
  } catch {
    return undefined;
  }
}

async function write(layout: OfficeLayout): Promise<boolean> {
  if (!supabase) {
    try {
      localStorage.setItem(GUEST_KEY, JSON.stringify(layout));
      return true;
    } catch {
      return false;
    }
  }
  const owner = store.get().session.userId;
  if (!owner) return false;
  const { error } = await supabase.from("offices").upsert({ owner, layout, updated_at: new Date().toISOString() });
  return !error;
}

async function flush() {
  if (writing || !latest) return;
  writing = true;
  const layout = latest;
  latest = null;
  const ok = await write(layout);
  writing = false;
  if (latest) return void flush(); // changed again meanwhile: only the newest counts
  store.set(ok ? { officeSave: "saved" } : { officeSave: "error", notice: "Could not save your office — check your connection." });
}

/** Store the owner's layout (debounced). `store.officeSave` follows it: saving → saved / error. */
export function saveOffice(layout: OfficeLayout) {
  latest = layout;
  store.set({ officeSave: "saving" });
  clearTimeout(timer);
  timer = setTimeout(() => void flush(), SAVE_MS);
}
