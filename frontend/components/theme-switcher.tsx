"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type ThemeMode = "light" | "dark";

const THEME_KEY = "gdpr_sentinel_theme";

export function ThemeSwitcher() {
  const [theme_mode, set_theme_mode] = useState<ThemeMode>("light");
  const [mounted, set_mounted] = useState(false);

  useEffect(() => {
    const saved_mode = window.localStorage.getItem(THEME_KEY);
    const initial_mode: ThemeMode = saved_mode === "dark" ? "dark" : "light";
    set_theme_mode(initial_mode);
    document.documentElement.classList.toggle("dark", initial_mode === "dark");
    set_mounted(true);
  }, []);

  const toggle_theme = () => {
    const next = theme_mode === "light" ? "dark" : "light";
    set_theme_mode(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    window.localStorage.setItem(THEME_KEY, next);
  };

  if (!mounted) return <div className="h-8 w-16 rounded-full" />;

  const is_dark = theme_mode === "dark";

  return (
    <button
      type="button"
      aria-label={is_dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle_theme}
      className={`
        relative inline-flex h-8 w-16 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors duration-200 focus:outline-none
        ${is_dark
          ? "border-slate-600 bg-slate-700"
          : "border-slate-200 bg-slate-100"
        }
      `}
    >
      {/* Track icons */}
      <Sun
        className={`absolute left-1.5 h-3.5 w-3.5 transition-opacity duration-200 ${is_dark ? "opacity-30 text-slate-400" : "opacity-100 text-amber-500"}`}
      />
      <Moon
        className={`absolute right-1.5 h-3.5 w-3.5 transition-opacity duration-200 ${is_dark ? "opacity-100 text-blue-300" : "opacity-30 text-slate-400"}`}
      />
      {/* Thumb */}
      <span
        className={`
          inline-block h-5 w-5 rounded-full shadow-sm transition-transform duration-200
          ${is_dark
            ? "translate-x-8 bg-slate-200"
            : "translate-x-0.5 bg-white"
          }
        `}
      />
    </button>
  );
}

