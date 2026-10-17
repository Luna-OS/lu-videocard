# Lu Videocard – instructions for agents

## Language: English only

Everything in this repository and in the app is written in **English**, also when a request is
written in German: translate the intent and write the result in English (UI text, code,
comments, docs, commit messages, PR titles and descriptions).

## Checks before a pull request

All of these must pass before you open or update a pull request:

```sh
npm run build
npm run lint
npm test
npx prettier --check .
```

## How it fits together

- `src/lib/devices.ts` finds the capture card and its sound (with tests) and holds the
  getUserMedia constraints. Keep the sound constraints free of voice processing
  (echoCancellation, noiseSuppression, autoGainControl stay `false`).
- `src/lib/capture.ts` starts and restarts the streams; every async step checks its generation
  so an older start never wins over a newer one.
- `electron/main.cjs` is the frameless window, permissions (only the app's own page, see
  `electron/own-url.cjs`), fullscreen, screenshots and the updater (`electron/updater.cjs`).

## Releases

Raise `version` in `package.json`, add `docs/releases/v<version>.md`, then run the Release
workflow (or push the tag `v<version>`). The workflow uploads `latest.yml`, which the built-in
updater reads.
