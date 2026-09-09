import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const hero = readFileSync(new URL("../components/hero-section.tsx", import.meta.url), "utf8");
const navbar = readFileSync(new URL("../components/navbar.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("homepage makes room and roommate discovery direct primary paths", () => {
  assert.match(hero, /href="\/rooms"/);
  assert.match(hero, /href="\/flatmates"/);
  assert.match(hero, />\s*Find a Room\s*</);
  assert.match(hero, />\s*Find a Roommate\s*</);
  assert.match(hero, /Browse real rooms, shared flats, and PGs/);
  assert.match(hero, /Meet compatible people using shared preferences/);
  assert.doesNotMatch(hero, /<form|name="budget"|name="locality"/);
});
test("primary navbar labels route to the existing discovery pages", () => {
  assert.match(navbar, /const primaryNavigation = \[/);
  assert.match(navbar, /\{ label: "Find a Room", href: "\/rooms"/);
  assert.match(navbar, /\{ label: "Find a Roommate", href: "\/flatmates"/);
  assert.ok(existsSync(new URL("../app/rooms/page.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../app/flatmates/page.tsx", import.meta.url)));
});

test("existing app destinations remain accessible from responsive navigation", () => {
  for (const href of [
    "/community",
    "/shortlist",
    "/chat",
    "/visits",
    "/activity",
    "/documents",
    "/household",
    "/progress",
    "/reminders",
    "/saved",
    "/teams",
    "/recently-viewed",
    "/support",
    "/profile",
  ]) {
    assert.match(navbar, new RegExp('href: "' + href + '"'));
  }
  assert.match(navbar, /max-h-\[calc\(100dvh-4\.5rem\)\] overflow-y-auto/);
  assert.match(navbar, /xl:hidden/);
  assert.match(navbar, /hidden items-center gap-1 xl:flex/);
});

test("how-it-works anchor and lightweight steps are present", () => {
  assert.match(hero, /id="how-it-works"/);
  assert.match(hero, /Choose your path/);
  assert.match(hero, /Compare with context/);
  assert.match(hero, /Connect confidently/);
  assert.match(navbar, /href: "\/#how-it-works"/);
  assert.match(home, /<HeroSection \/>/);
});
