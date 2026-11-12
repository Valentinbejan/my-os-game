import {
  readFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve, join, dirname, delimiter } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = process.cwd(),
  out = resolve('public/licenses');
mkdirSync(out, { recursive: true });
const safe = (value) => value.replace(/[^a-zA-Z0-9._-]/g, '_');
const rows = [];
function collect(directory, id) {
  const destination = join(out, id);
  mkdirSync(destination, { recursive: true });
  const copied = [];
  function scan(dir, prefix = '', depth = 0) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (item.isDirectory() && depth < 2 && /^(licenses?|legal)$/i.test(item.name))
        scan(join(dir, item.name), prefix + item.name + '-', depth + 1);
      if (
        item.isFile() &&
        (/^(license|licence|copying|notice|copyright|ofl)([._-]|$)/i.test(item.name) || depth > 0)
      ) {
        const target = prefix + item.name;
        copyFileSync(join(dir, item.name), join(destination, target));
        copied.push(target);
      }
    }
  }
  scan(directory);
  return (
    [...new Set([...copied, ...readdirSync(destination)])]
      .map((name) => '[notice](public/licenses/' + id + '/' + name + ')')
      .join(', ') || 'License expression in manifest; see source'
  );
}
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
for (const [location, entry] of Object.entries(lock.packages)) {
  if (!location) continue;
  const manifestPath = join(root, location, 'package.json');
  if (!existsSync(manifestPath)) continue;
  const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const id = 'npm-' + safe(pkg.name) + '-' + pkg.version;
  const source =
    typeof pkg.repository === 'string'
      ? pkg.repository
      : pkg.repository?.url || 'https://www.npmjs.com/package/' + pkg.name;
  const license =
    typeof pkg.license === 'string'
      ? pkg.license
      : JSON.stringify(pkg.license || entry.license || 'UNSPECIFIED');
  rows.push(['npm', pkg.name, pkg.version, license, source, collect(dirname(manifestPath), id)]);
}
const env = {
  ...process.env,
  CARGO_HOME: resolve('.tools/cargo'),
  RUSTUP_HOME: resolve('.tools/rustup'),
};
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'Path';
env[pathKey] = resolve('.tools/cargo/bin') + delimiter + (env[pathKey] || '');
const cargo = resolve('.tools/cargo/bin/cargo.exe');
const metadata = JSON.parse(
  execFileSync(
    cargo,
    [
      'metadata',
      '--manifest-path',
      'src-tauri/Cargo.toml',
      '--locked',
      '--filter-platform',
      'x86_64-pc-windows-msvc',
      '--format-version',
      '1',
    ],
    { env, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  ),
);
const reachable = new Set();
const nodes = new Map(metadata.resolve.nodes.map((n) => [n.id, n]));
function visit(id) {
  if (reachable.has(id)) return;
  reachable.add(id);
  for (const dep of nodes.get(id)?.deps || []) visit(dep.pkg);
}
visit(metadata.resolve.root);
for (const pkg of metadata.packages) {
  if (!pkg.source || !reachable.has(pkg.id)) continue;
  rows.push([
    'Rust',
    pkg.name,
    pkg.version,
    pkg.license || 'SEE LICENSE FILE',
    pkg.repository || 'https://crates.io/crates/' + pkg.name,
    collect(dirname(pkg.manifest_path), 'rust-' + safe(pkg.name) + '-' + pkg.version),
  ]);
}
rows.sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1]));
let text = `# Third-party notices
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
These live in \`.tools/\` during development and in the release folder's \`model/\` directory. They are not embedded in the executable; SIGNAL91.exe starts the server on 127.0.0.1 when it opens and stops it when it closes. License texts are in \`third_party/llm/\` and are copied beside them.

- Default model: MiniCPM5-2B-Q4_K_M.gguf, 1,561,318,368 bytes, Apache-2.0. [OpenBMB model card](https://huggingface.co/openbmb/MiniCPM5-2B-GGUF); SHA-256: ec2d5801640099e97d8d7e8003ad4d81f336e757811f03a26173dddf386602fd. Runs with the standard llama.cpp server below.
- Retained model: K2-Horizon-4B-Q4_K_M.gguf, 3,156,598,144 bytes, Apache-2.0. [IFM model card](https://huggingface.co/IFM/K2-Horizon-3.7B-GGUF); SHA-256: 07773aed93890d4f5d08b421430000d5c8d73cefc74fbdc32e67d820f23207b2. The GGUF embeds a K2 Horizon chat template.
- Horizon runtime: [IFM llama.cpp fork](https://github.com/MBZUAI-IFM/llama.cpp/tree/model/K2Horizon), commit 42adf019f76013dac873b5b43950d54d5ab27216, built locally for Windows x64 CPU with AVX2. K2 Horizon support is not yet in standard llama.cpp. MIT text: \`model/llama-k2/LICENSE-llama.cpp.txt\`.
- Retained model: Ternary-Bonsai-2-27B-Abliterated-PTQ1_0.gguf, 5,946,648,928 bytes, Apache-2.0. [BoldingBuilds model card](https://huggingface.co/BoldingBuilds/Ternary-Bonsai-2-27B-Abliterated-PTQ1_0-GGUF); derived from prism-ml/Ternary-Bonsai-2-27B-gguf. SHA-256: 94dd53cbad55db5a515f245887c9f0317484502a451ccc0424c7d7788b52900a.
- Bonsai runtime: [PrismML llama.cpp prism-b10709-9a9394a](https://github.com/PrismML-Eng/llama.cpp/releases/tag/prism-b10709-9a9394a), Windows x64 CUDA 12.4; MIT license retained in model/llama-prism/LICENSE-llama.cpp.txt. Its CUDA runtime, cuBLAS and cuBLASLt libraries are NVIDIA components; [CUDA 12.4 license terms](https://docs.nvidia.com/cuda/archive/12.4.0/eula/index.html) retained in model/llama-prism/LICENSE-NVIDIA-CUDA-12.4.html. The small MiniCPM CPU model below remains the fallback.
- Model: Huihui-MiniCPM5-1B-abliterated.Q4_K_M.gguf, quantized by mradermacher, 688067040 bytes. [Quantization source and Apache-2.0 model card](https://huggingface.co/mradermacher/Huihui-MiniCPM5-1B-abliterated-GGUF).
- Upstream derivative: huihui-ai/Huihui-MiniCPM5-1B-abliterated. [Source](https://huggingface.co/huihui-ai/Huihui-MiniCPM5-1B-abliterated). Base model: openbmb/MiniCPM5-1B. Apache-2.0 text: \`model/LICENSE-Apache-2.0.txt\`.
- llama.cpp: b10964, selected by v0.4.1 nightly-tag.txt; ggml contributors / Georgi Gerganov and contributors, MIT. [Exact runtime source](https://github.com/ggml-org/llama.cpp/tree/b10964). CPU build: llama-server.exe and its DLLs, copyright (c) 2023-2026 The ggml authors; MIT text: \`model/llama/LICENSE-llama.cpp.txt\`. Its libomp.dll is the LLVM OpenMP runtime: \`model/llama/LICENSE-LLVM-OpenMP.txt\`.
- Microsoft WebView2 and Windows system runtime: installed platform prerequisites supplied by Microsoft, not redistributed here.
- FFmpeg 8.1.2: build-time audio conversion only; no executable or library is bundled. Source WAV masters and source archives are excluded.

## Dependency inventory
| Ecosystem | Component | Version | License | Source | Preserved texts |
| --- | --- | --- | --- | --- | --- |
`;
for (const row of rows)
  text +=
    '| ' +
    row
      .map((value, index) =>
        index === 4
          ? '[source](' + value.replace(/^git\+/, '').replace(/^git:\/\//, 'https://') + ')'
          : String(value).replace(/\|/g, '\\|'),
      )
      .join(' | ') +
    ' |\n';
writeFileSync('THIRD_PARTY_NOTICES.md', text);
writeFileSync(
  join(out, 'DEPENDENCIES.json'),
  JSON.stringify(
    rows.map(([ecosystem, name, version, license, source]) => ({
      ecosystem,
      name,
      version,
      license,
      source,
    })),
    null,
    2,
  ),
);
writeFileSync('public/THIRD_PARTY_NOTICES.md', text.replaceAll('(public/', '('));
console.log('Recorded ' + rows.length + ' dependencies with supplied license texts.');
