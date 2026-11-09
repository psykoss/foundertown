/** Edit Profile dialog: picture, avatar, name and time zone. Saved to the store + localStorage. */
import { useMemo, useRef, useState } from "react";
import { ChevronDown, Pencil, X } from "lucide-react";
import { persistProfile, store, useStore } from "../state/store";
import { AvatarSprite, CROP } from "./AvatarSprite";

const PICTURE_PX = 160;

/** Read an image file, center-crop it to a square and return a small JPEG data URL. */
function readPicture(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const c = document.createElement("canvas");
      c.width = c.height = PICTURE_PX;
      c.getContext("2d")!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, PICTURE_PX, PICTURE_PX);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image"));
    };
    img.src = url;
  });
}

function zoneLabel(tz: string): string {
  try {
    const part = new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName");
    const off = (part?.value ?? "GMT").replace("GMT", "UTC");
    return `(${off === "UTC" ? "UTC+00:00" : off}) ${tz}`;
  } catch {
    return tz;
  }
}

export function EditProfile() {
  const avatar = useStore((s) => s.avatar);
  const [name, setName] = useState(store.get().playerName);
  const [timeZone, setTimeZone] = useState(store.get().timeZone);
  const [picture, setPicture] = useState(store.get().picture);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const zones = useMemo(() => {
    const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
    const all = intl.supportedValuesOf?.("timeZone") ?? [];
    return all.includes(timeZone) ? all : [timeZone, ...all];
  }, [timeZone]);

  const close = () => store.set({ modal: null });
  const valid = name.trim().length > 0;
  const save = () => {
    if (!valid) return;
    const profile = { name: name.trim(), timeZone, picture };
    store.set({ playerName: profile.name, timeZone, picture, modal: null });
    persistProfile(profile);
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      setPicture(await readPicture(f));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form className="dialog edit-profile" role="dialog" aria-label="Edit Profile" onSubmit={(e) => (e.preventDefault(), save())}>
        <header className="dialog-head">
          <h2>Edit Profile</h2>
          <button type="button" className="icon-btn plain" aria-label="Close" onClick={close}><X size={20} /></button>
        </header>

        <div className="dialog-body">
          <div className="profile-pair">
            <div className="profile-slot">
              <span>Profile picture</span>
              <div className="circle picture">
                {picture ? <img src={picture} alt="" /> : (name.trim()[0] ?? "?").toUpperCase()}
                <button type="button" className="circle-edit" aria-label="Change profile picture" onClick={() => file.current?.click()}><Pencil size={16} /></button>
              </div>
              <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
            </div>
            <div className="profile-slot">
              <span>Avatar</span>
              <div className="circle">
                <AvatarSprite avatar={avatar} crop={CROP.bust} scale={2} />
                <button type="button" className="circle-edit" aria-label="Edit avatar" onClick={() => store.set({ modal: "editAvatar", avatarReturn: "editProfile" })}>
                  <Pencil size={16} />
                </button>
              </div>
            </div>
          </div>
          {error && <p className="field-error">{error}</p>}

          <label className="field">
            <span>Full name<b>*</b></span>
            <input value={name} maxLength={24} required onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Time zone</span>
            <div className="select">
              <select value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
                {zones.map((z) => <option key={z} value={z}>{zoneLabel(z)}</option>)}
              </select>
              <ChevronDown size={18} />
            </div>
          </label>
        </div>

        <footer className="dialog-foot">
          <button type="submit" className="btn primary" disabled={!valid}>Save</button>
        </footer>
      </form>
    </div>
  );
}
