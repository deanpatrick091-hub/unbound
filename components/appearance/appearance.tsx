"use client";

import { createContext, useContext, useId, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { Check, ImagePlus, Loader2, SlidersHorizontal, Trash2, X } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

type Preset = "aurora" | "midnight" | "silver" | "custom";
type Appearance = { preset: Preset; image?: string; dim: number };
const DEFAULT: Appearance = { preset: "aurora", dim: 35 };
const EMPTY = JSON.stringify(DEFAULT);
const Context = createContext<{ value: Appearance; save: (value: Appearance) => void } | null>(null);
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("unbound-appearance", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("unbound-appearance", listener);
  };
}
export function AppearanceProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const key = "unbound:appearance:" + userId;
  const raw = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(key) ?? EMPTY; } catch { return EMPTY; }
  }, () => EMPTY);
  const value = useMemo<Appearance>(() => {
    try {
      const parsed = JSON.parse(raw);
      const preset = ["aurora", "midnight", "silver", "custom"].includes(parsed.preset) ? parsed.preset : "aurora";
      const image = typeof parsed.image === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(parsed.image) ? parsed.image : undefined;
      return { preset, image, dim: Number.isFinite(parsed.dim) ? Math.max(0, Math.min(85, parsed.dim)) : 35 };
    } catch { return DEFAULT; }
  }, [raw]);
  function save(next: Appearance) {
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new Event("unbound-appearance"));
  }
  return <Context.Provider value={{ value, save }}>{children}</Context.Provider>;
}
function useAppearance() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("AppearanceProvider is required.");
  return ctx;
}
export function WallpaperLayer() {
  const { value } = useAppearance();
  return <div aria-hidden="true" className={"workspace-wallpaper wallpaper-" + value.preset}>
    {value.preset === "custom" && value.image ? (
      // User-selected, locally decoded raster; no remote request is made.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={value.image} alt="" className="absolute inset-0 size-full object-cover" />
    ) : null}
    <div className="wallpaper-shade" style={{ opacity: value.dim / 100 }} />
  </div>;
}
async function prepareImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG or WebP image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Choose an image smaller than 8 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 60_000_000) throw new Error("This image is too large. Try a smaller version.");
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser could not open this image.");
    ctx.fillStyle = "#101726";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.8);
    if (data.length > 2_000_000) throw new Error("This image needs a smaller version. Try a less detailed image.");
    return data;
  } finally { bitmap.close(); }
}
export function AppearanceControls() {
  const { value, save } = useAppearance();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();
  function update(next: Appearance) {
    try { save(next); setError(""); }
    catch { setError("Your browser could not save this wallpaper. Free some browser storage and try again."); }
  }
  return <div className="space-y-6">
    <div className="flex items-center justify-between"><span className="text-sm">Light / dark mode</span><ThemeToggle /></div>
    <div>
      <p className="mb-3 text-sm font-medium">Chat wallpaper</p>
      <div className="grid grid-cols-3 gap-3">
        {(["aurora", "midnight", "silver"] as const).map(preset => <button key={preset} type="button"
          aria-pressed={value.preset === preset} onClick={() => update({ ...value, preset })}
          className="group text-left">
          <span className={"relative mb-2 block h-20 rounded-2xl border border-border-strong wallpaper-" + preset}>
            {value.preset === preset && <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check size={14} /></span>}
          </span><span className="text-sm capitalize">{preset}</span>
        </button>)}
      </div>
    </div>
    <label htmlFor={id + "-file"} className="glass-upload flex cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong px-4 py-5 text-sm hover:bg-raised">
      {busy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
      {busy ? "Preparing your wallpaper…" : "Upload your own wallpaper"}
    </label>
    <input id={id + "-file"} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy}
      onChange={async event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setBusy(true); setError("");
        try { const image = await prepareImage(file); update({ ...value, preset: "custom", image }); }
        catch (e) { setError(e instanceof Error ? e.message : "Could not open that image."); }
        finally { setBusy(false); }
      }} />
    {value.image && <div className="flex flex-wrap gap-3 text-sm">
      <button type="button" className="text-brand underline underline-offset-4" onClick={() => update({ ...value, preset: "custom" })}>Use my wallpaper</button>
      <button type="button" className="flex items-center gap-2 text-muted-foreground" onClick={() => update({ preset: "aurora", dim: value.dim })}><Trash2 size={15} />Remove upload</button>
    </div>}
    <div>
      <label htmlFor={id + "-dim"} className="flex justify-between text-sm">Background softness<span>{value.dim}%</span></label>
      <input id={id + "-dim"} type="range" min="0" max="85" step="5" value={value.dim}
        onChange={event => update({ ...value, dim: Number(event.target.value) })} className="mt-3 w-full accent-[var(--brand)]" />
    </div>
    <p className="text-xs leading-relaxed text-muted-foreground">JPG, PNG or WebP, up to 8 MB. Your wallpaper stays in this browser, separately for your account.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
export function AppearanceButton() {
  return <Dialog.Root>
    <Dialog.Trigger asChild><button type="button" className="glass-icon" title="Appearance" aria-label="Customize appearance"><SlidersHorizontal size={18} /></button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm" />
      <Dialog.Content className="glass-dialog fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[28px] p-7 outline-none">
        <div className="mb-2 flex items-center justify-between"><Dialog.Title className="text-xl font-semibold">Make it yours.</Dialog.Title><Dialog.Close asChild><button className="glass-icon" aria-label="Close appearance"><X size={18} /></button></Dialog.Close></div>
        <Dialog.Description className="mb-6 text-sm text-muted-foreground">A space that feels like you.</Dialog.Description>
        <AppearanceControls />
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
