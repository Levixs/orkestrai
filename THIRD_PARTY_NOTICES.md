# Third-Party Notices

Orkestrai uses third-party software, models, services, names, and trademarks.
Their licenses apply to those components independently from the license selected
for Orkestrai's own source code.

## Embedded Voice

Orkestrai downloads voice models only after user confirmation and executes them
locally through sherpa-onnx.

### NVIDIA Parakeet-TDT 0.6B v3

- Purpose: multilingual speech-to-text
- Copyright: NVIDIA Corporation and contributors
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- Model card: <https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3>
- ONNX archive provider: <https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models>

The model archive used by Orkestrai is an ONNX/int8 conversion distributed by
the sherpa-onnx project. NVIDIA does not endorse Orkestrai.

### Supertonic 3

- Purpose: multilingual text-to-speech
- Copyright: 2026 Supertone Inc.
- Model license: OpenRAIL-M
- Project and license information: <https://github.com/supertone-inc/supertonic>
- Model license: <https://huggingface.co/Supertone/supertonic-3/blob/main/LICENSE>
- ONNX archive provider: <https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models>

The Supertonic sample code is MIT-licensed, while the model weights downloaded
by Orkestrai are governed by the separate OpenRAIL-M model license. Supertone
does not endorse Orkestrai.

### sherpa-onnx

- Purpose: local ONNX inference for speech-to-text and text-to-speech
- Copyright: the sherpa-onnx contributors
- License: Apache License 2.0
- Source: <https://github.com/k2-fsa/sherpa-onnx>

The npm package `sherpa-onnx-node` and its native libraries are distributed
under their accompanying notices and license files.

## Node.js Runtime

Orkestrai downloads a standalone Node.js runtime for the isolated voice worker
when a suitable system runtime is unavailable.

- Copyright: Node.js contributors
- License: MIT and additional licenses listed by the Node.js distribution
- Source and notices: <https://github.com/nodejs/node/blob/main/LICENSE>

## Agent Providers And Trademarks

Claude and Anthropic are trademarks of Anthropic PBC. Codex and OpenAI are
trademarks of OpenAI. Kimi is a trademark of Moonshot AI. OpenCode and other
third-party names and logos belong to their respective owners.

Their inclusion identifies compatible command-line tools. It does not imply
sponsorship, endorsement, or affiliation unless explicitly stated by the
respective owner.

## Bundled Agent Skills

The following development-agent skills are included under the MIT License:

- `design-taste-frontend`: Copyright (c) 2026 Leonxlnx.
  Source: <https://github.com/Leonxlnx/taste-skill>
- `make-interfaces-feel-better`: Copyright (c) 2026 Jakub Krehel.
  Source: <https://github.com/jakubkrehel/make-interfaces-feel-better>
- `web-design-guidelines`: Copyright (c) 2025 Vercel Labs.
  Source: <https://github.com/vercel-labs/web-interface-guidelines>

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## JavaScript Dependencies

The complete, reproducible dependency graph is recorded in `package-lock.json`.
Installed npm packages include their own license files and notices. Direct
runtime dependencies are predominantly licensed under MIT, Apache-2.0, ISC,
MPL-2.0, or the Unlicense; each package remains governed by its own terms.
