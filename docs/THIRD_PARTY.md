# Third-party algorithms

Lu Videocard's GPU pipeline (`src/lib/gl/shaders.ts`) is written for this app, following these
published algorithms:

## AMD FidelityFX Super Resolution 1.0 (EASU and RCAS)

The upscaling (`EASU`) and sharpening (`RCAS`) shaders follow AMD's FidelityFX Super Resolution
1.0, which is released under the MIT license:

```
Copyright (c) 2021 Advanced Micro Devices, Inc. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## FXAA

The anti-aliasing shader follows Timothy Lottes' FXAA 3.11 (NVIDIA) in the short form that is
widely used in WebGL.

## Veyra

The feature set – upscaling, denoising, HDR look, frame generation, recording and the replay
buffer, performance stats – takes its cue from [Veyra](https://github.com/Likely7/Veyra-NRVideo)
(GPL-3.0). No Veyra code is used; Lu Videocard's pipeline runs in WebGL2 instead of DirectX 12
and vendor runtimes.
