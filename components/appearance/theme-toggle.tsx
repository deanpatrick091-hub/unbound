"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "unbound:theme";
function subscribe(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === KEY && (event.newValue === "light" || event.newValue === "dark")) {
      document.documentElement.dataset.theme = event.newValue; listener();
    }
  };
  window.addEventListener("storage", storage);
  window.addEventListener("unbound-theme", listener);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener("unbound-theme", listener);
  };
}
function snapshot() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => "dark");
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* Still works for this visit. */ }
    window.dispatchEvent(new Event("unbound-theme"));
  }
  return (
    <button type="button" onClick={toggle} className="glass-icon"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}>
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
