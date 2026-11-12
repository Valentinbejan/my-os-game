import { cp, copyFile, link, mkdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, basename, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const destination = resolve('release/SIGNAL91');
await mkdir(destination, { recursive: true });
await copyFile('src-tauri/target/release/signal-91.exe', join(destination, 'SIGNAL91.exe'));
await copyFile('PLAY.md', join(destination, 'README.md'));
await copyFile('README.md', join(destination, 'DEVELOPMENT.md'));
await copyFile('VERIFICATION.md', join(destination, 'VERIFICATION.md'));
await copyFile('public/THIRD_PARTY_NOTICES.md', join(destination, 'THIRD_PARTY_NOTICES.md'));
await cp('public/licenses', join(destination, 'licenses'), { recursive: true });
await cp('public/audio', join(destination, 'audio'), { recursive: true });
await mkdir(join(destination, 'docs'), { recursive: true });
await copyFile('docs/BONSAI_SETUP.md', join(destination, 'docs/BONSAI_SETUP.md'));
await copyFile('docs/HORIZON_SETUP.md', join(destination, 'docs/HORIZON_SETUP.md'));
await copyFile('docs/MINICPM2_SETUP.md', join(destination, 'docs/MINICPM2_SETUP.md'));
// The game starts the local model from model/ beside the executable and stops it on exit.
const profiles = [
  { folder: 'llama', file: 'MiniCPM5-2B-Q4_K_M.gguf' },
  { folder: 'llama-k2', file: 'K2-Horizon-4B-Q4_K_M.gguf' },
  { folder: 'llama-prism', file: 'Ternary-Bonsai-2-27B-Abliterated-PTQ1_0.gguf' },
  { folder: 'llama', file: 'Huihui-MiniCPM5-1B-abliterated.Q4_K_M.gguf' },
];
const bundledModels = [];
const copiedRuntimes = new Set();
for (const profile of profiles) {
  const runtime = resolve('.tools', profile.folder);
  const weights = resolve('.tools/models', profile.file);
  if (!existsSync(join(runtime, 'llama-server.exe')) || !existsSync(weights)) continue;
  const model = join(destination, 'model');
  const runtimeTarget = resolve(model, profile.folder);
  if (!runtimeTarget.startsWith(destination + sep)) throw new Error('Invalid runtime destination');
  if (!copiedRuntimes.has(profile.folder)) {
    // Only the server and the libraries it loads; the other llama.cpp tools are not needed.
    await rm(runtimeTarget, { recursive: true, force: true });
    await cp(runtime, runtimeTarget, {
      recursive: true,
      filter: (path) =>
        path === runtime ||
        /^llama-server(\.exe|-impl\.dll)$/i.test(basename(path)) ||
        (/\.dll$/i.test(basename(path)) && !/-impl\.dll$/i.test(basename(path))),
    });
    copiedRuntimes.add(profile.folder);
  }
  if (profile.folder === 'llama-k2') {
    await cp(
      'third_party/llm/LICENSE-IFM-llama.cpp.txt',
      join(runtimeTarget, 'LICENSE-llama.cpp.txt'),
    );
    await cp('third_party/llm/HORIZON-MODEL-CARD.md', join(model, 'HORIZON-MODEL-CARD.md'));
  } else if (profile.folder === 'llama-prism') {
    await cp(
      'third_party/llm/LICENSE-Prism-llama.cpp.txt',
      join(runtimeTarget, 'LICENSE-llama.cpp.txt'),
    );
    await cp(
      'third_party/llm/LICENSE-NVIDIA-CUDA-12.4.html',
      join(runtimeTarget, 'LICENSE-NVIDIA-CUDA-12.4.html'),
    );
    await cp('third_party/llm/BONSAI-MODEL-CARD.md', join(model, 'BONSAI-MODEL-CARD.md'));
  } else {
    await cp('third_party/llm/LICENSE-llama.cpp.txt', join(runtimeTarget, 'LICENSE-llama.cpp.txt'));
    await cp(
      'third_party/llm/LICENSE-LLVM-OpenMP.txt',
      join(runtimeTarget, 'LICENSE-LLVM-OpenMP.txt'),
    );
    if (profile.file === 'MiniCPM5-2B-Q4_K_M.gguf')
      await cp('third_party/llm/MINICPM2-MODEL-CARD.md', join(model, 'MINICPM2-MODEL-CARD.md'));
  }
  await cp('third_party/llm/LICENSE-Apache-2.0.txt', join(model, 'LICENSE-Apache-2.0.txt'));
  await cp('third_party/llm/NOTICE.txt', join(model, 'NOTICE.txt'));
  const target = join(model, basename(weights));
  if (!existsSync(target) || (await stat(target)).size !== (await stat(weights)).size) {
    await rm(target, { force: true });
    // A hard link shares the immutable weights with .tools instead of storing them twice.
    await link(weights, target).catch(() => copyFile(weights, target));
  }
  bundledModels.push(profile.file);
}
await writeFile(
  join(destination, 'Start with small model.cmd'),
  '@echo off\r\nset "SIGNAL91_MODEL=small"\r\nstart "" "%~dp0SIGNAL91.exe"\r\n',
);
await writeFile(
  join(destination, 'Start with Bonsai model.cmd'),
  '@echo off\r\nset "SIGNAL91_MODEL=bonsai"\r\nstart "" "%~dp0SIGNAL91.exe"\r\n',
);
await writeFile(
  join(destination, 'Start with Horizon model.cmd'),
  '@echo off\r\nset "SIGNAL91_MODEL=horizon"\r\nstart "" "%~dp0SIGNAL91.exe"\r\n',
);
const file = join(destination, 'SIGNAL91.exe');
const checksum = createHash('sha256')
  .update(await readFile(file))
  .digest('hex');
await writeFile(join(destination, 'SHA256SUMS.txt'), checksum + '  SIGNAL91.exe\n');
console.log(
  JSON.stringify(
    {
      folder: destination,
      executableBytes: (await stat(file)).size,
      sha256: checksum,
      bundledModels,
    },
    null,
    2,
  ),
);
