import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const hero = readFileSync(new URL("../components/hero-section.tsx", import.meta.url), "utf8");
const navbar = readFileSync(new URL("../components/navbar.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const pgs = readFileSync(new URL("../app/pgs/page.tsx", import.meta.url), "utf8");

test("homepage offers four direct role-based primary paths", () => {
  for (const [title, href, role] of [
    ["Find a Room", "/rooms", "I need a place"],
    ["Find a Roommate", "/flatmates", "I need the right person"],
    ["List a Property", "/list-property", "I have a place"],
    ["Post a Requirement", "/post-requirement", "I have a specific need"],
  ]) {
    assert.match(hero, new RegExp('title: "' + title + '"'));
    assert.match(hero, new RegExp('href: "' + href + '"'));
    assert.match(hero, new RegExp('role: "' + role + '"'));
  }
  assert.match(hero, /roleActions\.map/);
  assert.match(hero, /sm:grid-cols-2/);
  assert.match(hero, /xl:grid-cols-4/);
  assert.doesNotMatch(hero, /<form|name="budget"|name="locality"/);
});

test("locality communities remain a visible secondary path", () => {
  assert.match(hero, /Already know your locality\?/);
  assert.match(hero, /href="\/community"/);
  assert.match(hero, /Explore communities/);
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

test("the PG navigation route reuses filtered room discovery", () => {
  assert.match(navbar, /\{ label: "PGs", href: "\/pgs"/);
  assert.match(pgs, /redirect\("\/rooms\?kind=PG_AVAILABLE"\)/);
});

test("how-it-works anchor and lightweight steps are present", () => {
  assert.match(hero, /id="how-it-works"/);
  assert.match(hero, /Choose what you need/);
  assert.match(hero, /Review useful context/);
  assert.match(hero, /Connect and move forward/);
  assert.match(navbar, /href: "\/#how-it-works"/);
  assert.match(home, /<HeroSection \/>/);
});
