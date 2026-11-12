# Third-party notices
Generated from installed npm manifests/lockfile and the Windows Cargo dependency graph. Full supplied license and copyright texts are retained under public/licenses and copied into the web build. Build tools are included for provenance even when they are not shipped as runtime code. Optional packages for other platforms that were not installed are not part of this Windows distribution.

## Game assets
- VT323 5.3.0: copyright 2011 The VT323 Project Authors (Peter Hull); SIL Open Font License 1.1. Bundled locally through @fontsource/vt323. [Source](https://github.com/phoikoi/VT323). Full OFL is in the font package notices below.
- Six edited OwlishMedia sound files: CC0; [source pack](https://opengameart.org/content/sound-effects-pack). Archive supplied by the project owner; source page and exact archive membership verified on 2026-09-22. See [audio manifest](public/audio/ASSETS.md) and source checksums.
- Kenney Interface Sounds 1.0 (100 files, as sound-effect variants): created by Kenney (www.kenney.nl), CC0. [Licence](public/licenses/kenney-interface-sounds/License.txt). Filtered, trimmed and re-encoded by scripts/build-sounds.mjs; see the [audio manifest](public/audio/ASSETS.md).
- Terminal User Interface Sound Effects Pack LITE Edition (81 files) by Hove Audio: [source](https://hoveaudio.itch.io/terminal-user-interface-sound-effects-pack-lite-edition). Filtered, trimmed and re-encoded; see the audio manifest.
- Free Click Sound Effects Pack (194 files) by Hove Audio: [source](https://hoveaudio.itch.io/free-click-sound-effects-pack), royalty-free; the author confirms commercial use on the pack's page. Filtered, trimmed and re-encoded; see the audio manifest. The source packs themselves are not distributed.
- Icon, fictional documents, dialogue, bezel and CRT shaders: original work created for this project. No cool-retro-term, Libretro shader, ntsc-rs code or preset is included.
- The CC BY-SA 1950 Computer pack is excluded from the distribution.

## Local model and runtime
These live in `.tools/` during development and in the release folder's `model/` directory. They are not embedded in the executable; SIGNAL91.exe starts the server on 127.0.0.1 when it opens and stops it when it closes. License texts are in `third_party/llm/` and are copied beside them.

- Default model: MiniCPM5-2B-Q4_K_M.gguf, 1,561,318,368 bytes, Apache-2.0. [OpenBMB model card](https://huggingface.co/openbmb/MiniCPM5-2B-GGUF); SHA-256: ec2d5801640099e97d8d7e8003ad4d81f336e757811f03a26173dddf386602fd. Runs with the standard llama.cpp server below.
- Retained model: K2-Horizon-4B-Q4_K_M.gguf, 3,156,598,144 bytes, Apache-2.0. [IFM model card](https://huggingface.co/IFM/K2-Horizon-3.7B-GGUF); SHA-256: 07773aed93890d4f5d08b421430000d5c8d73cefc74fbdc32e67d820f23207b2. The GGUF embeds a K2 Horizon chat template.
- Horizon runtime: [IFM llama.cpp fork](https://github.com/MBZUAI-IFM/llama.cpp/tree/model/K2Horizon), commit 42adf019f76013dac873b5b43950d54d5ab27216, built locally for Windows x64 CPU with AVX2. K2 Horizon support is not yet in standard llama.cpp. MIT text: `model/llama-k2/LICENSE-llama.cpp.txt`.
- Retained model: Ternary-Bonsai-2-27B-Abliterated-PTQ1_0.gguf, 5,946,648,928 bytes, Apache-2.0. [BoldingBuilds model card](https://huggingface.co/BoldingBuilds/Ternary-Bonsai-2-27B-Abliterated-PTQ1_0-GGUF); derived from prism-ml/Ternary-Bonsai-2-27B-gguf. SHA-256: 94dd53cbad55db5a515f245887c9f0317484502a451ccc0424c7d7788b52900a.
- Bonsai runtime: [PrismML llama.cpp prism-b10709-9a9394a](https://github.com/PrismML-Eng/llama.cpp/releases/tag/prism-b10709-9a9394a), Windows x64 CUDA 12.4; MIT license retained in model/llama-prism/LICENSE-llama.cpp.txt. Its CUDA runtime, cuBLAS and cuBLASLt libraries are NVIDIA components; [CUDA 12.4 license terms](https://docs.nvidia.com/cuda/archive/12.4.0/eula/index.html) retained in model/llama-prism/LICENSE-NVIDIA-CUDA-12.4.html. The small MiniCPM CPU model below remains the fallback.
- Model: Huihui-MiniCPM5-1B-abliterated.Q4_K_M.gguf, quantized by mradermacher, 688067040 bytes. [Quantization source and Apache-2.0 model card](https://huggingface.co/mradermacher/Huihui-MiniCPM5-1B-abliterated-GGUF).
- Upstream derivative: huihui-ai/Huihui-MiniCPM5-1B-abliterated. [Source](https://huggingface.co/huihui-ai/Huihui-MiniCPM5-1B-abliterated). Base model: openbmb/MiniCPM5-1B. Apache-2.0 text: `model/LICENSE-Apache-2.0.txt`.
- llama.cpp: b10964, selected by v0.4.1 nightly-tag.txt; ggml contributors / Georgi Gerganov and contributors, MIT. [Exact runtime source](https://github.com/ggml-org/llama.cpp/tree/b10964). CPU build: llama-server.exe and its DLLs, copyright (c) 2023-2026 The ggml authors; MIT text: `model/llama/LICENSE-llama.cpp.txt`. Its libomp.dll is the LLVM OpenMP runtime: `model/llama/LICENSE-LLVM-OpenMP.txt`.
- Microsoft WebView2 and Windows system runtime: installed platform prerequisites supplied by Microsoft, not redistributed here.
- FFmpeg 8.1.2: build-time audio conversion only; no executable or library is bundled. Source WAV masters and source archives are excluded.

## Dependency inventory
| Ecosystem | Component | Version | License | Source | Preserved texts |
| --- | --- | --- | --- | --- | --- |
| npm | @cacheable/memory | 2.2.0 | MIT | [source](https://github.com/jaredwray/cacheable.git) | [notice](public/licenses/npm-_cacheable_memory-2.2.0/LICENSE) |
| npm | @cacheable/utils | 2.5.0 | MIT | [source](https://github.com/jaredwray/cacheable.git) | [notice](public/licenses/npm-_cacheable_utils-2.5.0/LICENSE) |
| npm | @eslint-community/eslint-utils | 4.10.1 | MIT | [source](https://github.com/eslint-community/eslint-utils) | [notice](public/licenses/npm-_eslint-community_eslint-utils-4.10.1/LICENSE) |
| npm | @eslint-community/regexpp | 4.12.2 | MIT | [source](https://github.com/eslint-community/regexpp) | [notice](public/licenses/npm-_eslint-community_regexpp-4.12.2/LICENSE) |
| npm | @eslint/config-array | 0.23.5 | Apache-2.0 | [source](https://github.com/eslint/rewrite.git) | [notice](public/licenses/npm-_eslint_config-array-0.23.5/LICENSE) |
| npm | @eslint/config-helpers | 0.7.0 | Apache-2.0 | [source](https://github.com/eslint/rewrite.git) | [notice](public/licenses/npm-_eslint_config-helpers-0.7.0/LICENSE) |
| npm | @eslint/core | 1.2.1 | Apache-2.0 | [source](https://github.com/eslint/rewrite.git) | [notice](public/licenses/npm-_eslint_core-1.2.1/LICENSE) |
| npm | @eslint/js | 10.0.1 | MIT | [source](https://github.com/eslint/eslint.git) | [notice](public/licenses/npm-_eslint_js-10.0.1/LICENSE) |
| npm | @eslint/object-schema | 3.0.5 | Apache-2.0 | [source](https://github.com/eslint/rewrite.git) | [notice](public/licenses/npm-_eslint_object-schema-3.0.5/LICENSE) |
| npm | @eslint/plugin-kit | 0.7.3 | Apache-2.0 | [source](https://github.com/eslint/rewrite.git) | [notice](public/licenses/npm-_eslint_plugin-kit-0.7.3/LICENSE) |
| npm | @fontsource/vt323 | 5.3.0 | OFL-1.1 | [source](https://github.com/fontsource/font-files.git) | [notice](public/licenses/npm-_fontsource_vt323-5.3.0/LICENSE) |
| npm | @humanfs/core | 0.19.2 | Apache-2.0 | [source](https://github.com/humanwhocodes/humanfs.git) | [notice](public/licenses/npm-_humanfs_core-0.19.2/LICENSE) |
| npm | @humanfs/node | 0.16.8 | Apache-2.0 | [source](https://github.com/humanwhocodes/humanfs.git) | [notice](public/licenses/npm-_humanfs_node-0.16.8/LICENSE) |
| npm | @humanfs/types | 0.15.0 | Apache-2.0 | [source](https://github.com/humanwhocodes/humanfs.git) | [notice](public/licenses/npm-_humanfs_types-0.15.0/LICENSE) |
| npm | @humanwhocodes/module-importer | 1.0.1 | Apache-2.0 | [source](https://github.com/humanwhocodes/module-importer.git) | [notice](public/licenses/npm-_humanwhocodes_module-importer-1.0.1/LICENSE) |
| npm | @humanwhocodes/retry | 0.4.3 | Apache-2.0 | [source](https://github.com/humanwhocodes/retry.git) | [notice](public/licenses/npm-_humanwhocodes_retry-0.4.3/LICENSE) |
| npm | @jridgewell/resolve-uri | 3.1.2 | MIT | [source](https://github.com/jridgewell/resolve-uri) | [notice](public/licenses/npm-_jridgewell_resolve-uri-3.1.2/LICENSE) |
| npm | @jridgewell/sourcemap-codec | 1.6.0 | MIT | [source](https://github.com/jridgewell/sourcemaps.git) | [notice](public/licenses/npm-_jridgewell_sourcemap-codec-1.6.0/LICENSE) |
| npm | @jridgewell/trace-mapping | 0.3.31 | MIT | [source](https://github.com/jridgewell/sourcemaps.git) | [notice](public/licenses/npm-_jridgewell_trace-mapping-0.3.31/LICENSE) |
| npm | @keyv/bigmap | 1.3.1 | MIT | [source](https://github.com/jaredwray/keyv.git) | [notice](public/licenses/npm-_keyv_bigmap-1.3.1/LICENSE) |
| npm | @keyv/serialize | 1.1.1 | MIT | [source](https://github.com/jaredwray/keyv.git) | [notice](public/licenses/npm-_keyv_serialize-1.1.1/LICENSE) |
| npm | @oxc-project/types | 0.150.0 | MIT | [source](https://github.com/oxc-project/oxc.git) | [notice](public/licenses/npm-_oxc-project_types-0.150.0/LICENSE) |
| npm | @playwright/test | 1.63.0 | Apache-2.0 | [source](https://github.com/microsoft/playwright.git) | [notice](public/licenses/npm-_playwright_test-1.63.0/LICENSE), [notice](public/licenses/npm-_playwright_test-1.63.0/NOTICE) |
| npm | @rolldown/binding-win32-x64-msvc | 1.2.9 | MIT | [source](https://github.com/rolldown/rolldown.git) | [notice](public/licenses/npm-_rolldown_binding-win32-x64-msvc-1.2.9/LICENSE) |
| npm | @rolldown/pluginutils | 1.0.1 | MIT | [source](https://github.com/rolldown/plugins.git) | [notice](public/licenses/npm-_rolldown_pluginutils-1.0.1/LICENSE) |
| npm | @tauri-apps/api | 2.11.1 | Apache-2.0 OR MIT | [source](https://github.com/tauri-apps/tauri.git) | [notice](public/licenses/npm-_tauri-apps_api-2.11.1/LICENSE_APACHE-2.0), [notice](public/licenses/npm-_tauri-apps_api-2.11.1/LICENSE_MIT) |
| npm | @tauri-apps/cli | 2.11.5 | Apache-2.0 OR MIT | [source](https://github.com/tauri-apps/tauri.git) | [notice](public/licenses/npm-_tauri-apps_cli-2.11.5/LICENSE_APACHE-2.0), [notice](public/licenses/npm-_tauri-apps_cli-2.11.5/LICENSE_MIT) |
| npm | @tauri-apps/cli-win32-x64-msvc | 2.11.5 | Apache-2.0 OR MIT | [source](https://github.com/tauri-apps/tauri.git) | [notice](public/licenses/npm-_tauri-apps_cli-win32-x64-msvc-2.11.5/LICENSE_APACHE-2.0), [notice](public/licenses/npm-_tauri-apps_cli-win32-x64-msvc-2.11.5/LICENSE_MIT) |
| npm | @types/chai | 5.2.3 | MIT | [source](https://github.com/DefinitelyTyped/DefinitelyTyped.git) | [notice](public/licenses/npm-_types_chai-5.2.3/LICENSE) |
| npm | @types/deep-eql | 4.0.2 | MIT | [source](https://github.com/DefinitelyTyped/DefinitelyTyped.git) | [notice](public/licenses/npm-_types_deep-eql-4.0.2/LICENSE) |
| npm | @types/esrecurse | 4.3.1 | MIT | [source](https://github.com/DefinitelyTyped/DefinitelyTyped.git) | [notice](public/licenses/npm-_types_esrecurse-4.3.1/LICENSE) |
| npm | @types/estree | 1.0.9 | MIT | [source](https://github.com/DefinitelyTyped/DefinitelyTyped.git) | [notice](public/licenses/npm-_types_estree-1.0.9/LICENSE) |
| npm | @types/json-schema | 7.0.15 | MIT | [source](https://github.com/DefinitelyTyped/DefinitelyTyped.git) | [notice](public/licenses/npm-_types_json-schema-7.0.15/LICENSE) |
| npm | @types/node | 26.6.2 | MIT | [source](https://github.com/DefinitelyTyped/DefinitelyTyped.git) | [notice](public/licenses/npm-_types_node-26.6.2/LICENSE) |
| npm | @types/react | 19.3.0 | MIT | [source](https://github.com/DefinitelyTyped/DefinitelyTyped.git) | [notice](public/licenses/npm-_types_react-19.3.0/LICENSE) |
| npm | @types/react-dom | 19.3.0 | MIT | [source](https://github.com/DefinitelyTyped/DefinitelyTyped.git) | [notice](public/licenses/npm-_types_react-dom-19.3.0/LICENSE) |
| npm | @typescript-eslint/eslint-plugin | 8.70.1 | MIT | [source](https://github.com/typescript-eslint/typescript-eslint.git) | [notice](public/licenses/npm-_typescript-eslint_eslint-plugin-8.70.1/LICENSE) |
| npm | @typescript-eslint/parser | 8.70.1 | MIT | [source](https://github.com/typescript-eslint/typescript-eslint.git) | [notice](public/licenses/npm-_typescript-eslint_parser-8.70.1/LICENSE) |
| npm | @typescript-eslint/project-service | 8.70.1 | MIT | [source](https://github.com/typescript-eslint/typescript-eslint.git) | [notice](public/licenses/npm-_typescript-eslint_project-service-8.70.1/LICENSE) |
| npm | @typescript-eslint/scope-manager | 8.70.1 | MIT | [source](https://github.com/typescript-eslint/typescript-eslint.git) | [notice](public/licenses/npm-_typescript-eslint_scope-manager-8.70.1/LICENSE) |
| npm | @typescript-eslint/tsconfig-utils | 8.70.1 | MIT | [source](https://github.com/typescript-eslint/typescript-eslint.git) | [notice](public/licenses/npm-_typescript-eslint_tsconfig-utils-8.70.1/LICENSE) |
| npm | @typescript-eslint/type-utils | 8.70.1 | MIT | [source](https://github.com/typescript-eslint/typescript-eslint.git) | [notice](public/licenses/npm-_typescript-eslint_type-utils-8.70.1/LICENSE) |
| npm | @typescript-eslint/types | 8.70.1 | MIT | [source](https://github.com/typescript-eslint/typescript-eslint.git) | [notice](public/licenses/npm-_typescript-eslint_types-8.70.1/LICENSE) |
| npm | @typescript-eslint/typescript-estree | 8.70.1 | MIT | [source](https://github.com/typescript-eslint/typescript-eslint.git) | [notice](public/licenses/npm-_typescript-eslint_typescript-estree-8.70.1/LICENSE) |
| npm | @typescript-eslint/utils | 8.70.1 | MIT | [source](https://github.com/typescript-eslint/typescript-eslint.git) | [notice](public/licenses/npm-_typescript-eslint_utils-8.70.1/LICENSE) |
| npm | @typescript-eslint/visitor-keys | 8.70.1 | MIT | [source](https://github.com/typescript-eslint/typescript-eslint.git) | [notice](public/licenses/npm-_typescript-eslint_visitor-keys-8.70.1/LICENSE) |
| npm | @vitejs/plugin-react | 6.1.1 | MIT | [source](https://github.com/vitejs/vite-plugin-react.git) | [notice](public/licenses/npm-_vitejs_plugin-react-6.1.1/LICENSE) |
| npm | @vitest/mocker | 5.0.1 | MIT | [source](https://github.com/vitest-dev/vitest.git) | [notice](public/licenses/npm-_vitest_mocker-5.0.1/LICENSE) |
| npm | @vitest/spy | 5.0.1 | MIT | [source](https://github.com/vitest-dev/vitest.git) | [notice](public/licenses/npm-_vitest_spy-5.0.1/LICENSE) |
| npm | acorn | 8.18.0 | MIT | [source](https://github.com/acornjs/acorn.git) | [notice](public/licenses/npm-acorn-8.18.0/LICENSE) |
| npm | acorn-jsx | 5.3.2 | MIT | [source](https://github.com/acornjs/acorn-jsx) | [notice](public/licenses/npm-acorn-jsx-5.3.2/LICENSE) |
| npm | ajv | 6.15.0 | MIT | [source](https://github.com/ajv-validator/ajv.git) | [notice](public/licenses/npm-ajv-6.15.0/LICENSE) |
| npm | assertion-error | 2.0.1 | MIT | [source](git@github.com:chaijs/assertion-error.git) | [notice](public/licenses/npm-assertion-error-2.0.1/LICENSE) |
| npm | balanced-match | 4.0.4 | MIT | [source](https://github.com/juliangruber/balanced-match.git) | [notice](public/licenses/npm-balanced-match-4.0.4/LICENSE.md) |
| npm | brace-expansion | 5.0.12 | MIT | [source](https://github.com/juliangruber/brace-expansion.git) | [notice](public/licenses/npm-brace-expansion-5.0.12/LICENSE) |
| npm | cacheable | 2.5.0 | MIT | [source](https://github.com/jaredwray/cacheable.git) | [notice](public/licenses/npm-cacheable-2.5.0/LICENSE) |
| npm | chai | 6.2.2 | MIT | [source](https://github.com/chaijs/chai) | [notice](public/licenses/npm-chai-6.2.2/LICENSE) |
| npm | cross-spawn | 7.0.6 | MIT | [source](git@github.com:moxystudio/node-cross-spawn.git) | [notice](public/licenses/npm-cross-spawn-7.0.6/LICENSE) |
| npm | csstype | 3.2.3 | MIT | [source](https://github.com/frenic/csstype) | [notice](public/licenses/npm-csstype-3.2.3/LICENSE) |
| npm | debug | 4.4.3 | MIT | [source](https://github.com/debug-js/debug.git) | [notice](public/licenses/npm-debug-4.4.3/LICENSE) |
| npm | deep-is | 0.1.4 | MIT | [source](http://github.com/thlorenz/deep-is.git) | [notice](public/licenses/npm-deep-is-0.1.4/LICENSE) |
| npm | detect-libc | 2.1.2 | Apache-2.0 | [source](https://github.com/lovell/detect-libc.git) | [notice](public/licenses/npm-detect-libc-2.1.2/LICENSE) |
| npm | es-module-lexer | 2.3.2 | MIT | [source](https://github.com/guybedford/es-module-lexer.git) | [notice](public/licenses/npm-es-module-lexer-2.3.2/LICENSE) |
| npm | escape-string-regexp | 4.0.0 | MIT | [source](sindresorhus/escape-string-regexp) | [notice](public/licenses/npm-escape-string-regexp-4.0.0/license) |
| npm | eslint | 10.11.0 | MIT | [source](eslint/eslint) | [notice](public/licenses/npm-eslint-10.11.0/LICENSE) |
| npm | eslint-scope | 9.1.2 | BSD-2-Clause | [source](https://github.com/eslint/js.git) | [notice](public/licenses/npm-eslint-scope-9.1.2/LICENSE) |
| npm | eslint-visitor-keys | 3.4.3 | Apache-2.0 | [source](eslint/eslint-visitor-keys) | [notice](public/licenses/npm-eslint-visitor-keys-3.4.3/LICENSE) |
| npm | eslint-visitor-keys | 5.0.1 | Apache-2.0 | [source](https://github.com/eslint/js.git) | [notice](public/licenses/npm-eslint-visitor-keys-5.0.1/LICENSE) |
| npm | espree | 11.2.0 | BSD-2-Clause | [source](https://github.com/eslint/js.git) | [notice](public/licenses/npm-espree-11.2.0/LICENSE) |
| npm | esquery | 1.7.0 | BSD-3-Clause | [source](https://github.com/estools/esquery.git) | [notice](public/licenses/npm-esquery-1.7.0/license.txt) |
| npm | esrecurse | 4.3.0 | BSD-2-Clause | [source](https://github.com/estools/esrecurse.git) | [notice](public/licenses/npm-esrecurse-4.3.0/NOTICE.txt) |
| npm | estraverse | 5.3.0 | BSD-2-Clause | [source](http://github.com/estools/estraverse.git) | [notice](public/licenses/npm-estraverse-5.3.0/LICENSE.BSD) |
| npm | estree-walker | 3.0.3 | MIT | [source](https://github.com/Rich-Harris/estree-walker) | [notice](public/licenses/npm-estree-walker-3.0.3/LICENSE) |
| npm | esutils | 2.0.3 | BSD-2-Clause | [source](http://github.com/estools/esutils.git) | [notice](public/licenses/npm-esutils-2.0.3/LICENSE.BSD) |
| npm | expect-type | 1.4.0 | Apache-2.0 | [source](https://github.com/mmkal/expect-type.git) | [notice](public/licenses/npm-expect-type-1.4.0/LICENSE) |
| npm | fast-deep-equal | 3.1.3 | MIT | [source](https://github.com/epoberezkin/fast-deep-equal.git) | [notice](public/licenses/npm-fast-deep-equal-3.1.3/LICENSE) |
| npm | fast-json-stable-stringify | 2.1.0 | MIT | [source](https://github.com/epoberezkin/fast-json-stable-stringify.git) | [notice](public/licenses/npm-fast-json-stable-stringify-2.1.0/LICENSE) |
| npm | fast-levenshtein | 2.0.6 | MIT | [source](https://github.com/hiddentao/fast-levenshtein.git) | [notice](public/licenses/npm-fast-levenshtein-2.0.6/LICENSE.md) |
| npm | fdir | 6.5.0 | MIT | [source](https://github.com/thecodrr/fdir.git) | [notice](public/licenses/npm-fdir-6.5.0/LICENSE) |
| npm | file-entry-cache | 11.1.5 | MIT | [source](https://github.com/jaredwray/cacheable.git) | [notice](public/licenses/npm-file-entry-cache-11.1.5/LICENSE) |
| npm | find-up | 5.0.0 | MIT | [source](sindresorhus/find-up) | [notice](public/licenses/npm-find-up-5.0.0/license) |
| npm | flat-cache | 6.1.23 | MIT | [source](https://github.com/jaredwray/cacheable.git) | [notice](public/licenses/npm-flat-cache-6.1.23/LICENSE) |
| npm | flatted | 3.4.4 | ISC | [source](https://github.com/WebReflection/flatted.git) | [notice](public/licenses/npm-flatted-3.4.4/LICENSE) |
| npm | glob-parent | 6.0.2 | ISC | [source](gulpjs/glob-parent) | [notice](public/licenses/npm-glob-parent-6.0.2/LICENSE) |
| npm | hashery | 1.5.1 | MIT | [source](https://github.com/jaredwray/hashery.git) | [notice](public/licenses/npm-hashery-1.5.1/LICENSE) |
| npm | hookified | 1.15.1 | MIT | [source](https://github.com/jaredwray/hookified.git) | [notice](public/licenses/npm-hookified-1.15.1/LICENSE) |
| npm | hookified | 2.2.0 | MIT | [source](https://github.com/jaredwray/hookified.git) | [notice](public/licenses/npm-hookified-2.2.0/LICENSE) |
| npm | ignore | 7.0.10 | MIT | [source](https://github.com/kaelzhang/node-ignore.git) | [notice](public/licenses/npm-ignore-7.0.10/LICENSE-MIT) |
| npm | ignore | 5.3.2 | MIT | [source](git@github.com:kaelzhang/node-ignore.git) | [notice](public/licenses/npm-ignore-5.3.2/LICENSE-MIT) |
| npm | imurmurhash | 0.1.4 | MIT | [source](https://github.com/jensyt/imurmurhash-js) | [notice](public/licenses/npm-imurmurhash-0.1.4/LICENSE.txt) |
| npm | is-extglob | 2.1.1 | MIT | [source](jonschlinkert/is-extglob) | [notice](public/licenses/npm-is-extglob-2.1.1/LICENSE) |
| npm | is-glob | 4.0.3 | MIT | [source](micromatch/is-glob) | [notice](public/licenses/npm-is-glob-4.0.3/LICENSE) |
| npm | isexe | 2.0.0 | ISC | [source](https://github.com/isaacs/isexe.git) | [notice](public/licenses/npm-isexe-2.0.0/LICENSE) |
| npm | json-schema-traverse | 0.4.1 | MIT | [source](https://github.com/epoberezkin/json-schema-traverse.git) | [notice](public/licenses/npm-json-schema-traverse-0.4.1/LICENSE) |
| npm | json-stable-stringify-without-jsonify | 1.0.1 | MIT | [source](https://github.com/samn/json-stable-stringify.git) | [notice](public/licenses/npm-json-stable-stringify-without-jsonify-1.0.1/LICENSE) |
| npm | keyv | 5.6.0 | MIT | [source](https://github.com/jaredwray/keyv.git) | [notice](public/licenses/npm-keyv-5.6.0/LICENSE) |
| npm | levn | 0.4.1 | MIT | [source](https://github.com/gkz/levn.git) | [notice](public/licenses/npm-levn-0.4.1/LICENSE) |
| npm | lightningcss | 1.33.0 | MPL-2.0 | [source](https://github.com/parcel-bundler/lightningcss.git) | [notice](public/licenses/npm-lightningcss-1.33.0/LICENSE) |
| npm | lightningcss-win32-x64-msvc | 1.33.0 | MPL-2.0 | [source](https://github.com/parcel-bundler/lightningcss.git) | [notice](public/licenses/npm-lightningcss-win32-x64-msvc-1.33.0/LICENSE) |
| npm | locate-path | 6.0.0 | MIT | [source](sindresorhus/locate-path) | [notice](public/licenses/npm-locate-path-6.0.0/license) |
| npm | magic-string | 1.4.1 | MIT | [source](https://github.com/Rich-Harris/magic-string.git) | [notice](public/licenses/npm-magic-string-1.4.1/LICENSE) |
| npm | minimatch | 10.2.6 | BlueOak-1.0.0 | [source](git@github.com:isaacs/minimatch) | [notice](public/licenses/npm-minimatch-10.2.6/LICENSE.md) |
| npm | ms | 2.1.3 | MIT | [source](vercel/ms) | [notice](public/licenses/npm-ms-2.1.3/license.md) |
| npm | nanoid | 3.3.19 | MIT | [source](ai/nanoid) | [notice](public/licenses/npm-nanoid-3.3.19/LICENSE) |
| npm | natural-compare | 1.4.0 | MIT | [source](https://github.com/litejs/natural-compare-lite.git) | [notice](public/licenses/npm-natural-compare-1.4.0/LICENSE.txt) |
| npm | obug | 2.2.1 | MIT | [source](https://github.com/sxzz/obug.git) | [notice](public/licenses/npm-obug-2.2.1/LICENSE) |
| npm | optionator | 0.9.4 | MIT | [source](https://github.com/gkz/optionator.git) | [notice](public/licenses/npm-optionator-0.9.4/LICENSE) |
| npm | p-limit | 3.1.0 | MIT | [source](sindresorhus/p-limit) | [notice](public/licenses/npm-p-limit-3.1.0/license) |
| npm | p-locate | 5.0.0 | MIT | [source](sindresorhus/p-locate) | [notice](public/licenses/npm-p-locate-5.0.0/license) |
| npm | path-exists | 4.0.0 | MIT | [source](sindresorhus/path-exists) | [notice](public/licenses/npm-path-exists-4.0.0/license) |
| npm | path-key | 3.1.1 | MIT | [source](sindresorhus/path-key) | [notice](public/licenses/npm-path-key-3.1.1/license) |
| npm | picocolors | 1.1.1 | ISC | [source](alexeyraspopov/picocolors) | [notice](public/licenses/npm-picocolors-1.1.1/LICENSE) |
| npm | picomatch | 4.0.7 | MIT | [source](micromatch/picomatch) | [notice](public/licenses/npm-picomatch-4.0.7/LICENSE) |
| npm | playwright | 1.63.0 | Apache-2.0 | [source](https://github.com/microsoft/playwright.git) | [notice](public/licenses/npm-playwright-1.63.0/LICENSE), [notice](public/licenses/npm-playwright-1.63.0/NOTICE) |
| npm | playwright-core | 1.63.0 | Apache-2.0 | [source](https://github.com/microsoft/playwright.git) | [notice](public/licenses/npm-playwright-core-1.63.0/LICENSE), [notice](public/licenses/npm-playwright-core-1.63.0/NOTICE) |
| npm | postcss | 8.5.28 | MIT | [source](postcss/postcss) | [notice](public/licenses/npm-postcss-8.5.28/LICENSE) |
| npm | prelude-ls | 1.2.1 | MIT | [source](https://github.com/gkz/prelude-ls.git) | [notice](public/licenses/npm-prelude-ls-1.2.1/LICENSE) |
| npm | prettier | 3.9.8 | MIT | [source](prettier/prettier) | [notice](public/licenses/npm-prettier-3.9.8/LICENSE) |
| npm | punycode | 2.3.1 | MIT | [source](https://github.com/mathiasbynens/punycode.js.git) | [notice](public/licenses/npm-punycode-2.3.1/LICENSE-MIT.txt) |
| npm | qified | 0.10.1 | MIT | [source](https://github.com/jaredwray/qified.git) | [notice](public/licenses/npm-qified-0.10.1/LICENSE) |
| npm | react | 19.3.0 | MIT | [source](https://github.com/react/react.git) | [notice](public/licenses/npm-react-19.3.0/LICENSE) |
| npm | react-dom | 19.3.0 | MIT | [source](https://github.com/react/react.git) | [notice](public/licenses/npm-react-dom-19.3.0/LICENSE) |
| npm | rolldown | 1.2.9 | MIT | [source](https://github.com/rolldown/rolldown.git) | [notice](public/licenses/npm-rolldown-1.2.9/LICENSE) |
| npm | scheduler | 0.28.0 | MIT | [source](https://github.com/react/react.git) | [notice](public/licenses/npm-scheduler-0.28.0/LICENSE) |
| npm | semver | 7.8.5 | ISC | [source](https://github.com/npm/node-semver.git) | [notice](public/licenses/npm-semver-7.8.5/LICENSE) |
| npm | shebang-command | 2.0.0 | MIT | [source](kevva/shebang-command) | [notice](public/licenses/npm-shebang-command-2.0.0/license) |
| npm | shebang-regex | 3.0.0 | MIT | [source](sindresorhus/shebang-regex) | [notice](public/licenses/npm-shebang-regex-3.0.0/license) |
| npm | siginfo | 2.0.0 | ISC | [source](https://github.com/emilbayes/siginfo.git) | [notice](public/licenses/npm-siginfo-2.0.0/LICENSE) |
| npm | source-map-js | 1.2.1 | BSD-3-Clause | [source](7rulnik/source-map-js) | [notice](public/licenses/npm-source-map-js-1.2.1/LICENSE) |
| npm | stackback | 0.0.2 | MIT | [source](https://github.com/shtylman/node-stackback.git) | [notice](public/licenses/npm-stackback-0.0.2/LICENSE.txt), [notice](public/licenses/npm-stackback-0.0.2/NOTICE-V8.txt) |
| npm | std-env | 4.2.0 | MIT | [source](unjs/std-env) | [notice](public/licenses/npm-std-env-4.2.0/LICENCE) |
| npm | tinybench | 6.1.4 | MIT | [source](tinylibs/tinybench) | [notice](public/licenses/npm-tinybench-6.1.4/LICENSE) |
| npm | tinyexec | 1.3.0 | MIT | [source](https://github.com/tinylibs/tinyexec.git) | [notice](public/licenses/npm-tinyexec-1.3.0/LICENSE) |
| npm | tinyglobby | 0.2.17 | MIT | [source](https://github.com/SuperchupuDev/tinyglobby.git) | [notice](public/licenses/npm-tinyglobby-0.2.17/LICENSE) |
| npm | ts-api-utils | 2.5.0 | MIT | [source](https://github.com/JoshuaKGoldberg/ts-api-utils) | [notice](public/licenses/npm-ts-api-utils-2.5.0/LICENSE.md) |
| npm | type-check | 0.4.0 | MIT | [source](https://github.com/gkz/type-check.git) | [notice](public/licenses/npm-type-check-0.4.0/LICENSE) |
| npm | typescript | 6.0.3 | Apache-2.0 | [source](https://github.com/microsoft/TypeScript.git) | [notice](public/licenses/npm-typescript-6.0.3/LICENSE.txt) |
| npm | typescript-eslint | 8.70.1 | MIT | [source](https://github.com/typescript-eslint/typescript-eslint.git) | [notice](public/licenses/npm-typescript-eslint-8.70.1/LICENSE) |
| npm | undici-types | 8.9.0 | MIT | [source](https://github.com/nodejs/undici.git) | [notice](public/licenses/npm-undici-types-8.9.0/LICENSE) |
| npm | uri-js | 4.4.1 | BSD-2-Clause | [source](http://github.com/garycourt/uri-js) | [notice](public/licenses/npm-uri-js-4.4.1/LICENSE) |
| npm | vite | 8.3.0 | MIT | [source](https://github.com/vitejs/vite.git) | [notice](public/licenses/npm-vite-8.3.0/LICENSE.md) |
| npm | vitest | 5.0.1 | MIT | [source](https://github.com/vitest-dev/vitest.git) | [notice](public/licenses/npm-vitest-5.0.1/LICENSE.md) |
| npm | which | 2.0.2 | ISC | [source](https://github.com/isaacs/node-which.git) | [notice](public/licenses/npm-which-2.0.2/LICENSE) |
| npm | why-is-node-running | 2.3.0 | MIT | [source](https://github.com/mafintosh/why-is-node-running.git) | [notice](public/licenses/npm-why-is-node-running-2.3.0/LICENSE) |
| npm | word-wrap | 1.2.5 | MIT | [source](jonschlinkert/word-wrap) | [notice](public/licenses/npm-word-wrap-1.2.5/LICENSE) |
| npm | yocto-queue | 0.1.0 | MIT | [source](sindresorhus/yocto-queue) | [notice](public/licenses/npm-yocto-queue-0.1.0/license) |
| Rust | adler2 | 2.0.1 | 0BSD OR MIT OR Apache-2.0 | [source](https://github.com/oyvindln/adler2) | [notice](public/licenses/rust-adler2-2.0.1/LICENSE-0BSD), [notice](public/licenses/rust-adler2-2.0.1/LICENSE-APACHE), [notice](public/licenses/rust-adler2-2.0.1/LICENSE-MIT) |
| Rust | aho-corasick | 1.1.5 | Unlicense OR MIT | [source](https://github.com/BurntSushi/aho-corasick) | [notice](public/licenses/rust-aho-corasick-1.1.5/COPYING), [notice](public/licenses/rust-aho-corasick-1.1.5/LICENSE-MIT) |
| Rust | alloc-no-stdlib | 2.0.4 | BSD-3-Clause | [source](https://github.com/dropbox/rust-alloc-no-stdlib) | [notice](public/licenses/rust-alloc-no-stdlib-2.0.4/LICENSE) |
| Rust | alloc-stdlib | 0.2.4 | BSD-3-Clause | [source](https://github.com/dropbox/rust-alloc-no-stdlib) | [notice](public/licenses/rust-alloc-stdlib-0.2.4/LICENSE), [notice](public/licenses/rust-alloc-stdlib-0.2.4/SOURCE.txt) |
| Rust | anyhow | 1.0.104 | MIT OR Apache-2.0 | [source](https://github.com/dtolnay/anyhow) | [notice](public/licenses/rust-anyhow-1.0.104/LICENSE-APACHE), [notice](public/licenses/rust-anyhow-1.0.104/LICENSE-MIT) |
| Rust | atomic-waker | 1.1.2 | Apache-2.0 OR MIT | [source](https://github.com/smol-rs/atomic-waker) | [notice](public/licenses/rust-atomic-waker-1.1.2/LICENSE-APACHE), [notice](public/licenses/rust-atomic-waker-1.1.2/LICENSE-MIT), [notice](public/licenses/rust-atomic-waker-1.1.2/LICENSE-THIRD-PARTY) |
| Rust | autocfg | 1.5.1 | Apache-2.0 OR MIT | [source](https://github.com/cuviper/autocfg) | [notice](public/licenses/rust-autocfg-1.5.1/LICENSE-APACHE), [notice](public/licenses/rust-autocfg-1.5.1/LICENSE-MIT) |
| Rust | base64 | 0.22.1 | MIT OR Apache-2.0 | [source](https://github.com/marshallpierce/rust-base64) | [notice](public/licenses/rust-base64-0.22.1/LICENSE-APACHE), [notice](public/licenses/rust-base64-0.22.1/LICENSE-MIT) |
| Rust | base64 | 0.23.1 | MIT OR Apache-2.0 | [source](https://github.com/marshallpierce/rust-base64) | [notice](public/licenses/rust-base64-0.23.1/LICENSE-APACHE), [notice](public/licenses/rust-base64-0.23.1/LICENSE-MIT) |
| Rust | bit-set | 0.8.0 | Apache-2.0 OR MIT | [source](https://github.com/contain-rs/bit-set) | [notice](public/licenses/rust-bit-set-0.8.0/LICENSE-APACHE), [notice](public/licenses/rust-bit-set-0.8.0/LICENSE-MIT) |
| Rust | bit-vec | 0.8.0 | Apache-2.0 OR MIT | [source](https://github.com/contain-rs/bit-vec) | [notice](public/licenses/rust-bit-vec-0.8.0/LICENSE-APACHE), [notice](public/licenses/rust-bit-vec-0.8.0/LICENSE-MIT) |
| Rust | bitflags | 1.3.2 | MIT/Apache-2.0 | [source](https://github.com/bitflags/bitflags) | [notice](public/licenses/rust-bitflags-1.3.2/LICENSE-APACHE), [notice](public/licenses/rust-bitflags-1.3.2/LICENSE-MIT) |
| Rust | bitflags | 2.13.2 | MIT OR Apache-2.0 | [source](https://github.com/bitflags/bitflags) | [notice](public/licenses/rust-bitflags-2.13.2/LICENSE-APACHE), [notice](public/licenses/rust-bitflags-2.13.2/LICENSE-MIT) |
| Rust | block-buffer | 0.10.4 | MIT OR Apache-2.0 | [source](https://github.com/RustCrypto/utils) | [notice](public/licenses/rust-block-buffer-0.10.4/LICENSE-APACHE), [notice](public/licenses/rust-block-buffer-0.10.4/LICENSE-MIT) |
| Rust | brotli | 8.0.4 | BSD-3-Clause AND MIT | [source](https://github.com/dropbox/rust-brotli) | [notice](public/licenses/rust-brotli-8.0.4/LICENSE.BSD-3-Clause), [notice](public/licenses/rust-brotli-8.0.4/LICENSE.MIT) |
| Rust | brotli-decompressor | 5.0.3 | BSD-3-Clause/MIT | [source](https://github.com/dropbox/rust-brotli-decompressor) | [notice](public/licenses/rust-brotli-decompressor-5.0.3/LICENSE) |
| Rust | bs58 | 0.5.1 | MIT/Apache-2.0 | [source](https://github.com/Nullus157/bs58-rs) | [notice](public/licenses/rust-bs58-0.5.1/LICENSE-APACHE), [notice](public/licenses/rust-bs58-0.5.1/LICENSE-MIT) |
| Rust | byteorder | 1.5.0 | Unlicense OR MIT | [source](https://github.com/BurntSushi/byteorder) | [notice](public/licenses/rust-byteorder-1.5.0/COPYING), [notice](public/licenses/rust-byteorder-1.5.0/LICENSE-MIT) |
| Rust | bytes | 1.12.1 | MIT | [source](https://github.com/tokio-rs/bytes) | [notice](public/licenses/rust-bytes-1.12.1/LICENSE) |
| Rust | camino | 1.2.6 | MIT OR Apache-2.0 | [source](https://github.com/camino-rs/camino) | [notice](public/licenses/rust-camino-1.2.6/LICENSE-APACHE), [notice](public/licenses/rust-camino-1.2.6/LICENSE-MIT) |
| Rust | cargo_metadata | 0.19.2 | MIT | [source](https://github.com/oli-obk/cargo_metadata) | [notice](public/licenses/rust-cargo_metadata-0.19.2/LICENSE-MIT) |
| Rust | cargo_toml | 0.22.3 | Apache-2.0 OR MIT | [source](https://gitlab.com/lib.rs/cargo_toml) | [notice](public/licenses/rust-cargo_toml-0.22.3/LICENSE) |
| Rust | cargo-platform | 0.1.9 | MIT OR Apache-2.0 | [source](https://github.com/rust-lang/cargo) | [notice](public/licenses/rust-cargo-platform-0.1.9/LICENSE-APACHE), [notice](public/licenses/rust-cargo-platform-0.1.9/LICENSE-MIT) |
| Rust | cc | 1.4.7 | MIT OR Apache-2.0 | [source](https://github.com/rust-lang/cc-rs) | [notice](public/licenses/rust-cc-1.4.7/LICENSE-APACHE), [notice](public/licenses/rust-cc-1.4.7/LICENSE-MIT) |
| Rust | cfb | 0.7.3 | MIT | [source](https://github.com/mdsteele/rust-cfb) | [notice](public/licenses/rust-cfb-0.7.3/LICENSE) |
| Rust | cfg-if | 1.0.5 | MIT OR Apache-2.0 | [source](https://github.com/rust-lang/cfg-if) | [notice](public/licenses/rust-cfg-if-1.0.5/LICENSE-APACHE), [notice](public/licenses/rust-cfg-if-1.0.5/LICENSE-MIT) |
| Rust | chrono | 0.4.45 | MIT OR Apache-2.0 | [source](https://github.com/chronotope/chrono) | [notice](public/licenses/rust-chrono-0.4.45/LICENSE.txt) |
| Rust | cookie | 0.18.2 | MIT OR Apache-2.0 | [source](https://github.com/SergioBenitez/cookie-rs) | [notice](public/licenses/rust-cookie-0.18.2/LICENSE-APACHE), [notice](public/licenses/rust-cookie-0.18.2/LICENSE-MIT) |
| Rust | cpufeatures | 0.2.17 | MIT OR Apache-2.0 | [source](https://github.com/RustCrypto/utils) | [notice](public/licenses/rust-cpufeatures-0.2.17/LICENSE-APACHE), [notice](public/licenses/rust-cpufeatures-0.2.17/LICENSE-MIT) |
| Rust | crc32fast | 1.5.2 | MIT OR Apache-2.0 | [source](https://github.com/srijs/rust-crc32fast) | [notice](public/licenses/rust-crc32fast-1.5.2/LICENSE-APACHE), [notice](public/licenses/rust-crc32fast-1.5.2/LICENSE-MIT) |
| Rust | crossbeam-channel | 0.5.17 | MIT OR Apache-2.0 | [source](https://github.com/crossbeam-rs/crossbeam) | [notice](public/licenses/rust-crossbeam-channel-0.5.17/LICENSE-APACHE), [notice](public/licenses/rust-crossbeam-channel-0.5.17/LICENSE-MIT), [notice](public/licenses/rust-crossbeam-channel-0.5.17/LICENSE-THIRD-PARTY) |
| Rust | crossbeam-utils | 0.8.23 | MIT OR Apache-2.0 | [source](https://github.com/crossbeam-rs/crossbeam) | [notice](public/licenses/rust-crossbeam-utils-0.8.23/LICENSE-APACHE), [notice](public/licenses/rust-crossbeam-utils-0.8.23/LICENSE-MIT) |
| Rust | crypto-common | 0.1.7 | MIT OR Apache-2.0 | [source](https://github.com/RustCrypto/traits) | [notice](public/licenses/rust-crypto-common-0.1.7/LICENSE-APACHE), [notice](public/licenses/rust-crypto-common-0.1.7/LICENSE-MIT) |
| Rust | cssparser | 0.36.0 | MPL-2.0 | [source](https://github.com/servo/rust-cssparser) | [notice](public/licenses/rust-cssparser-0.36.0/LICENSE) |
| Rust | cssparser-macros | 0.6.1 | MPL-2.0 | [source](https://github.com/servo/rust-cssparser) | [notice](public/licenses/rust-cssparser-macros-0.6.1/LICENSE) |
| Rust | ctor | 0.8.0 | Apache-2.0 OR MIT | [source](https://github.com/mmastrac/rust-ctor) | [notice](public/licenses/rust-ctor-0.8.0/LICENSE-APACHE), [notice](public/licenses/rust-ctor-0.8.0/LICENSE-MIT) |
| Rust | ctor-proc-macro | 0.0.7 | Apache-2.0 OR MIT | [source](https://github.com/mmastrac/rust-ctor) | [notice](public/licenses/rust-ctor-proc-macro-0.0.7/LICENSE-APACHE), [notice](public/licenses/rust-ctor-proc-macro-0.0.7/LICENSE-MIT) |
| Rust | darling | 0.24.1 | MIT | [source](https://github.com/TedDriggs/darling) | [notice](public/licenses/rust-darling-0.24.1/LICENSE) |
| Rust | darling_core | 0.24.1 | MIT | [source](https://github.com/TedDriggs/darling) | [notice](public/licenses/rust-darling_core-0.24.1/LICENSE) |
| Rust | darling_macro | 0.24.1 | MIT | [source](https://github.com/TedDriggs/darling) | [notice](public/licenses/rust-darling_macro-0.24.1/LICENSE) |
| Rust | defmt | 1.1.1 | MIT OR Apache-2.0 | [source](https://github.com/knurling-rs/defmt) | [notice](public/licenses/rust-defmt-1.1.1/LICENSE-APACHE), [notice](public/licenses/rust-defmt-1.1.1/LICENSE-MIT) |
| Rust | defmt-macros | 1.1.1 | MIT OR Apache-2.0 | [source](https://github.com/knurling-rs/defmt) | [notice](public/licenses/rust-defmt-macros-1.1.1/LICENSE-APACHE), [notice](public/licenses/rust-defmt-macros-1.1.1/LICENSE-MIT) |
| Rust | defmt-parser | 1.0.0 | MIT OR Apache-2.0 | [source](https://github.com/knurling-rs/defmt) | [notice](public/licenses/rust-defmt-parser-1.0.0/LICENSE-APACHE), [notice](public/licenses/rust-defmt-parser-1.0.0/LICENSE-MIT), [notice](public/licenses/rust-defmt-parser-1.0.0/SOURCE.txt) |
| Rust | deranged | 0.5.8 | MIT OR Apache-2.0 | [source](https://github.com/jhpratt/deranged) | [notice](public/licenses/rust-deranged-0.5.8/LICENSE-Apache), [notice](public/licenses/rust-deranged-0.5.8/LICENSE-MIT) |
| Rust | derive_more | 2.1.1 | MIT | [source](https://github.com/JelteF/derive_more) | [notice](public/licenses/rust-derive_more-2.1.1/LICENSE) |
| Rust | derive_more-impl | 2.1.1 | MIT | [source](https://github.com/JelteF/derive_more) | [notice](public/licenses/rust-derive_more-impl-2.1.1/LICENSE) |
| Rust | digest | 0.10.7 | MIT OR Apache-2.0 | [source](https://github.com/RustCrypto/traits) | [notice](public/licenses/rust-digest-0.10.7/LICENSE-APACHE), [notice](public/licenses/rust-digest-0.10.7/LICENSE-MIT) |
| Rust | dirs | 6.0.0 | MIT OR Apache-2.0 | [source](https://github.com/soc/dirs-rs) | [notice](public/licenses/rust-dirs-6.0.0/LICENSE-APACHE), [notice](public/licenses/rust-dirs-6.0.0/LICENSE-MIT) |
| Rust | dirs-sys | 0.5.0 | MIT OR Apache-2.0 | [source](https://github.com/dirs-dev/dirs-sys-rs) | [notice](public/licenses/rust-dirs-sys-0.5.0/LICENSE-APACHE), [notice](public/licenses/rust-dirs-sys-0.5.0/LICENSE-MIT) |
| Rust | displaydoc | 0.2.7 | MIT OR Apache-2.0 | [source](https://github.com/yaahc/displaydoc) | [notice](public/licenses/rust-displaydoc-0.2.7/LICENSE-APACHE), [notice](public/licenses/rust-displaydoc-0.2.7/LICENSE-MIT) |
| Rust | dom_query | 0.27.0 | MIT | [source](https://github.com/niklak/dom_query) | [notice](public/licenses/rust-dom_query-0.27.0/LICENSE) |
| Rust | dpi | 0.1.2 | Apache-2.0 AND MIT | [source](https://github.com/rust-windowing/winit) | [notice](public/licenses/rust-dpi-0.1.2/LICENSE), [notice](public/licenses/rust-dpi-0.1.2/LICENSE-LIBM-MIT) |
| Rust | dtoa | 1.0.11 | MIT OR Apache-2.0 | [source](https://github.com/dtolnay/dtoa) | [notice](public/licenses/rust-dtoa-1.0.11/LICENSE-APACHE), [notice](public/licenses/rust-dtoa-1.0.11/LICENSE-MIT) |
| Rust | dtoa-short | 0.3.5 | MPL-2.0 | [source](https://github.com/upsuper/dtoa-short) | [notice](public/licenses/rust-dtoa-short-0.3.5/LICENSE) |
| Rust | dtor | 0.3.0 | Apache-2.0 OR MIT | [source](https://github.com/mmastrac/rust-ctor) | [notice](public/licenses/rust-dtor-0.3.0/LICENSE-APACHE), [notice](public/licenses/rust-dtor-0.3.0/LICENSE-MIT) |
| Rust | dtor-proc-macro | 0.0.6 | Apache-2.0 OR MIT | [source](https://github.com/mmastrac/rust-ctor) | [notice](public/licenses/rust-dtor-proc-macro-0.0.6/LICENSE-APACHE), [notice](public/licenses/rust-dtor-proc-macro-0.0.6/LICENSE-MIT) |
| Rust | dunce | 1.0.5 | CC0-1.0 OR MIT-0 OR Apache-2.0 | [source](https://gitlab.com/kornelski/dunce) | [notice](public/licenses/rust-dunce-1.0.5/LICENSE) |
| Rust | dyn-clone | 1.0.20 | MIT OR Apache-2.0 | [source](https://github.com/dtolnay/dyn-clone) | [notice](public/licenses/rust-dyn-clone-1.0.20/LICENSE-APACHE), [notice](public/licenses/rust-dyn-clone-1.0.20/LICENSE-MIT) |
| Rust | embed-resource | 3.0.11 | MIT | [source](https://github.com/nabijaczleweli/rust-embed-resource) | [notice](public/licenses/rust-embed-resource-3.0.11/LICENSE) |
| Rust | equivalent | 1.0.2 | Apache-2.0 OR MIT | [source](https://github.com/indexmap-rs/equivalent) | [notice](public/licenses/rust-equivalent-1.0.2/LICENSE-APACHE), [notice](public/licenses/rust-equivalent-1.0.2/LICENSE-MIT) |
| Rust | erased-serde | 0.4.10 | MIT OR Apache-2.0 | [source](https://github.com/dtolnay/erased-serde) | [notice](public/licenses/rust-erased-serde-0.4.10/LICENSE-APACHE), [notice](public/licenses/rust-erased-serde-0.4.10/LICENSE-MIT) |
| Rust | fastrand | 2.5.0 | Apache-2.0 OR MIT | [source](https://github.com/smol-rs/fastrand) | [notice](public/licenses/rust-fastrand-2.5.0/LICENSE-APACHE), [notice](public/licenses/rust-fastrand-2.5.0/LICENSE-MIT) |
| Rust | fdeflate | 0.3.7 | MIT OR Apache-2.0 | [source](https://github.com/image-rs/fdeflate) | [notice](public/licenses/rust-fdeflate-0.3.7/LICENSE-APACHE), [notice](public/licenses/rust-fdeflate-0.3.7/LICENSE-MIT) |
| Rust | find-msvc-tools | 0.1.13 | MIT OR Apache-2.0 | [source](https://github.com/rust-lang/cc-rs) | [notice](public/licenses/rust-find-msvc-tools-0.1.13/LICENSE-APACHE), [notice](public/licenses/rust-find-msvc-tools-0.1.13/LICENSE-MIT) |
| Rust | flate2 | 1.1.10 | MIT OR Apache-2.0 | [source](https://github.com/rust-lang/flate2-rs) | [notice](public/licenses/rust-flate2-1.1.10/LICENSE-APACHE), [notice](public/licenses/rust-flate2-1.1.10/LICENSE-MIT) |
| Rust | fnv | 1.0.7 | Apache-2.0 / MIT | [source](https://github.com/servo/rust-fnv) | [notice](public/licenses/rust-fnv-1.0.7/LICENSE-APACHE), [notice](public/licenses/rust-fnv-1.0.7/LICENSE-MIT) |
| Rust | foldhash | 0.2.0 | Zlib | [source](https://github.com/orlp/foldhash) | [notice](public/licenses/rust-foldhash-0.2.0/LICENSE) |
| Rust | form_urlencoded | 1.2.2 | MIT OR Apache-2.0 | [source](https://github.com/servo/rust-url) | [notice](public/licenses/rust-form_urlencoded-1.2.2/LICENSE-APACHE), [notice](public/licenses/rust-form_urlencoded-1.2.2/LICENSE-MIT) |
| Rust | futures-channel | 0.3.34 | MIT OR Apache-2.0 | [source](https://github.com/rust-lang/futures-rs) | [notice](public/licenses/rust-futures-channel-0.3.34/LICENSE-APACHE), [notice](public/licenses/rust-futures-channel-0.3.34/LICENSE-MIT) |
| Rust | futures-core | 0.3.34 | MIT OR Apache-2.0 | [source](https://github.com/rust-lang/futures-rs) | [notice](public/licenses/rust-futures-core-0.3.34/LICENSE-APACHE), [notice](public/licenses/rust-futures-core-0.3.34/LICENSE-MIT) |
| Rust | futures-io | 0.3.34 | MIT OR Apache-2.0 | [source](https://github.com/rust-lang/futures-rs) | [notice](public/licenses/rust-futures-io-0.3.34/LICENSE-APACHE), [notice](public/licenses/rust-futures-io-0.3.34/LICENSE-MIT) |
| Rust | futures-macro | 0.3.34 | MIT OR Apache-2.0 | [source](https://github.com/rust-lang/futures-rs) | [notice](public/licenses/rust-futures-macro-0.3.34/LICENSE-APACHE), [notice](public/licenses/rust-futures-macro-0.3.34/LICENSE-MIT) |
| Rust | futures-sink | 0.3.34 | MIT OR Apache-2.0 | [source](https://github.com/rust-lang/futures-rs) | [notice](public/licenses/rust-futures-sink-0.3.34/LICENSE-APACHE), [notice](public/licenses/rust-futures-sink-0.3.34/LICENSE-MIT) |
| Rust | futures-task | 0.3.34 | MIT OR Apache-2.0 | [source](https://github.com/rust-lang/futures-rs) | [notice](public/licenses/rust-futures-task-0.3.34/LICENSE-APACHE), [notice](public/licenses/rust-futures-task-0.3.34/LICENSE-MIT) |
| Rust | futures-util | 0.3.34 | MIT OR Apache-2.0 | [source](https://github.com/rust-lang/futures-rs) | [notice](public/licenses/rust-futures-util-0.3.34/LICENSE-APACHE), [notice](public/licenses/rust-futures-util-0.3.34/LICENSE-MIT) |
| Rust | generic-array | 0.14.7 | MIT | [source](https://github.com/fizyk20/generic-array.git) | [notice](public/licenses/rust-generic-array-0.14.7/LICENSE) |
| Rust | getrandom | 0.3.4 | MIT OR Apache-2.0 | [source](https://github.com/rust-random/getrandom) | [notice](public/licenses/rust-getrandom-0.3.4/LICENSE-APACHE), [notice](public/licenses/rust-getrandom-0.3.4/LICENSE-MIT) |
| Rust | getrandom | 0.4.3 | MIT OR Apache-2.0 | [source](https://github.com/rust-random/getrandom) | [notice](public/licenses/rust-getrandom-0.4.3/LICENSE-APACHE), [notice](public/licenses/rust-getrandom-0.4.3/LICENSE-MIT) |
| Rust | glob | 0.3.4 | MIT OR Apache-2.0 | [source](https://github.com/rust-lang/glob) | [notice](public/licenses/rust-glob-0.3.4/LICENSE-APACHE), [notice](public/licenses/rust-glob-0.3.4/LICENSE-MIT) |
| Rust | hashbrown | 0.12.3 | MIT OR Apache-2.0 | [source](https://github.com/rust-lang/hashbrown) | [notice](public/licenses/rust-hashbrown-0.12.3/LICENSE-APACHE), [notice](public/licenses/rust-hashbrown-0.12.3/LICENSE-MIT) |
| Rust | hashbrown | 0.17.1 | MIT OR Apache-2.0 | [source](https://github.com/rust-lang/hashbrown) | [notice](public/licenses/rust-hashbrown-0.17.1/LICENSE-APACHE), [notice](public/licenses/rust-hashbrown-0.17.1/LICENSE-MIT) |
| Rust | heck | 0.5.0 | MIT OR Apache-2.0 | [source](https://github.com/withoutboats/heck) | [notice](public/licenses/rust-heck-0.5.0/LICENSE-APACHE), [notice](public/licenses/rust-heck-0.5.0/LICENSE-MIT) |
| Rust | hex | 0.4.3 | MIT OR Apache-2.0 | [source](https://github.com/KokaKiwi/rust-hex) | [notice](public/licenses/rust-hex-0.4.3/LICENSE-APACHE), [notice](public/licenses/rust-hex-0.4.3/LICENSE-MIT) |
| Rust | html5ever | 0.38.0 | MIT OR Apache-2.0 | [source](https://github.com/servo/html5ever) | [notice](public/licenses/rust-html5ever-0.38.0/LICENSE-APACHE), [notice](public/licenses/rust-html5ever-0.38.0/LICENSE-MIT) |
| Rust | http | 1.5.0 | MIT OR Apache-2.0 | [source](https://github.com/hyperium/http) | [notice](public/licenses/rust-http-1.5.0/LICENSE-APACHE), [notice](public/licenses/rust-http-1.5.0/LICENSE-MIT) |
| Rust | http-body | 1.1.0 | MIT | [source](https://github.com/hyperium/http-body) | [notice](public/licenses/rust-http-body-1.1.0/LICENSE) |
| Rust | http-body-util | 0.1.5 | MIT | [source](https://github.com/hyperium/http-body) | [notice](public/licenses/rust-http-body-util-0.1.5/LICENSE) |
| Rust | httparse | 1.10.1 | MIT OR Apache-2.0 | [source](https://github.com/seanmonstar/httparse) | [notice](public/licenses/rust-httparse-1.10.1/LICENSE-APACHE), [notice](public/licenses/rust-httparse-1.10.1/LICENSE-MIT) |
| Rust | hyper | 1.11.1 | MIT | [source](https://github.com/hyperium/hyper) | [notice](public/licenses/rust-hyper-1.11.1/LICENSE) |
| Rust | hyper-util | 0.1.20 | MIT | [source](https://github.com/hyperium/hyper-util) | [notice](public/licenses/rust-hyper-util-0.1.20/LICENSE) |
| Rust | ico | 0.5.0 | MIT | [source](https://github.com/mdsteele/rust-ico) | [notice](public/licenses/rust-ico-0.5.0/LICENSE) |
| Rust | icu_collections | 2.3.0 | Unicode-3.0 | [source](https://github.com/unicode-org/icu4x) | [notice](public/licenses/rust-icu_collections-2.3.0/LICENSE) |
| Rust | icu_locale_core | 2.3.0 | Unicode-3.0 | [source](https://github.com/unicode-org/icu4x) | [notice](public/licenses/rust-icu_locale_core-2.3.0/LICENSE) |
| Rust | icu_normalizer | 2.3.0 | Unicode-3.0 | [source](https://github.com/unicode-org/icu4x) | [notice](public/licenses/rust-icu_normalizer-2.3.0/LICENSE) |
| Rust | icu_normalizer_data | 2.3.0 | Unicode-3.0 | [source](https://github.com/unicode-org/icu4x) | [notice](public/licenses/rust-icu_normalizer_data-2.3.0/LICENSE) |
| Rust | icu_properties | 2.3.0 | Unicode-3.0 | [source](https://github.com/unicode-org/icu4x) | [notice](public/licenses/rust-icu_properties-2.3.0/LICENSE) |
| Rust | icu_properties_data | 2.3.0 | Unicode-3.0 | [source](https://github.com/unicode-org/icu4x) | [notice](public/licenses/rust-icu_properties_data-2.3.0/LICENSE) |
| Rust | icu_provider | 2.3.1 | Unicode-3.0 | [source](https://github.com/unicode-org/icu4x) | [notice](public/licenses/rust-icu_provider-2.3.1/LICENSE) |
| Rust | ident_case | 1.0.1 | MIT/Apache-2.0 | [source](https://github.com/TedDriggs/ident_case) | [notice](public/licenses/rust-ident_case-1.0.1/LICENSE) |
| Rust | idna | 1.1.0 | MIT OR Apache-2.0 | [source](https://github.com/servo/rust-url/) | [notice](public/licenses/rust-idna-1.1.0/LICENSE-APACHE), [notice](public/licenses/rust-idna-1.1.0/LICENSE-MIT) |
| Rust | idna_adapter | 1.2.2 | Apache-2.0 OR MIT | [source](https://github.com/hsivonen/idna_adapter) | [notice](public/licenses/rust-idna_adapter-1.2.2/LICENSE-APACHE), [notice](public/licenses/rust-idna_adapter-1.2.2/LICENSE-MIT) |
| Rust | indexmap | 1.9.3 | Apache-2.0 OR MIT | [source](https://github.com/bluss/indexmap) | [notice](public/licenses/rust-indexmap-1.9.3/LICENSE-APACHE), [notice](public/licenses/rust-indexmap-1.9.3/LICENSE-MIT) |
| Rust | indexmap | 2.14.2 | Apache-2.0 OR MIT | [source](https://github.com/indexmap-rs/indexmap) | [notice](public/licenses/rust-indexmap-2.14.2/LICENSE-APACHE), [notice](public/licenses/rust-indexmap-2.14.2/LICENSE-MIT) |
| Rust | infer | 0.19.0 | MIT | [source](https://github.com/bojand/infer) | [notice](public/licenses/rust-infer-0.19.0/LICENSE) |
| Rust | ipnet | 2.12.2 | MIT OR Apache-2.0 | [source](https://github.com/krisprice/ipnet) | [notice](public/licenses/rust-ipnet-2.12.2/LICENSE-APACHE), [notice](public/licenses/rust-ipnet-2.12.2/LICENSE-MIT) |
| Rust | itoa | 1.0.18 | MIT OR Apache-2.0 | [source](https://github.com/dtolnay/itoa) | [notice](public/licenses/rust-itoa-1.0.18/LICENSE-APACHE), [notice](public/licenses/rust-itoa-1.0.18/LICENSE-MIT) |
| Rust | jiff | 0.2.37 | Unlicense OR MIT | [source](https://github.com/BurntSushi/jiff) | [notice](public/licenses/rust-jiff-0.2.37/COPYING), [notice](public/licenses/rust-jiff-0.2.37/LICENSE-MIT) |
| Rust | jiff-core | 0.1.1 | Unlicense OR MIT | [source](https://github.com/BurntSushi/jiff) | [notice](public/licenses/rust-jiff-core-0.1.1/COPYING), [notice](public/licenses/rust-jiff-core-0.1.1/LICENSE-MIT) |
| Rust | jiff-tzdb | 0.1.8 | Unlicense OR MIT | [source](https://github.com/BurntSushi/jiff) | [notice](public/licenses/rust-jiff-tzdb-0.1.8/COPYING), [notice](public/licenses/rust-jiff-tzdb-0.1.8/LICENSE-MIT) |
| Rust | jiff-tzdb-platform | 0.1.3 | Unlicense OR MIT | [source](https://github.com/BurntSushi/jiff) | [notice](public/licenses/rust-jiff-tzdb-platform-0.1.3/COPYING), [notice](public/licenses/rust-jiff-tzdb-platform-0.1.3/LICENSE-MIT) |
| Rust | json-patch | 3.0.1 | MIT/Apache-2.0 | [source](https://github.com/idubrov/json-patch) | [notice](public/licenses/rust-json-patch-3.0.1/LICENSE-APACHE), [notice](public/licenses/rust-json-patch-3.0.1/LICENSE-MIT) |
| Rust | jsonptr | 0.6.3 | MIT OR Apache-2.0 | [source](https://github.com/chanced/jsonptr) | [notice](public/licenses/rust-jsonptr-0.6.3/LICENSE-APACHE), [notice](public/licenses/rust-jsonptr-0.6.3/LICENSE-MIT) |
| Rust | keyboard-types | 0.7.0 | MIT OR Apache-2.0 | [source](https://github.com/pyfisch/keyboard-types) | [notice](public/licenses/rust-keyboard-types-0.7.0/LICENSE-APACHE), [notice](public/licenses/rust-keyboard-types-0.7.0/LICENSE-MIT) |
| Rust | libc | 0.2.189 | MIT OR Apache-2.0 | [source](https://github.com/rust-lang/libc) | [notice](public/licenses/rust-libc-0.2.189/LICENSE-APACHE), [notice](public/licenses/rust-libc-0.2.189/LICENSE-MIT) |
| Rust | litemap | 0.8.3 | Unicode-3.0 | [source](https://github.com/unicode-org/icu4x) | [notice](public/licenses/rust-litemap-0.8.3/LICENSE) |
| Rust | lock_api | 0.4.14 | MIT OR Apache-2.0 | [source](https://github.com/Amanieu/parking_lot) | [notice](public/licenses/rust-lock_api-0.4.14/LICENSE-APACHE), [notice](public/licenses/rust-lock_api-0.4.14/LICENSE-MIT) |
| Rust | log | 0.4.34 | MIT OR Apache-2.0 | [source](https://github.com/rust-lang/log) | [notice](public/licenses/rust-log-0.4.34/LICENSE-APACHE), [notice](public/licenses/rust-log-0.4.34/LICENSE-MIT) |
| Rust | markup5ever | 0.38.0 | MIT OR Apache-2.0 | [source](https://github.com/servo/html5ever) | [notice](public/licenses/rust-markup5ever-0.38.0/LICENSE-APACHE), [notice](public/licenses/rust-markup5ever-0.38.0/LICENSE-MIT) |
| Rust | memchr | 2.8.3 | Unlicense OR MIT | [source](https://github.com/BurntSushi/memchr) | [notice](public/licenses/rust-memchr-2.8.3/COPYING), [notice](public/licenses/rust-memchr-2.8.3/LICENSE-MIT) |
| Rust | mime | 0.3.17 | MIT OR Apache-2.0 | [source](https://github.com/hyperium/mime) | [notice](public/licenses/rust-mime-0.3.17/LICENSE-APACHE), [notice](public/licenses/rust-mime-0.3.17/LICENSE-MIT) |
| Rust | miniz_oxide | 0.8.9 | MIT OR Zlib OR Apache-2.0 | [source](https://github.com/Frommi/miniz_oxide/tree/master/miniz_oxide) | [notice](public/licenses/rust-miniz_oxide-0.8.9/LICENSE), [notice](public/licenses/rust-miniz_oxide-0.8.9/LICENSE-APACHE.md), [notice](public/licenses/rust-miniz_oxide-0.8.9/LICENSE-MIT.md), [notice](public/licenses/rust-miniz_oxide-0.8.9/LICENSE-ZLIB.md) |
| Rust | miniz_oxide | 0.9.1 | MIT OR Zlib OR Apache-2.0 | [source](https://github.com/Frommi/miniz_oxide/tree/master/miniz_oxide) | [notice](public/licenses/rust-miniz_oxide-0.9.1/LICENSE), [notice](public/licenses/rust-miniz_oxide-0.9.1/LICENSE-APACHE.md), [notice](public/licenses/rust-miniz_oxide-0.9.1/LICENSE-MIT.md), [notice](public/licenses/rust-miniz_oxide-0.9.1/LICENSE-ZLIB.md) |
| Rust | mio | 1.2.3 | MIT | [source](https://github.com/tokio-rs/mio) | [notice](public/licenses/rust-mio-1.2.3/LICENSE) |
| Rust | muda | 0.19.3 | Apache-2.0 OR MIT | [source](https://github.com/tauri-apps/muda) | [notice](public/licenses/rust-muda-0.19.3/LICENSE-APACHE), [notice](public/licenses/rust-muda-0.19.3/LICENSE-MIT), [notice](public/licenses/rust-muda-0.19.3/LICENSE.spdx) |
| Rust | new_debug_unreachable | 1.0.6 | MIT | [source](https://github.com/mbrubeck/rust-debug-unreachable) | [notice](public/licenses/rust-new_debug_unreachable-1.0.6/LICENSE-MIT) |
| Rust | num-conv | 0.2.2 | MIT OR Apache-2.0 | [source](https://github.com/jhpratt/num-conv) | [notice](public/licenses/rust-num-conv-0.2.2/LICENSE-Apache), [notice](public/licenses/rust-num-conv-0.2.2/LICENSE-MIT) |
| Rust | num-traits | 0.2.19 | MIT OR Apache-2.0 | [source](https://github.com/rust-num/num-traits) | [notice](public/licenses/rust-num-traits-0.2.19/LICENSE-APACHE), [notice](public/licenses/rust-num-traits-0.2.19/LICENSE-MIT) |
| Rust | once_cell | 1.21.4 | MIT OR Apache-2.0 | [source](https://github.com/matklad/once_cell) | [notice](public/licenses/rust-once_cell-1.21.4/LICENSE-APACHE), [notice](public/licenses/rust-once_cell-1.21.4/LICENSE-MIT) |
| Rust | option-ext | 0.2.0 | MPL-2.0 | [source](https://github.com/soc/option-ext.git) | [notice](public/licenses/rust-option-ext-0.2.0/LICENSE.txt) |
| Rust | parking_lot | 0.12.5 | MIT OR Apache-2.0 | [source](https://github.com/Amanieu/parking_lot) | [notice](public/licenses/rust-parking_lot-0.12.5/LICENSE-APACHE), [notice](public/licenses/rust-parking_lot-0.12.5/LICENSE-MIT) |
| Rust | parking_lot_core | 0.9.12 | MIT OR Apache-2.0 | [source](https://github.com/Amanieu/parking_lot) | [notice](public/licenses/rust-parking_lot_core-0.9.12/LICENSE-APACHE), [notice](public/licenses/rust-parking_lot_core-0.9.12/LICENSE-MIT) |
| Rust | percent-encoding | 2.3.2 | MIT OR Apache-2.0 | [source](https://github.com/servo/rust-url/) | [notice](public/licenses/rust-percent-encoding-2.3.2/LICENSE-APACHE), [notice](public/licenses/rust-percent-encoding-2.3.2/LICENSE-MIT) |
| Rust | phf | 0.13.1 | MIT | [source](https://github.com/rust-phf/rust-phf) | [notice](public/licenses/rust-phf-0.13.1/LICENSE) |
| Rust | phf_codegen | 0.13.1 | MIT | [source](https://github.com/rust-phf/rust-phf) | [notice](public/licenses/rust-phf_codegen-0.13.1/LICENSE) |
| Rust | phf_generator | 0.13.1 | MIT | [source](https://github.com/rust-phf/rust-phf) | [notice](public/licenses/rust-phf_generator-0.13.1/LICENSE) |
| Rust | phf_macros | 0.13.1 | MIT | [source](https://github.com/rust-phf/rust-phf) | [notice](public/licenses/rust-phf_macros-0.13.1/LICENSE) |
| Rust | phf_shared | 0.13.1 | MIT | [source](https://github.com/rust-phf/rust-phf) | [notice](public/licenses/rust-phf_shared-0.13.1/LICENSE) |
| Rust | pin-project-lite | 0.2.17 | Apache-2.0 OR MIT | [source](https://github.com/taiki-e/pin-project-lite) | [notice](public/licenses/rust-pin-project-lite-0.2.17/LICENSE-APACHE), [notice](public/licenses/rust-pin-project-lite-0.2.17/LICENSE-MIT) |
| Rust | plist | 1.10.1 | MIT | [source](https://github.com/ebarnard/rust-plist/) | [notice](public/licenses/rust-plist-1.10.1/LICENCE) |
| Rust | png | 0.17.16 | MIT OR Apache-2.0 | [source](https://github.com/image-rs/image-png) | [notice](public/licenses/rust-png-0.17.16/LICENSE-APACHE), [notice](public/licenses/rust-png-0.17.16/LICENSE-MIT) |
| Rust | potential_utf | 0.1.6 | Unicode-3.0 | [source](https://github.com/unicode-org/icu4x) | [notice](public/licenses/rust-potential_utf-0.1.6/LICENSE) |
| Rust | powerfmt | 0.2.0 | MIT OR Apache-2.0 | [source](https://github.com/jhpratt/powerfmt) | [notice](public/licenses/rust-powerfmt-0.2.0/LICENSE-Apache), [notice](public/licenses/rust-powerfmt-0.2.0/LICENSE-MIT) |
| Rust | precomputed-hash | 0.1.1 | MIT | [source](https://github.com/emilio/precomputed-hash) | [notice](public/licenses/rust-precomputed-hash-0.1.1/LICENSE) |
| Rust | proc-macro2 | 1.0.107 | MIT OR Apache-2.0 | [source](https://github.com/dtolnay/proc-macro2) | [notice](public/licenses/rust-proc-macro2-1.0.107/LICENSE-APACHE), [notice](public/licenses/rust-proc-macro2-1.0.107/LICENSE-MIT) |
| Rust | quick-xml | 0.42.0 | MIT | [source](https://github.com/tafia/quick-xml) | [notice](public/licenses/rust-quick-xml-0.42.0/LICENSE-MIT.md) |
| Rust | quote | 1.0.47 | MIT OR Apache-2.0 | [source](https://github.com/dtolnay/quote) | [notice](public/licenses/rust-quote-1.0.47/LICENSE-APACHE), [notice](public/licenses/rust-quote-1.0.47/LICENSE-MIT) |
| Rust | raw-window-handle | 0.6.2 | MIT OR Apache-2.0 OR Zlib | [source](https://github.com/rust-windowing/raw-window-handle) | [notice](public/licenses/rust-raw-window-handle-0.6.2/LICENSE-APACHE.md), [notice](public/licenses/rust-raw-window-handle-0.6.2/LICENSE-MIT.md), [notice](public/licenses/rust-raw-window-handle-0.6.2/LICENSE-ZLIB.md) |
| Rust | ref-cast | 1.0.27 | MIT OR Apache-2.0 | [source](https://github.com/dtolnay/ref-cast) | [notice](public/licenses/rust-ref-cast-1.0.27/LICENSE-APACHE), [notice](public/licenses/rust-ref-cast-1.0.27/LICENSE-MIT) |
| Rust | ref-cast-impl | 1.0.27 | MIT OR Apache-2.0 | [source](https://github.com/dtolnay/ref-cast) | [notice](public/licenses/rust-ref-cast-impl-1.0.27/LICENSE-APACHE), [notice](public/licenses/rust-ref-cast-impl-1.0.27/LICENSE-MIT) |
| Rust | regex | 1.13.1 | MIT OR Apache-2.0 | [source](https://github.com/rust-lang/regex) | [notice](public/licenses/rust-regex-1.13.1/LICENSE-APACHE), [notice](public/licenses/rust-regex-1.13.1/LICENSE-MIT) |
| Rust | regex-automata | 0.4.18 | MIT OR Apache-2.0 | [source](https://github.com/rust-lang/regex) | [notice](public/licenses/rust-regex-automata-0.4.18/LICENSE-APACHE), [notice](public/licenses/rust-regex-automata-0.4.18/LICENSE-MIT) |
| Rust | regex-syntax | 0.8.11 | MIT OR Apache-2.0 | [source](https://github.com/rust-lang/regex) | [notice](public/licenses/rust-regex-syntax-0.8.11/LICENSE-APACHE), [notice](public/licenses/rust-regex-syntax-0.8.11/LICENSE-MIT) |
| Rust | reqwest | 0.12.28 | MIT OR Apache-2.0 | [source](https://github.com/seanmonstar/reqwest) | [notice](public/licenses/rust-reqwest-0.12.28/LICENSE-APACHE), [notice](public/licenses/rust-reqwest-0.12.28/LICENSE-MIT) |
| Rust | rustc_version | 0.4.1 | MIT OR Apache-2.0 | [source](https://github.com/djc/rustc-version-rs) | [notice](public/licenses/rust-rustc_version-0.4.1/LICENSE-APACHE), [notice](public/licenses/rust-rustc_version-0.4.1/LICENSE-MIT) |
| Rust | rustc-hash | 2.1.3 | Apache-2.0 OR MIT | [source](https://github.com/rust-lang/rustc-hash) | [notice](public/licenses/rust-rustc-hash-2.1.3/LICENSE-APACHE), [notice](public/licenses/rust-rustc-hash-2.1.3/LICENSE-MIT) |
| Rust | ryu | 1.0.23 | Apache-2.0 OR BSL-1.0 | [source](https://github.com/dtolnay/ryu) | [notice](public/licenses/rust-ryu-1.0.23/LICENSE-APACHE), [notice](public/licenses/rust-ryu-1.0.23/LICENSE-BOOST) |
| Rust | same-file | 1.0.6 | Unlicense/MIT | [source](https://github.com/BurntSushi/same-file) | [notice](public/licenses/rust-same-file-1.0.6/COPYING), [notice](public/licenses/rust-same-file-1.0.6/LICENSE-MIT) |
| Rust | schemars | 0.8.22 | MIT | [source](https://github.com/GREsau/schemars) | [notice](public/licenses/rust-schemars-0.8.22/LICENSE) |
| Rust | schemars | 0.9.0 | MIT | [source](https://github.com/GREsau/schemars) | [notice](public/licenses/rust-schemars-0.9.0/LICENSE) |
| Rust | schemars | 1.2.2 | MIT | [source](https://github.com/GREsau/schemars) | [notice](public/licenses/rust-schemars-1.2.2/LICENSE) |
| Rust | schemars_derive | 0.8.22 | MIT | [source](https://github.com/GREsau/schemars) | [notice](public/licenses/rust-schemars_derive-0.8.22/LICENSE) |
| Rust | scopeguard | 1.2.0 | MIT OR Apache-2.0 | [source](https://github.com/bluss/scopeguard) | [notice](public/licenses/rust-scopeguard-1.2.0/LICENSE-APACHE), [notice](public/licenses/rust-scopeguard-1.2.0/LICENSE-MIT) |
| Rust | selectors | 0.36.1 | MPL-2.0 | [source](https://github.com/servo/stylo) | [notice](public/licenses/rust-selectors-0.36.1/LICENSE-MPL-2.0.txt), [notice](public/licenses/rust-selectors-0.36.1/NOTICE.txt) |
| Rust | semver | 1.0.28 | MIT OR Apache-2.0 | [source](https://github.com/dtolnay/semver) | [notice](public/licenses/rust-semver-1.0.28/LICENSE-APACHE), [notice](public/licenses/rust-semver-1.0.28/LICENSE-MIT) |
| Rust | serde | 1.0.229 | MIT OR Apache-2.0 | [source](https://github.com/serde-rs/serde) | [notice](public/licenses/rust-serde-1.0.229/LICENSE-APACHE), [notice](public/licenses/rust-serde-1.0.229/LICENSE-MIT) |
| Rust | serde_core | 1.0.229 | MIT OR Apache-2.0 | [source](https://github.com/serde-rs/serde) | [notice](public/licenses/rust-serde_core-1.0.229/LICENSE-APACHE), [notice](public/licenses/rust-serde_core-1.0.229/LICENSE-MIT) |
| Rust | serde_derive | 1.0.229 | MIT OR Apache-2.0 | [source](https://github.com/serde-rs/serde) | [notice](public/licenses/rust-serde_derive-1.0.229/LICENSE-APACHE), [notice](public/licenses/rust-serde_derive-1.0.229/LICENSE-MIT) |
| Rust | serde_derive_internals | 0.29.1 | MIT OR Apache-2.0 | [source](https://github.com/serde-rs/serde) | [notice](public/licenses/rust-serde_derive_internals-0.29.1/LICENSE-APACHE), [notice](public/licenses/rust-serde_derive_internals-0.29.1/LICENSE-MIT) |
| Rust | serde_json | 1.0.151 | MIT OR Apache-2.0 | [source](https://github.com/serde-rs/json) | [notice](public/licenses/rust-serde_json-1.0.151/LICENSE-APACHE), [notice](public/licenses/rust-serde_json-1.0.151/LICENSE-MIT) |
| Rust | serde_repr | 0.1.21 | MIT OR Apache-2.0 | [source](https://github.com/dtolnay/serde-repr) | [notice](public/licenses/rust-serde_repr-0.1.21/LICENSE-APACHE), [notice](public/licenses/rust-serde_repr-0.1.21/LICENSE-MIT) |
| Rust | serde_spanned | 1.1.1 | MIT OR Apache-2.0 | [source](https://github.com/toml-rs/toml) | [notice](public/licenses/rust-serde_spanned-1.1.1/LICENSE-APACHE), [notice](public/licenses/rust-serde_spanned-1.1.1/LICENSE-MIT) |
| Rust | serde_urlencoded | 0.7.1 | MIT/Apache-2.0 | [source](https://github.com/nox/serde_urlencoded) | [notice](public/licenses/rust-serde_urlencoded-0.7.1/LICENSE-APACHE), [notice](public/licenses/rust-serde_urlencoded-0.7.1/LICENSE-MIT) |
| Rust | serde_with | 3.23.0 | MIT OR Apache-2.0 | [source](https://github.com/jonasbb/serde_with/) | [notice](public/licenses/rust-serde_with-3.23.0/LICENSE-APACHE), [notice](public/licenses/rust-serde_with-3.23.0/LICENSE-MIT) |
| Rust | serde_with_macros | 3.23.0 | MIT OR Apache-2.0 | [source](https://github.com/jonasbb/serde_with/) | [notice](public/licenses/rust-serde_with_macros-3.23.0/LICENSE-APACHE), [notice](public/licenses/rust-serde_with_macros-3.23.0/LICENSE-MIT) |
| Rust | serde-untagged | 0.1.9 | MIT OR Apache-2.0 | [source](https://github.com/dtolnay/serde-untagged) | [notice](public/licenses/rust-serde-untagged-0.1.9/LICENSE-APACHE), [notice](public/licenses/rust-serde-untagged-0.1.9/LICENSE-MIT) |
| Rust | serialize-to-javascript | 0.1.2 | MIT OR Apache-2.0 | [source](https://github.com/chippers/serialize-to-javascript) | [notice](public/licenses/rust-serialize-to-javascript-0.1.2/LICENSE-APACHE), [notice](public/licenses/rust-serialize-to-javascript-0.1.2/LICENSE-MIT) |
| Rust | serialize-to-javascript-impl | 0.1.2 | MIT OR Apache-2.0 | [source](https://github.com/chippers/serialize-to-javascript) | [notice](public/licenses/rust-serialize-to-javascript-impl-0.1.2/LICENSE-APACHE), [notice](public/licenses/rust-serialize-to-javascript-impl-0.1.2/LICENSE-MIT) |
| Rust | servo_arc | 0.4.3 | MIT OR Apache-2.0 | [source](https://github.com/servo/stylo) | [notice](public/licenses/rust-servo_arc-0.4.3/LICENSE-APACHE), [notice](public/licenses/rust-servo_arc-0.4.3/LICENSE-MIT) |
| Rust | sha2 | 0.10.9 | MIT OR Apache-2.0 | [source](https://github.com/RustCrypto/hashes) | [notice](public/licenses/rust-sha2-0.10.9/LICENSE-APACHE), [notice](public/licenses/rust-sha2-0.10.9/LICENSE-MIT) |
| Rust | shlex | 2.0.1 | MIT OR Apache-2.0 | [source](https://github.com/comex/rust-shlex) | [notice](public/licenses/rust-shlex-2.0.1/LICENSE-APACHE), [notice](public/licenses/rust-shlex-2.0.1/LICENSE-MIT) |
| Rust | simd-adler32 | 0.3.10 | MIT | [source](https://github.com/mcountryman/simd-adler32) | [notice](public/licenses/rust-simd-adler32-0.3.10/LICENSE.md) |
| Rust | siphasher | 1.0.3 | MIT/Apache-2.0 | [source](https://github.com/jedisct1/rust-siphash) | [notice](public/licenses/rust-siphasher-1.0.3/COPYING) |
| Rust | slab | 0.4.12 | MIT | [source](https://github.com/tokio-rs/slab) | [notice](public/licenses/rust-slab-0.4.12/LICENSE) |
| Rust | smallvec | 1.16.1 | MIT OR Apache-2.0 | [source](https://github.com/servo/rust-smallvec) | [notice](public/licenses/rust-smallvec-1.16.1/LICENSE-APACHE), [notice](public/licenses/rust-smallvec-1.16.1/LICENSE-MIT) |
| Rust | socket2 | 0.6.5 | MIT OR Apache-2.0 | [source](https://github.com/rust-lang/socket2) | [notice](public/licenses/rust-socket2-0.6.5/LICENSE-APACHE), [notice](public/licenses/rust-socket2-0.6.5/LICENSE-MIT) |
| Rust | softbuffer | 0.4.8 | MIT OR Apache-2.0 | [source](https://github.com/rust-windowing/softbuffer) | [notice](public/licenses/rust-softbuffer-0.4.8/LICENSE-APACHE), [notice](public/licenses/rust-softbuffer-0.4.8/LICENSE-MIT) |
| Rust | stable_deref_trait | 1.2.1 | MIT OR Apache-2.0 | [source](https://github.com/storyyeller/stable_deref_trait) | [notice](public/licenses/rust-stable_deref_trait-1.2.1/LICENSE-APACHE), [notice](public/licenses/rust-stable_deref_trait-1.2.1/LICENSE-MIT) |
| Rust | string_cache | 0.9.0 | MIT OR Apache-2.0 | [source](https://github.com/servo/string-cache) | [notice](public/licenses/rust-string_cache-0.9.0/LICENSE-APACHE), [notice](public/licenses/rust-string_cache-0.9.0/LICENSE-MIT) |
| Rust | string_cache_codegen | 0.6.1 | MIT OR Apache-2.0 | [source](https://github.com/servo/string-cache) | [notice](public/licenses/rust-string_cache_codegen-0.6.1/LICENSE-APACHE), [notice](public/licenses/rust-string_cache_codegen-0.6.1/LICENSE-MIT) |
| Rust | strsim | 0.11.1 | MIT | [source](https://github.com/rapidfuzz/strsim-rs) | [notice](public/licenses/rust-strsim-0.11.1/LICENSE) |
| Rust | syn | 2.0.119 | MIT OR Apache-2.0 | [source](https://github.com/dtolnay/syn) | [notice](public/licenses/rust-syn-2.0.119/LICENSE-APACHE), [notice](public/licenses/rust-syn-2.0.119/LICENSE-MIT) |
| Rust | syn | 3.0.6 | MIT OR Apache-2.0 | [source](https://github.com/dtolnay/syn) | [notice](public/licenses/rust-syn-3.0.6/LICENSE-APACHE), [notice](public/licenses/rust-syn-3.0.6/LICENSE-MIT) |
| Rust | sync_wrapper | 1.0.2 | Apache-2.0 | [source](https://github.com/Actyx/sync_wrapper) | [notice](public/licenses/rust-sync_wrapper-1.0.2/LICENSE) |
| Rust | synstructure | 0.14.0 | MIT | [source](https://github.com/mystor/synstructure) | [notice](public/licenses/rust-synstructure-0.14.0/LICENSE) |
| Rust | tao | 0.35.3 | Apache-2.0 | [source](https://github.com/tauri-apps/tao) | [notice](public/licenses/rust-tao-0.35.3/LICENSE), [notice](public/licenses/rust-tao-0.35.3/LICENSE.spdx) |
| Rust | tauri | 2.11.6 | Apache-2.0 OR MIT | [source](https://github.com/tauri-apps/tauri) | [notice](public/licenses/rust-tauri-2.11.6/LICENSE_APACHE-2.0), [notice](public/licenses/rust-tauri-2.11.6/LICENSE_MIT) |
| Rust | tauri-build | 2.6.3 | Apache-2.0 OR MIT | [source](https://github.com/tauri-apps/tauri) | [notice](public/licenses/rust-tauri-build-2.6.3/LICENSE_APACHE-2.0), [notice](public/licenses/rust-tauri-build-2.6.3/LICENSE_MIT) |
| Rust | tauri-codegen | 2.6.3 | Apache-2.0 OR MIT | [source](https://github.com/tauri-apps/tauri) | [notice](public/licenses/rust-tauri-codegen-2.6.3/LICENSE_APACHE-2.0), [notice](public/licenses/rust-tauri-codegen-2.6.3/LICENSE_MIT) |
| Rust | tauri-macros | 2.6.3 | Apache-2.0 OR MIT | [source](https://github.com/tauri-apps/tauri) | [notice](public/licenses/rust-tauri-macros-2.6.3/LICENSE_APACHE-2.0), [notice](public/licenses/rust-tauri-macros-2.6.3/LICENSE_MIT) |
| Rust | tauri-runtime | 2.11.3 | Apache-2.0 OR MIT | [source](https://github.com/tauri-apps/tauri) | [notice](public/licenses/rust-tauri-runtime-2.11.3/LICENSE_APACHE-2.0), [notice](public/licenses/rust-tauri-runtime-2.11.3/LICENSE_MIT) |
| Rust | tauri-runtime-wry | 2.11.4 | Apache-2.0 OR MIT | [source](https://github.com/tauri-apps/tauri) | [notice](public/licenses/rust-tauri-runtime-wry-2.11.4/LICENSE_APACHE-2.0), [notice](public/licenses/rust-tauri-runtime-wry-2.11.4/LICENSE_MIT) |
| Rust | tauri-utils | 2.9.3 | Apache-2.0 OR MIT | [source](https://github.com/tauri-apps/tauri) | [notice](public/licenses/rust-tauri-utils-2.9.3/LICENSE_APACHE-2.0), [notice](public/licenses/rust-tauri-utils-2.9.3/LICENSE_MIT) |
| Rust | tauri-winres | 0.3.6 | MIT | [source](https://github.com/tauri-apps/winres) | [notice](public/licenses/rust-tauri-winres-0.3.6/LICENSE) |
| Rust | tendril | 0.5.1 | MIT OR Apache-2.0 | [source](https://github.com/servo/html5ever) | [notice](public/licenses/rust-tendril-0.5.1/LICENSE-APACHE), [notice](public/licenses/rust-tendril-0.5.1/LICENSE-MIT) |
| Rust | thiserror | 1.0.69 | MIT OR Apache-2.0 | [source](https://github.com/dtolnay/thiserror) | [notice](public/licenses/rust-thiserror-1.0.69/LICENSE-APACHE), [notice](public/licenses/rust-thiserror-1.0.69/LICENSE-MIT) |
| Rust | thiserror | 2.0.20 | MIT OR Apache-2.0 | [source](https://github.com/dtolnay/thiserror) | [notice](public/licenses/rust-thiserror-2.0.20/LICENSE-APACHE), [notice](public/licenses/rust-thiserror-2.0.20/LICENSE-MIT) |
| Rust | thiserror-impl | 1.0.69 | MIT OR Apache-2.0 | [source](https://github.com/dtolnay/thiserror) | [notice](public/licenses/rust-thiserror-impl-1.0.69/LICENSE-APACHE), [notice](public/licenses/rust-thiserror-impl-1.0.69/LICENSE-MIT) |
| Rust | thiserror-impl | 2.0.20 | MIT OR Apache-2.0 | [source](https://github.com/dtolnay/thiserror) | [notice](public/licenses/rust-thiserror-impl-2.0.20/LICENSE-APACHE), [notice](public/licenses/rust-thiserror-impl-2.0.20/LICENSE-MIT) |
| Rust | time | 0.3.55 | MIT OR Apache-2.0 | [source](https://github.com/time-rs/time) | [notice](public/licenses/rust-time-0.3.55/LICENSE-Apache), [notice](public/licenses/rust-time-0.3.55/LICENSE-MIT) |
| Rust | time-core | 0.1.9 | MIT OR Apache-2.0 | [source](https://github.com/time-rs/time) | [notice](public/licenses/rust-time-core-0.1.9/LICENSE-Apache), [notice](public/licenses/rust-time-core-0.1.9/LICENSE-MIT) |
| Rust | time-macros | 0.2.32 | MIT OR Apache-2.0 | [source](https://github.com/time-rs/time) | [notice](public/licenses/rust-time-macros-0.2.32/LICENSE-Apache), [notice](public/licenses/rust-time-macros-0.2.32/LICENSE-MIT) |
| Rust | tinystr | 0.8.4 | Unicode-3.0 | [source](https://github.com/unicode-org/icu4x) | [notice](public/licenses/rust-tinystr-0.8.4/LICENSE) |
| Rust | tinyvec | 1.13.3 | Zlib OR Apache-2.0 OR MIT | [source](https://github.com/Lokathor/tinyvec) | [notice](public/licenses/rust-tinyvec-1.13.3/LICENSE-APACHE.md), [notice](public/licenses/rust-tinyvec-1.13.3/LICENSE-MIT.md), [notice](public/licenses/rust-tinyvec-1.13.3/LICENSE-ZLIB.md) |
| Rust | tokio | 1.53.1 | MIT | [source](https://github.com/tokio-rs/tokio) | [notice](public/licenses/rust-tokio-1.53.1/LICENSE) |
| Rust | tokio-macros | 2.7.2 | MIT | [source](https://github.com/tokio-rs/tokio) | [notice](public/licenses/rust-tokio-macros-2.7.2/LICENSE) |
| Rust | tokio-util | 0.7.19 | MIT | [source](https://github.com/tokio-rs/tokio) | [notice](public/licenses/rust-tokio-util-0.7.19/LICENSE) |
| Rust | toml | 0.9.12+spec-1.1.0 | MIT OR Apache-2.0 | [source](https://github.com/toml-rs/toml) | [notice](public/licenses/rust-toml-0.9.12+spec-1.1.0/LICENSE-APACHE), [notice](public/licenses/rust-toml-0.9.12+spec-1.1.0/LICENSE-MIT) |
| Rust | toml | 1.1.6+spec-1.1.0 | MIT OR Apache-2.0 | [source](https://github.com/toml-rs/toml) | [notice](public/licenses/rust-toml-1.1.6+spec-1.1.0/LICENSE-APACHE), [notice](public/licenses/rust-toml-1.1.6+spec-1.1.0/LICENSE-MIT) |
| Rust | toml_datetime | 0.7.5+spec-1.1.0 | MIT OR Apache-2.0 | [source](https://github.com/toml-rs/toml) | [notice](public/licenses/rust-toml_datetime-0.7.5+spec-1.1.0/LICENSE-APACHE), [notice](public/licenses/rust-toml_datetime-0.7.5+spec-1.1.0/LICENSE-MIT) |
| Rust | toml_datetime | 1.1.1+spec-1.1.0 | MIT OR Apache-2.0 | [source](https://github.com/toml-rs/toml) | [notice](public/licenses/rust-toml_datetime-1.1.1+spec-1.1.0/LICENSE-APACHE), [notice](public/licenses/rust-toml_datetime-1.1.1+spec-1.1.0/LICENSE-MIT) |
| Rust | toml_parser | 1.1.3+spec-1.1.0 | MIT OR Apache-2.0 | [source](https://github.com/toml-rs/toml) | [notice](public/licenses/rust-toml_parser-1.1.3+spec-1.1.0/LICENSE-APACHE), [notice](public/licenses/rust-toml_parser-1.1.3+spec-1.1.0/LICENSE-MIT) |
| Rust | toml_writer | 1.1.2+spec-1.1.0 | MIT OR Apache-2.0 | [source](https://github.com/toml-rs/toml) | [notice](public/licenses/rust-toml_writer-1.1.2+spec-1.1.0/LICENSE-APACHE), [notice](public/licenses/rust-toml_writer-1.1.2+spec-1.1.0/LICENSE-MIT) |
| Rust | tower | 0.5.3 | MIT | [source](https://github.com/tower-rs/tower) | [notice](public/licenses/rust-tower-0.5.3/LICENSE) |
| Rust | tower-http | 0.6.11 | MIT | [source](https://github.com/tower-rs/tower-http) | [notice](public/licenses/rust-tower-http-0.6.11/LICENSE) |
| Rust | tower-layer | 0.3.3 | MIT | [source](https://github.com/tower-rs/tower) | [notice](public/licenses/rust-tower-layer-0.3.3/LICENSE) |
| Rust | tower-service | 0.3.3 | MIT | [source](https://github.com/tower-rs/tower) | [notice](public/licenses/rust-tower-service-0.3.3/LICENSE) |
| Rust | tracing | 0.1.44 | MIT | [source](https://github.com/tokio-rs/tracing) | [notice](public/licenses/rust-tracing-0.1.44/LICENSE) |
| Rust | tracing-core | 0.1.36 | MIT | [source](https://github.com/tokio-rs/tracing) | [notice](public/licenses/rust-tracing-core-0.1.36/LICENSE) |
| Rust | tray-icon | 0.24.2 | MIT OR Apache-2.0 | [source](https://github.com/tauri-apps/tray-icon) | [notice](public/licenses/rust-tray-icon-0.24.2/LICENSE-APACHE), [notice](public/licenses/rust-tray-icon-0.24.2/LICENSE-MIT), [notice](public/licenses/rust-tray-icon-0.24.2/LICENSE.spdx) |
| Rust | try-lock | 0.2.5 | MIT | [source](https://github.com/seanmonstar/try-lock) | [notice](public/licenses/rust-try-lock-0.2.5/LICENSE) |
| Rust | typeid | 1.0.3 | MIT OR Apache-2.0 | [source](https://github.com/dtolnay/typeid) | [notice](public/licenses/rust-typeid-1.0.3/LICENSE-APACHE), [notice](public/licenses/rust-typeid-1.0.3/LICENSE-MIT) |
| Rust | typenum | 1.20.1 | MIT OR Apache-2.0 | [source](https://github.com/paholg/typenum) | [notice](public/licenses/rust-typenum-1.20.1/LICENSE), [notice](public/licenses/rust-typenum-1.20.1/LICENSE-APACHE), [notice](public/licenses/rust-typenum-1.20.1/LICENSE-MIT) |
| Rust | unic-char-property | 0.9.0 | MIT/Apache-2.0 | [source](https://github.com/open-i18n/rust-unic/) | [notice](public/licenses/rust-unic-char-property-0.9.0/LICENSE-APACHE), [notice](public/licenses/rust-unic-char-property-0.9.0/LICENSE-MIT), [notice](public/licenses/rust-unic-char-property-0.9.0/SOURCE.txt) |
| Rust | unic-char-range | 0.9.0 | MIT/Apache-2.0 | [source](https://github.com/open-i18n/rust-unic/) | [notice](public/licenses/rust-unic-char-range-0.9.0/LICENSE-APACHE), [notice](public/licenses/rust-unic-char-range-0.9.0/LICENSE-MIT), [notice](public/licenses/rust-unic-char-range-0.9.0/SOURCE.txt) |
| Rust | unic-common | 0.9.0 | MIT/Apache-2.0 | [source](https://github.com/open-i18n/rust-unic/) | [notice](public/licenses/rust-unic-common-0.9.0/LICENSE-APACHE), [notice](public/licenses/rust-unic-common-0.9.0/LICENSE-MIT), [notice](public/licenses/rust-unic-common-0.9.0/SOURCE.txt) |
| Rust | unic-ucd-ident | 0.9.0 | MIT/Apache-2.0 | [source](https://github.com/open-i18n/rust-unic/) | [notice](public/licenses/rust-unic-ucd-ident-0.9.0/LICENSE-APACHE), [notice](public/licenses/rust-unic-ucd-ident-0.9.0/LICENSE-MIT), [notice](public/licenses/rust-unic-ucd-ident-0.9.0/SOURCE.txt) |
| Rust | unic-ucd-version | 0.9.0 | MIT/Apache-2.0 | [source](https://github.com/open-i18n/rust-unic/) | [notice](public/licenses/rust-unic-ucd-version-0.9.0/LICENSE-APACHE), [notice](public/licenses/rust-unic-ucd-version-0.9.0/LICENSE-MIT), [notice](public/licenses/rust-unic-ucd-version-0.9.0/SOURCE.txt) |
| Rust | unicode-ident | 1.0.26 | (MIT OR Apache-2.0) AND Unicode-3.0 | [source](https://github.com/dtolnay/unicode-ident) | [notice](public/licenses/rust-unicode-ident-1.0.26/LICENSE-APACHE), [notice](public/licenses/rust-unicode-ident-1.0.26/LICENSE-MIT), [notice](public/licenses/rust-unicode-ident-1.0.26/LICENSE-UNICODE) |
| Rust | unicode-segmentation | 1.13.3 | MIT OR Apache-2.0 | [source](https://github.com/unicode-rs/unicode-segmentation) | [notice](public/licenses/rust-unicode-segmentation-1.13.3/COPYRIGHT), [notice](public/licenses/rust-unicode-segmentation-1.13.3/LICENSE-APACHE), [notice](public/licenses/rust-unicode-segmentation-1.13.3/LICENSE-MIT) |
| Rust | url | 2.5.8 | MIT OR Apache-2.0 | [source](https://github.com/servo/rust-url) | [notice](public/licenses/rust-url-2.5.8/LICENSE-APACHE), [notice](public/licenses/rust-url-2.5.8/LICENSE-MIT) |
| Rust | urlpattern | 0.3.0 | MIT | [source](https://github.com/denoland/rust-urlpattern) | [notice](public/licenses/rust-urlpattern-0.3.0/LICENSE) |
| Rust | utf8_iter | 1.0.4 | Apache-2.0 OR MIT | [source](https://github.com/hsivonen/utf8_iter) | [notice](public/licenses/rust-utf8_iter-1.0.4/COPYRIGHT), [notice](public/licenses/rust-utf8_iter-1.0.4/LICENSE-APACHE), [notice](public/licenses/rust-utf8_iter-1.0.4/LICENSE-MIT) |
| Rust | uuid | 1.26.1 | Apache-2.0 OR MIT | [source](https://github.com/uuid-rs/uuid) | [notice](public/licenses/rust-uuid-1.26.1/LICENSE-APACHE), [notice](public/licenses/rust-uuid-1.26.1/LICENSE-MIT) |
| Rust | version_check | 0.9.5 | MIT/Apache-2.0 | [source](https://github.com/SergioBenitez/version_check) | [notice](public/licenses/rust-version_check-0.9.5/LICENSE-APACHE), [notice](public/licenses/rust-version_check-0.9.5/LICENSE-MIT) |
| Rust | vswhom | 0.1.0 | MIT | [source](https://github.com/nabijaczleweli/vswhom.rs) | [notice](public/licenses/rust-vswhom-0.1.0/LICENSE) |
| Rust | vswhom-sys | 0.1.3 | MIT | [source](https://github.com/nabijaczleweli/vswhom-sys.rs) | [notice](public/licenses/rust-vswhom-sys-0.1.3/LICENSE) |
| Rust | walkdir | 2.5.0 | Unlicense/MIT | [source](https://github.com/BurntSushi/walkdir) | [notice](public/licenses/rust-walkdir-2.5.0/COPYING), [notice](public/licenses/rust-walkdir-2.5.0/LICENSE-MIT) |
| Rust | want | 0.3.1 | MIT | [source](https://github.com/seanmonstar/want) | [notice](public/licenses/rust-want-0.3.1/LICENSE) |
| Rust | web_atoms | 0.2.6 | MIT OR Apache-2.0 | [source](https://github.com/servo/html5ever) | [notice](public/licenses/rust-web_atoms-0.2.6/LICENSE-APACHE), [notice](public/licenses/rust-web_atoms-0.2.6/LICENSE-MIT) |
| Rust | webview2-com | 0.38.2 | MIT | [source](https://github.com/wravery/webview2-rs) | [notice](public/licenses/rust-webview2-com-0.38.2/LICENSE), [notice](public/licenses/rust-webview2-com-0.38.2/SOURCE.txt) |
| Rust | webview2-com-macros | 0.8.1 | MIT | [source](https://github.com/wravery/webview2-rs) | [notice](public/licenses/rust-webview2-com-macros-0.8.1/LICENSE), [notice](public/licenses/rust-webview2-com-macros-0.8.1/SOURCE.txt) |
| Rust | webview2-com-sys | 0.38.2 | MIT | [source](https://github.com/wravery/webview2-rs) | [notice](public/licenses/rust-webview2-com-sys-0.38.2/LICENSE), [notice](public/licenses/rust-webview2-com-sys-0.38.2/SOURCE.txt) |
| Rust | winapi-util | 0.1.11 | Unlicense OR MIT | [source](https://github.com/BurntSushi/winapi-util) | [notice](public/licenses/rust-winapi-util-0.1.11/COPYING), [notice](public/licenses/rust-winapi-util-0.1.11/LICENSE-MIT) |
| Rust | window-vibrancy | 0.6.0 | Apache-2.0 OR MIT | [source](https://github.com/tauri-apps/tauri-plugin-vibrancy) | [notice](public/licenses/rust-window-vibrancy-0.6.0/LICENSE-APACHE), [notice](public/licenses/rust-window-vibrancy-0.6.0/LICENSE-MIT), [notice](public/licenses/rust-window-vibrancy-0.6.0/LICENSE.spdx) |
| Rust | windows | 0.61.3 | MIT OR Apache-2.0 | [source](https://github.com/microsoft/windows-rs) | [notice](public/licenses/rust-windows-0.61.3/license-apache-2.0), [notice](public/licenses/rust-windows-0.61.3/license-mit) |
| Rust | windows_x86_64_msvc | 0.52.6 | MIT OR Apache-2.0 | [source](https://github.com/microsoft/windows-rs) | [notice](public/licenses/rust-windows_x86_64_msvc-0.52.6/license-apache-2.0), [notice](public/licenses/rust-windows_x86_64_msvc-0.52.6/license-mit) |
| Rust | windows-collections | 0.2.0 | MIT OR Apache-2.0 | [source](https://github.com/microsoft/windows-rs) | [notice](public/licenses/rust-windows-collections-0.2.0/license-apache-2.0), [notice](public/licenses/rust-windows-collections-0.2.0/license-mit) |
| Rust | windows-core | 0.61.2 | MIT OR Apache-2.0 | [source](https://github.com/microsoft/windows-rs) | [notice](public/licenses/rust-windows-core-0.61.2/license-apache-2.0), [notice](public/licenses/rust-windows-core-0.61.2/license-mit) |
| Rust | windows-future | 0.2.1 | MIT OR Apache-2.0 | [source](https://github.com/microsoft/windows-rs) | [notice](public/licenses/rust-windows-future-0.2.1/license-apache-2.0), [notice](public/licenses/rust-windows-future-0.2.1/license-mit) |
| Rust | windows-implement | 0.60.2 | MIT OR Apache-2.0 | [source](https://github.com/microsoft/windows-rs) | [notice](public/licenses/rust-windows-implement-0.60.2/license-apache-2.0), [notice](public/licenses/rust-windows-implement-0.60.2/license-mit) |
| Rust | windows-interface | 0.59.3 | MIT OR Apache-2.0 | [source](https://github.com/microsoft/windows-rs) | [notice](public/licenses/rust-windows-interface-0.59.3/license-apache-2.0), [notice](public/licenses/rust-windows-interface-0.59.3/license-mit) |
| Rust | windows-link | 0.1.3 | MIT OR Apache-2.0 | [source](https://github.com/microsoft/windows-rs) | [notice](public/licenses/rust-windows-link-0.1.3/license-apache-2.0), [notice](public/licenses/rust-windows-link-0.1.3/license-mit) |
| Rust | windows-link | 0.2.1 | MIT OR Apache-2.0 | [source](https://github.com/microsoft/windows-rs) | [notice](public/licenses/rust-windows-link-0.2.1/license-apache-2.0), [notice](public/licenses/rust-windows-link-0.2.1/license-mit) |
| Rust | windows-numerics | 0.2.0 | MIT OR Apache-2.0 | [source](https://github.com/microsoft/windows-rs) | [notice](public/licenses/rust-windows-numerics-0.2.0/license-apache-2.0), [notice](public/licenses/rust-windows-numerics-0.2.0/license-mit) |
| Rust | windows-result | 0.3.4 | MIT OR Apache-2.0 | [source](https://github.com/microsoft/windows-rs) | [notice](public/licenses/rust-windows-result-0.3.4/license-apache-2.0), [notice](public/licenses/rust-windows-result-0.3.4/license-mit) |
| Rust | windows-strings | 0.4.2 | MIT OR Apache-2.0 | [source](https://github.com/microsoft/windows-rs) | [notice](public/licenses/rust-windows-strings-0.4.2/license-apache-2.0), [notice](public/licenses/rust-windows-strings-0.4.2/license-mit) |
| Rust | windows-sys | 0.59.0 | MIT OR Apache-2.0 | [source](https://github.com/microsoft/windows-rs) | [notice](public/licenses/rust-windows-sys-0.59.0/license-apache-2.0), [notice](public/licenses/rust-windows-sys-0.59.0/license-mit) |
| Rust | windows-sys | 0.61.2 | MIT OR Apache-2.0 | [source](https://github.com/microsoft/windows-rs) | [notice](public/licenses/rust-windows-sys-0.61.2/license-apache-2.0), [notice](public/licenses/rust-windows-sys-0.61.2/license-mit) |
| Rust | windows-targets | 0.52.6 | MIT OR Apache-2.0 | [source](https://github.com/microsoft/windows-rs) | [notice](public/licenses/rust-windows-targets-0.52.6/license-apache-2.0), [notice](public/licenses/rust-windows-targets-0.52.6/license-mit) |
| Rust | windows-threading | 0.1.0 | MIT OR Apache-2.0 | [source](https://github.com/microsoft/windows-rs) | [notice](public/licenses/rust-windows-threading-0.1.0/license-apache-2.0), [notice](public/licenses/rust-windows-threading-0.1.0/license-mit) |
| Rust | windows-version | 0.1.7 | MIT OR Apache-2.0 | [source](https://github.com/microsoft/windows-rs) | [notice](public/licenses/rust-windows-version-0.1.7/license-apache-2.0), [notice](public/licenses/rust-windows-version-0.1.7/license-mit) |
| Rust | winnow | 0.7.15 | MIT | [source](https://github.com/winnow-rs/winnow) | [notice](public/licenses/rust-winnow-0.7.15/LICENSE-MIT) |
| Rust | winnow | 1.0.4 | MIT | [source](https://github.com/winnow-rs/winnow) | [notice](public/licenses/rust-winnow-1.0.4/LICENSE-MIT) |
| Rust | winreg | 0.55.0 | MIT | [source](https://github.com/gentoo90/winreg-rs) | [notice](public/licenses/rust-winreg-0.55.0/LICENSE) |
| Rust | writeable | 0.6.4 | Unicode-3.0 | [source](https://github.com/unicode-org/icu4x) | [notice](public/licenses/rust-writeable-0.6.4/LICENSE) |
| Rust | wry | 0.55.1 | Apache-2.0 OR MIT | [source](https://github.com/tauri-apps/wry) | [notice](public/licenses/rust-wry-0.55.1/LICENSE-APACHE), [notice](public/licenses/rust-wry-0.55.1/LICENSE-MIT), [notice](public/licenses/rust-wry-0.55.1/LICENSE.spdx) |
| Rust | yoke | 0.8.3 | Unicode-3.0 | [source](https://github.com/unicode-org/icu4x) | [notice](public/licenses/rust-yoke-0.8.3/LICENSE) |
| Rust | yoke-derive | 0.8.3 | Unicode-3.0 | [source](https://github.com/unicode-org/icu4x) | [notice](public/licenses/rust-yoke-derive-0.8.3/LICENSE) |
| Rust | zerofrom | 0.1.8 | Unicode-3.0 | [source](https://github.com/unicode-org/icu4x) | [notice](public/licenses/rust-zerofrom-0.1.8/LICENSE) |
| Rust | zerofrom-derive | 0.1.8 | Unicode-3.0 | [source](https://github.com/unicode-org/icu4x) | [notice](public/licenses/rust-zerofrom-derive-0.1.8/LICENSE) |
| Rust | zerotrie | 0.2.5 | Unicode-3.0 | [source](https://github.com/unicode-org/icu4x) | [notice](public/licenses/rust-zerotrie-0.2.5/LICENSE) |
| Rust | zerovec | 0.11.8 | Unicode-3.0 | [source](https://github.com/unicode-org/icu4x) | [notice](public/licenses/rust-zerovec-0.11.8/LICENSE) |
| Rust | zerovec-derive | 0.11.6 | Unicode-3.0 | [source](https://github.com/unicode-org/icu4x) | [notice](public/licenses/rust-zerovec-derive-0.11.6/LICENSE) |
| Rust | zlib-rs | 0.6.8 | Zlib | [source](https://github.com/trifectatechfoundation/zlib-rs) | [notice](public/licenses/rust-zlib-rs-0.6.8/LICENSE) |
| Rust | zmij | 1.0.23 | MIT | [source](https://github.com/dtolnay/zmij) | [notice](public/licenses/rust-zmij-1.0.23/LICENSE-MIT) |
