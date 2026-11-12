import { readFileSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = readFileSync('.tools/downloads/IFM-llama-k2-source-path.txt', 'utf8').trim();
const build = resolve('.tools/llama-k2-build-clean');
const destination = resolve('.tools/llama-k2');
// MSBuild treats Path and PATH as the same variable. Some shells export both.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'path'),
);
env.Path = process.env.Path || process.env.PATH || '';
function run(args) {
  const result = spawnSync('cmake', args, { env, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) throw new Error(`cmake failed (${result.status ?? result.error})`);
}
run([
  '-S',
  source,
  '-B',
  build,
  '-G',
  'Visual Studio 17 2022',
  '-A',
  'x64',
  '-DGGML_CUDA=OFF',
  '-DLLAMA_CURL=OFF',
  '-DLLAMA_BUILD_TESTS=OFF',
  '-DLLAMA_BUILD_EXAMPLES=OFF',
  '-DLLAMA_SERVER=ON',
]);
run(['--build', build, '--config', 'Release', '--target', 'llama-server', '--parallel', '6']);
const bin = join(build, 'bin', 'Release');
mkdirSync(destination, { recursive: true });
for (const name of readdirSync(bin)) {
  if (
    /^(llama-server(\.exe|-impl\.dll)|[^/]+\.dll)$/i.test(name) &&
    statSync(join(bin, name)).isFile()
  ) {
    copyFileSync(join(bin, name), join(destination, name));
  }
}
console.log(`K2 Horizon runtime installed at ${destination}`);
