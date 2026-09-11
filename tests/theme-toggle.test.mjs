import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const navbar = readFileSync(new URL("../components/navbar.tsx", import.meta.url), "utf8");
const toggle = readFileSync(new URL("../components/theme-toggle.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("saved theme is applied before the application renders", () => {
  assert.match(layout, /localStorage\.getItem\("roomzi-theme"\)/);
  assert.match(layout, /prefers-color-scheme: dark/);
  assert.match(layout, /suppressHydrationWarning/);
});

test("navbar exposes an accessible persistent theme toggle", () => {
  assert.match(navbar, /<ThemeToggle \/>/);
  assert.match(toggle, /Switch to \$\{nextTheme\} mode/);
  assert.match(toggle, /localStorage\.setItem\(themeStorageKey, theme\)/);
  assert.match(toggle, /classList\.toggle\("dark"/);
  assert.match(toggle, /<Moon/);
  assert.match(toggle, /<Sun/);
});

test("light and dark design tokens remain available", () => {
  assert.match(styles, /:root\s*\{/);
  assert.match(styles, /\.dark\s*\{/);
  assert.match(styles, /@custom-variant dark/);
});
