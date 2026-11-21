# Release notes

One file per version, named after it: `1.2.0.md`, `1.3.0-beta.1.md`. Write it before you push the tag; `release.yml`
stops if it's missing (D-146). The website lists them newest first at `/releases/`, each at `/releases/#<version>`,
and the dashboard's "What's new" links there.

```markdown
---
date: 2026-11-18
title: hlabs on Linux, and a proper Mac installer
---

## New

- Install on a Linux server with one command.

## Improved

- …

## Fixed

- …

## Before you update

Every app restarts once during the update.
```

`title` is optional ("hlabs <version>" without one). Use only those four sections, in that order, and leave out the ones a release doesn't have (`pnpm site:check` checks).
Write for the people who use hlabs: what they can do now, not how it was built.
