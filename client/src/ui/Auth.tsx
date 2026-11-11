/**
 * Sign-in screen: Google, or email + password (sign in, create account, reset password).
 * Same full-screen look as onboarding: the office scene on the left, the form on the right.
 */
import { useState, type FormEvent } from "react";
import { authEnabled, continueAsGuest, joining, sendPasswordReset, setNewPassword, signInWithGoogle, signInWithPassword, signUp } from "../net/session";
import { useStore } from "../state/store";
import { Logo } from "./Shell";
import { TownScene } from "./TownScene";

type Mode = "signIn" | "signUp" | "reset";

const COPY: Record<Mode | "recovery", { title: string; submit: string }> = {
  signIn: { title: "Welcome back", submit: "Sign in" },
  signUp: { title: "Create your account", submit: "Create account" },
  reset: { title: "Reset your password", submit: "Send reset link" },
  recovery: { title: "Choose a new password", submit: "Save password" },
};

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

export function AuthScreen() {
  const recovery = useStore((s) => s.session.status === "recovery");
  const avatar = useStore((s) => s.avatar);
  const [mode, setMode] = useState<Mode>(joining ? "signUp" : "signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const view = recovery ? "recovery" : mode;

  const go = (m: Mode) => {
    setMode(m);
    setError(null);
    setInfo(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    let result: string | null;
    if (view === "recovery") result = await setNewPassword(password);
    else if (view === "signIn") result = await signInWithPassword(email, password);
    else if (view === "reset") {
      result = await sendPasswordReset(email);
      if (!result) setInfo("Check your email for a link to reset your password.");
    } else {
      result = await signUp(email, password);
      if (result === "confirm") {
        result = null;
        setInfo("Almost there — confirm your email with the link we just sent, then sign in.");
        setMode("signIn");
      }
    }
    setError(result);
    setBusy(false);
  };

  const google = async () => {
    setBusy(true);
    setError(await signInWithGoogle()); // on success the page navigates away
    setBusy(false);
  };

  return (
    <div className="ob">
      <TownScene avatar={avatar} name="You" />
      <form className="ob-panel" onSubmit={(e) => void submit(e)}>
        <header className="ob-head">
          <span className="ob-logo"><Logo size={22} /></span>
          <b className="ob-brand">Founder Town</b>
        </header>
        <div className="ob-body auth">
        <h1>{authEnabled ? COPY[view].title : "Welcome to Founder Town"}</h1>
        <p className="auth-lead">A small pixel-art town for startup founders. Walk in, meet people, talk.</p>
        {!authEnabled && (
          <>
            <p className="field-info left">Accounts are not set up on this server yet (no Supabase keys), so there is nothing to sign in to. You can look around as a guest; your profile stays in this browser.</p>
            <button type="button" className="btn primary wide auth-submit" onClick={continueAsGuest}>Continue as guest</button>
          </>
        )}
        {authEnabled && (
          <>

        {view !== "recovery" && view !== "reset" && (
          <>
            <button type="button" className="btn outline wide" disabled={busy} onClick={() => void google()}>
              <GoogleMark /> Continue with Google
            </button>
            <div className="auth-or"><span>or</span></div>
          </>
        )}

        {view !== "recovery" && (
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        )}
        {view !== "reset" && (
          <label className="field">
            <span>{view === "recovery" ? "New password" : "Password"}</span>
            <input
              type="password"
              autoComplete={view === "signIn" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}

        {error && <p className="field-error" role="alert">{error}</p>}
        {info && <p className="field-info" role="status">{info}</p>}

        <button type="submit" className="btn primary wide auth-submit" disabled={busy}>{COPY[view].submit}</button>

        {view === "signIn" && (
          <p className="auth-links">
            <button type="button" className="link" onClick={() => go("reset")}>Forgot password?</button>
            <button type="button" className="link" onClick={() => go("signUp")}>Create an account</button>
          </p>
        )}
        {(view === "signUp" || view === "reset") && (
          <p className="auth-links center">
            <button type="button" className="link" onClick={() => go("signIn")}>{view === "signUp" ? "I already have an account" : "Back to sign in"}</button>
          </p>
        )}
          </>
        )}
        </div>
      </form>
    </div>
  );
}
