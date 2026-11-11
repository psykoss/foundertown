/**
 * The founder questions: who you are, what you are building, what you want from the town and how
 * you found it. Full screen, in the game's own look: your character stands in the office on the left
 * (name tag and picked answers update live), the questions are on the right with pixel icons.
 * Shown before the first session, and again from the profile card to edit the answers.
 * The questions themselves are data in `@ft/shared` (founder.ts).
 */
import { useState } from "react";
import { X } from "lucide-react";
import { BUILDING_MAX, EMPTY_FOUNDER, GOALS, HEARD, NAME_MAX, STAGES, type FounderProfile, type Option } from "@ft/shared";
import { saveFounder } from "../net/session";
import { persistProfile, store, useStore } from "../state/store";
import { PixelIcon } from "./PixelIcon";
import { Logo } from "./Shell";
import { TownScene } from "./TownScene";

const TITLES = ["Welcome to Founder Town", "What brings you here?", "One last thing"];
const STEPS = TITLES.length;

/** Option tiles. `stacked` puts the icon above the text (3-column grids); otherwise it sits to the left. */
function Choices({ options, picked, onPick, stacked = false }: { options: Option[]; picked: (id: string) => boolean; onPick: (id: string) => void; stacked?: boolean }) {
  return (
    <div className={"choices" + (stacked ? " stacked" : "")}>
      {options.map((o) => (
        <button key={o.id} type="button" className={"choice" + (picked(o.id) ? " on" : "")} aria-pressed={picked(o.id)} onClick={() => onPick(o.id)}>
          <PixelIcon id={o.id} />
          <span>
            <b>{o.label}</b>
            {o.hint && <small>{o.hint}</small>}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Onboarding({ edit = false }: { edit?: boolean }) {
  const initial = store.get();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(edit || initial.playerName !== "You" ? initial.playerName : "");
  const [f, setF] = useState<FounderProfile>(initial.founder ?? EMPTY_FOUNDER);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatar = useStore((s) => s.avatar);

  const close = () => store.set({ modal: null });
  const investor = f.stage === "investor";
  const canNext = [name.trim().length > 0 && !!f.stage, f.goals.length > 0, true][step]!;
  const last = step === STEPS - 1;

  const next = async () => {
    if (!canNext || busy) return;
    if (!last) return setStep(step + 1);
    setBusy(true);
    const failed = await saveFounder(name, { ...f, building: f.building.trim() });
    setBusy(false);
    if (failed) return setError(failed);
    const s = store.get();
    persistProfile({ name: s.playerName, timeZone: s.timeZone, picture: s.picture });
    if (edit) close();
  };

  const toggleGoal = (id: string) => setF({ ...f, goals: f.goals.includes(id) ? f.goals.filter((g) => g !== id) : [...f.goals, id] });

  return (
    <div className="ob">
      <TownScene avatar={avatar} name={name.trim() || "You"}>
        {/* what you picked so far, floating over your character */}
        {(f.stage || f.goals.length > 0) && (
          <span className="scene-picks">
            {f.stage && <PixelIcon id={f.stage} size={24} />}
            {f.goals.map((g) => <PixelIcon key={g} id={g} size={24} />)}
          </span>
        )}
      </TownScene>

      <form className="ob-panel" aria-label="About you" onSubmit={(e) => (e.preventDefault(), void next())}>
        <header className="ob-head">
          <span className="ob-logo"><Logo size={22} /></span>
          <span className="steps" aria-label={`Step ${step + 1} of ${STEPS}`}>{TITLES.map((_, i) => <i key={i} className={i <= step ? "on" : ""} />)}</span>
          {edit && <button type="button" className="icon-btn plain" aria-label="Close" onClick={close}><X size={20} /></button>}
        </header>

        <div className="ob-body">
          <h1>{edit && step === 0 ? "Your founder profile" : TITLES[step]}</h1>
          {step === 0 && (
            <>
              <label className="field">
                <span>Your name<b>*</b></span>
                <input value={name} maxLength={NAME_MAX} autoFocus={window.innerWidth > 860} placeholder="How people will see you in town" onChange={(e) => setName(e.target.value)} />
              </label>
              <div className="field">
                <span>Where are you in the startup world?<b>*</b></span>
                <Choices stacked options={STAGES} picked={(id) => f.stage === id} onPick={(stage) => setF({ ...f, stage })} />
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <div className="field">
                <span>What do you want out of Founder Town?<b>*</b> <em>Pick any</em></span>
                <Choices options={GOALS} picked={(id) => f.goals.includes(id)} onPick={toggleGoal} />
              </div>
              <label className="field">
                <span>{investor ? "What do you invest in?" : "What are you working on?"} <em>Optional — shown on your card</em></span>
                <input
                  value={f.building}
                  maxLength={BUILDING_MAX}
                  placeholder={investor ? "Pre-seed B2B SaaS, climate…" : "One line about your startup or idea"}
                  onChange={(e) => setF({ ...f, building: e.target.value })}
                />
              </label>
            </>
          )}
          {step === 2 && (
            <div className="field">
              <span>How did you hear about Founder Town? <em>Optional</em></span>
              <Choices options={HEARD} picked={(id) => f.heard === id} onPick={(heard) => setF({ ...f, heard: f.heard === heard ? "" : heard })} />
            </div>
          )}
          {error && <p className="field-error" role="alert">{error}</p>}
        </div>

        <footer className="ob-foot">
          {step > 0 && <button type="button" className="btn outline" onClick={() => setStep(step - 1)}>Back</button>}
          <button type="submit" className="btn primary" disabled={!canNext || busy}>{!last ? "Continue" : edit ? "Save" : "Enter Founder Town"}</button>
        </footer>
      </form>
    </div>
  );
}
