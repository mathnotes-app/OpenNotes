# Contributing

Thanks for helping improve OpenNotes. The goal of this project is a simple, local-first, open-source notes app with a strong mobile ink foundation.

Small, focused contributions are welcome: bug reports, reproducible crashes, device-specific PDF import/export issues, documentation fixes, UI polish, and careful fixes to local storage or native integration all help.

## Development Setup

```sh
npm ci --legacy-peer-deps
npm run typecheck
```

Run the app with an Expo dev client:

```sh
npx expo run:ios
npx expo run:android
```

Expo Go is not supported because the app depends on native code from `@mathnotes/mobile-ink`.

## Pull Request Expectations

- Keep changes focused and easy to review.
- Run `npm run typecheck` before opening a PR.
- Rebuild and manually test on a real device when touching native code, PDF import/export, file handling, or Mobile Ink integration.
- Do not include private notes, imported PDFs, screenshots with personal information, credentials, signing files, generated build outputs, or local caches.
- Preserve the local-first privacy model. Do not add analytics, tracking, account systems, sync services, or network calls without a clear public discussion first.

## App And Engine Boundaries

Use this repo for the OpenNotes app: library UX, note storage, PDF import/export behavior, app chrome, and platform submission work.

Use [`mathnotes-app/mobile-ink`](https://github.com/mathnotes-app/mobile-ink) for reusable ink-engine bugs, canvas primitives, native rendering, selection behavior, stroke serialization, and engine-level PDF/page handling.

If a bug crosses both repos, open the app issue here and link the Mobile Ink issue or PR.
