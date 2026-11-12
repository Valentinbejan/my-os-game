import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, delimiter, dirname } from 'node:path';
const env = { ...process.env };
const cargo = resolve('.tools/cargo');
const rustup = resolve('.tools/rustup');
if (existsSync(cargo)) {
  env.CARGO_HOME = cargo;
  env.RUSTUP_HOME = rustup;
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'Path';
  env[pathKey] = [resolve(cargo, 'bin'), dirname(process.execPath), env[pathKey] || ''].join(
    delimiter,
  );
}
const cli = resolve('node_modules/@tauri-apps/cli/tauri.js');
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 1));
