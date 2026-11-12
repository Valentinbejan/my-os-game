// The itch.io edition: the game and the one model it plays with (MiniCPM5-2B on the CPU
// build of llama.cpp), with nothing for developers. Written to release/itch/SIGNAL91; push
// that folder with butler (see docs/RELEASE_ITCH.md).
//
//   npm run build            first, for src-tauri/target/release/signal-91.exe
//   npm run package:itch
import {
  cp,
  copyFile,
  link,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

const MODEL = 'MiniCPM5-2B-Q4_K_M.gguf';
const destination = resolve('release/itch/SIGNAL91');
const executable = 'src-tauri/target/release/signal-91.exe';
const runtime = resolve('.tools/llama');
const weights = resolve('.tools/models', MODEL);
for (const needed of [executable, join(runtime, 'llama-server.exe'), weights])
  if (!existsSync(needed)) throw new Error('Missing ' + needed);

await rm(destination, { recursive: true, force: true });
const model = join(destination, 'model');
await mkdir(join(model, 'llama'), { recursive: true });
await copyFile(executable, join(destination, 'SIGNAL91.exe'));

// The server and the libraries it loads (every CPU variant, down to plain SSE4.2), nothing else.
await cp(runtime, join(model, 'llama'), {
  recursive: true,
  filter: (path) =>
    path === runtime ||
    /^llama-server(\.exe|-impl\.dll)$/i.test(basename(path)) ||
    (/\.dll$/i.test(basename(path)) && !/-impl\.dll$/i.test(basename(path))),
});
await copyFile('third_party/llm/LICENSE-llama.cpp.txt', join(model, 'llama/LICENSE-llama.cpp.txt'));
await copyFile(
  'third_party/llm/LICENSE-LLVM-OpenMP.txt',
  join(model, 'llama/LICENSE-LLVM-OpenMP.txt'),
);
await copyFile('third_party/llm/MINICPM2-MODEL-CARD.md', join(model, 'MINICPM2-MODEL-CARD.md'));
await copyFile('third_party/llm/LICENSE-Apache-2.0.txt', join(model, 'LICENSE-Apache-2.0.txt'));
await copyFile('third_party/llm/NOTICE.txt', join(model, 'NOTICE.txt'));
// A hard link shares the weights with .tools instead of storing 1.5 GB twice.
await link(weights, join(model, MODEL)).catch(() => copyFile(weights, join(model, MODEL)));

// The notices, without the models and runtimes this edition leaves out.
const leftOut =
  /^- (Retained model|Horizon runtime|Bonsai runtime|Model: Huihui|Upstream derivative)/;
const notices = (await readFile('public/THIRD_PARTY_NOTICES.md', 'utf8'))
  .split('\n')
  .filter((line) => !leftOut.test(line))
  .join('\n')
  .replace(
    /These live in `\.tools\/` during development and in the release folder's `model\/` directory\./,
    "The model and its runtime are in the game folder's `model/` directory.",
  );
await writeFile(join(destination, 'THIRD_PARTY_NOTICES.md'), notices);
await cp('public/licenses', join(destination, 'licenses'), { recursive: true });
await mkdir(join(destination, 'audio'), { recursive: true });
for (const name of ['ASSETS.md', 'source-checksums.json'])
  await copyFile(join('public/audio', name), join(destination, 'audio', name));

await writeFile(join(destination, 'README.txt'), await readFile('docs/PLAYER_README.txt', 'utf8'));
// The itch app launches the game itself, not the model server beside it.
await writeFile(
  join(destination, '.itch.toml'),
  '[[actions]]\nname = "play"\npath = "SIGNAL91.exe"\n',
);

const sha256 = (file) =>
  new Promise((done, fail) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => done(hash.digest('hex')))
      .on('error', fail);
  });
const sums = [];
for (const file of ['SIGNAL91.exe', `model/${MODEL}`])
  sums.push(`${await sha256(join(destination, file))}  ${file}`);
await writeFile(join(destination, 'SHA256SUMS.txt'), sums.join('\n') + '\n');

let bytes = 0;
let files = 0;
const walk = async (dir) => {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) await walk(path);
    else {
      bytes += (await stat(path)).size;
      files++;
    }
  }
};
await walk(destination);
console.log(
  JSON.stringify(
    { folder: destination, files, megabytes: Math.round(bytes / 1048576), sha256: sums },
    null,
    2,
  ),
);
