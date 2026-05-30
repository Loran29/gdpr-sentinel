"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type ThemeMode = "light" | "dark";

const THEME_KEY = "gdpr_sentinel_theme";

export function ThemeSwitcher() {
  const [theme_mode, set_theme_mode] = useState<ThemeMode>("light");

  useEffect(() => {
    const saved_mode = window.localStorage.getItem(THEME_KEY);
    const initial_mode: ThemeMode = saved_mode === "dark" ? "dark" : "light";
    set_theme_mode(initial_mode);
    document.documentElement.classList.toggle("dark", initial_mode === "dark");
  }, []);

  const set_theme = (mode: ThemeMode) => {
    set_theme_mode(mode);
    document.documentElement.classList.toggle("dark", mode === "dark");
    window.localStorage.setItem(THEME_KEY, mode);
  };

  const toggle_theme = () => {
    set_theme(theme_mode === "light" ? "dark" : "light");
  };

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={theme_mode === "dark" ? "Dark mode" : "Light mode"}
        onClick={toggle_theme}
        className="h-8 w-8 p-0"
      >
        {theme_mode === "dark" ? (
          <Moon size={26} strokeWidth={2.8} absoluteStrokeWidth />
        ) : (
          <Sun size={26} strokeWidth={2.8} absoluteStrokeWidth />
        )}
      </Button>
    </div>
  );
}
