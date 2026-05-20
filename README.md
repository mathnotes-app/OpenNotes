# OpenNotes

A no-bloat, local-first, open-source notes app.

<p>
  <a href="https://github.com/mathnotes-app/OpenNotes/actions/workflows/ci.yml"><img src="https://github.com/mathnotes-app/OpenNotes/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="https://github.com/mathnotes-app/OpenNotes/blob/main/LICENSE"><img src="https://img.shields.io/github/license/mathnotes-app/OpenNotes" alt="license" /></a>
  <a href="https://github.com/mathnotes-app/mobile-ink"><img src="https://img.shields.io/badge/powered%20by-Mobile%20Ink-0a7cff" alt="Powered by Mobile Ink" /></a>
</p>

OpenNotes is an iOS and Android notes app for people who want fast handwriting, PDFs, folders, and simple organization without the usual bloat. It is free, open source, and privacy focused: notes are stored on-device, the app does not collect analytics, and your notebooks never leave your device unless you choose to export or share them.

The app is built on [`@mathnotes/mobile-ink`](https://github.com/mathnotes-app/mobile-ink), the open-source React Native ink engine extracted from MathNotes.

## Status

OpenNotes is early and moving quickly. The repo is public now so the app, the ink engine, and the issue tracker can be maintained in the open. App Store and Play Store submissions are planned after the first public assets and submission metadata are ready.

Screenshots and product images are coming soon.

## Features

- Apple Pencil and touch-friendly native ink powered by Mobile Ink.
- Plain, lined, grid, graph, dotted, and PDF-backed notebooks.
- Folder and note library with local thumbnails.
- PDF import from picker, share/open-in flows, and multi-page notebooks.
- Image and text objects on top of handwritten pages.
- PDF export for sharing notebooks outside the app.
- Local-first storage with no account system and no analytics.

## Development

This repo contains an Expo dev-client app with native iOS and Android projects. Expo Go is not supported because Mobile Ink includes native code.

```sh
npm ci --legacy-peer-deps
npm run typecheck
```

Run on a device or simulator:

```sh
npx expo run:ios
npx expo run:android
```

For a physical iOS device:

```sh
npx expo run:ios --device
```

## Repository Layout

- `app/` - Expo Router screens for the library, folders, and editor.
- `src/components/` - reusable library and editor UI.
- `src/services/` - local note, folder, PDF, image, and export storage.
- `ios/` and `android/` - generated native projects required by the dev-client app.

## Privacy

OpenNotes is designed to be local and private. The app does not include analytics SDKs, tracking, cloud sync, accounts, or server storage. Notes, imported PDFs, images, and thumbnails are stored on your device.

If you export, share, back up, or import files through another app or operating-system service, that service's behavior is outside OpenNotes.

## Contributing

Bug reports, feature requests, and focused pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), and please avoid attaching private notes or documents to public issues.

For ink-engine bugs or reusable canvas work, the engine repo is [`mathnotes-app/mobile-ink`](https://github.com/mathnotes-app/mobile-ink).

You can also reach Mark on X: [@markpm39](https://x.com/markpm39).

## Security

Please report security issues privately. See [SECURITY.md](SECURITY.md).

## License

Apache-2.0. Copyright BuilderPro LLC.
