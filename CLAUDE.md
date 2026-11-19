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
- `src/lib/gl/shaders.ts` and `engine.ts` are the GPU pipeline (WebGL2): denoise, temporal
  denoise, FSR EASU, RCAS, FXAA, colour/HDR look/LUT, and the motion estimation and
  interpolation of frame generation. Texture row 0 is the top of the picture in every pass;
  only the present pass flips. Every sampler uniform must be bound to a texture of its own type.
- `src/lib/pacer.ts` schedules real and generated frames (pure, tested); `src/app/useRenderer.ts`
  runs the frame callback and the draw loop; `src/lib/recording.ts` and `electron/recording.cjs`
  record (tested with fakes).
- `electron/main.cjs` is the frameless window, permissions (only the app's own page, see
  `electron/own-url.cjs`), fullscreen, screenshots, recording files and the updater
  (`electron/updater.cjs`).

## Trying the GPU pipeline here

The app runs under Xvfb with Chromium's fake camera and software WebGL:
`xvfb-run -a npx electron . --no-sandbox --use-fake-device-for-media-stream --use-gl=angle
--use-angle=swiftshader --enable-unsafe-swiftshader --remote-debugging-port=9340`; the
GL errors of a broken pass show up in Electron's stderr.

## Releases

Raise `version` in `package.json`, add `docs/releases/v<version>.md`, then run the Release
workflow (or push the tag `v<version>`). The workflow uploads `latest.yml`, which the built-in
updater reads.
