"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const themeStorageKey = "roomzi-theme";
const themeChangeEvent = "roomzi:theme-change";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function subscribeToTheme(onStoreChange: () => void) {
  window.addEventListener(themeChangeEvent, onStoreChange);
  window.addEventListener("storage", onStoreChange);

  return () => {
    window.removeEventListener(themeChangeEvent, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function setTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem(themeStorageKey, theme);
  window.dispatchEvent(new Event(themeChangeEvent));
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    currentTheme,
    () => "light" as const,
  );
  const nextTheme = theme === "dark" ? "light" : "dark";
  const label = `Switch to ${nextTheme} mode`;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("border border-border/80 bg-card shadow-sm", className)}
      aria-label={label}
      title={label}
      onClick={() => setTheme(nextTheme)}
    >
      {theme === "dark" ? (
        <Sun aria-hidden="true" className="size-4.5" />
      ) : (
        <Moon aria-hidden="true" className="size-4.5" />
      )}
    </Button>
  );
}
