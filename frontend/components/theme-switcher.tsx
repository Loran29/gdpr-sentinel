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

  if (!mounted) return <div className="h-8 w-8" />;

  const is_dark = theme_mode === "dark";

  return (
    <button
      type="button"
      aria-label={is_dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle_theme}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border_grey bg-card_bg text-text_medium transition-colors hover:border-text_medium hover:text-text_dark focus:outline-none"
    >
      {is_dark
        ? <Sun className="h-4 w-4" />
        : <Moon className="h-4 w-4" />
      }
    </button>
  );
}


