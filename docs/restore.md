# Restore the studio from GitHub

The repository contains the required first-party source, non-secret configuration, dependency lockfile, original assets, tests and setup instructions. Saved user projects and printed installations are separate data; keep their JSON files and measurements in your own backup.

## Set up a replacement computer

Install Git and Node.js 24 LTS, then run:

```sh
git clone https://github.com/ufodia/impossible-print.git
cd impossible-print
git switch main
git pull --ff-only origin main
git rev-parse HEAD
npm ci
npm run verify
npm run dev
```

Record the full commit SHA when you need an exact source reference. Open the local address printed by Vite, wait for the sample projection, and reopen a saved project through **Open project**.

For browser regression checks, install the matching browser with `npx playwright install --no-shell chromium`, then run `npm run test:e2e`. Browser binaries and `node_modules/` are local dependencies, not repository backups.

## Restore a production build

Run `npm run build` to regenerate `dist/`. Use `npm run preview` to inspect it locally. The generated output is ignored by Git; rebuild it from the checked source and lockfile rather than copying a stale build. See [deployment](deployment.md) for the static Vercel configuration.

## Update an existing checkout

Inspect `git status` and preserve local changes before updating. With a clean checkout on `main`, use `git pull --ff-only origin main`, reinstall with `npm ci`, and repeat the checks. Review dependency changes together with [third-party notices](../THIRD_PARTY_NOTICES.md).

The source repository cannot restore unsaved browser state, printer configuration or physical alignment. Recheck the 100 mm calibration ruler and real corner when reproducing an installation on new hardware.
