import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, '..');
const nextBin = path.join(packageDir, 'node_modules', 'next', 'dist', 'bin', 'next');

function getRuntimeDataDir() {
  if (process.env.CONTEXTSELECTOR_DATA_DIR?.trim()) {
    return path.resolve(process.env.CONTEXTSELECTOR_DATA_DIR);
  }

  if (process.env.XDG_DATA_HOME?.trim()) {
    return path.join(process.env.XDG_DATA_HOME, 'contextselector');
  }

  return path.join(os.homedir(), '.contextselector');
}

function ensureAuthSecret(dataDir) {
  const secretFile = path.join(dataDir, 'auth-secret');

  if (fs.existsSync(secretFile)) {
    return fs.readFileSync(secretFile, 'utf8').trim();
  }

  const secret = crypto.randomBytes(32).toString('base64url');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(secretFile, `${secret}\n`, { mode: 0o600 });
  return secret;
}

function runCommand(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: packageDir,
      stdio: 'inherit',
      env,
    });

    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }

      resolve(code ?? 0);
    });
  });
}

async function main() {
  const dataDir = getRuntimeDataDir();
  const env = {
    ...process.env,
    CONTEXTSELECTOR_DATA_DIR: dataDir,
    CONTEXTSELECTOR_AUTH_SECRET: ensureAuthSecret(dataDir),
  };

  const initExitCode = await runCommand(process.execPath, ['scripts/init-db.mjs'], env);
  if (initExitCode !== 0) {
    process.exit(initExitCode);
  }

  const nextExitCode = await runCommand(process.execPath, [nextBin, ...process.argv.slice(2)], env);
  process.exit(nextExitCode);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
