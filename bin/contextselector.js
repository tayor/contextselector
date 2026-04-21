#!/usr/bin/env node

const { spawn } = require('child_process');
const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3001;
const SCRIPT_DIR = path.dirname(fs.realpathSync(__filename));
const PACKAGE_DIR = path.resolve(SCRIPT_DIR, '..');
const NEXT_BIN = path.join(PACKAGE_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');
const PACKAGE_JSON = require(path.join(PACKAGE_DIR, 'package.json'));
const RUNTIME_SOURCE_ENTRIES = [
  'app',
  'components',
  'lib',
  'utils',
  'types',
  'scripts',
  'assets',
  'proxy.ts',
  'next.config.mjs',
  'next-env.d.ts',
  'postcss.config.mjs',
  'tailwind.config.ts',
  'tsconfig.json',
  'components.json',
  'package.json',
];

function getDefaultDataDir() {
  if (process.env.CONTEXTSELECTOR_DATA_DIR && process.env.CONTEXTSELECTOR_DATA_DIR.trim()) {
    return path.resolve(process.env.CONTEXTSELECTOR_DATA_DIR);
  }

  if (process.env.XDG_DATA_HOME && process.env.XDG_DATA_HOME.trim()) {
    return path.join(process.env.XDG_DATA_HOME, 'contextselector');
  }

  return path.join(os.homedir(), '.contextselector');
}

function printHelp() {
  console.log(`Context Selector

Usage:
  contextselector [workspace] [options]

Arguments:
  workspace              Directory to open. Defaults to the current directory.

Options:
  -p, --port <port>      Preferred port for the local server (default: ${DEFAULT_PORT})
  -H, --host <host>      Host interface to bind (default: ${DEFAULT_HOST})
      --data-dir <path>  Directory for the SQLite database and runtime data
      --open             Open the app in your browser after launch (default)
      --no-open          Do not open the browser automatically
  -h, --help             Show this help message
`);
}

function parsePort(value) {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

function parseArgs(argv) {
  const options = {
    workspace: process.cwd(),
    host: process.env.CONTEXTSELECTOR_HOST || DEFAULT_HOST,
    port: process.env.CONTEXTSELECTOR_PORT ? parsePort(process.env.CONTEXTSELECTOR_PORT) : DEFAULT_PORT,
    dataDir: getDefaultDataDir(),
    open: process.env.CONTEXTSELECTOR_NO_BROWSER !== '1',
  };

  let workspaceProvided = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    }

    if (arg === '-p' || arg === '--port') {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`${arg} requires a value`);
      }
      options.port = parsePort(argv[index]);
      continue;
    }

    if (arg === '-H' || arg === '--host') {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`${arg} requires a value`);
      }
      options.host = argv[index];
      continue;
    }

    if (arg === '--data-dir') {
      index += 1;
      if (index >= argv.length) {
        throw new Error('--data-dir requires a value');
      }
      options.dataDir = path.resolve(argv[index]);
      continue;
    }

    if (arg === '--open') {
      options.open = true;
      continue;
    }

    if (arg === '--no-open') {
      options.open = false;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (!workspaceProvided) {
      options.workspace = path.resolve(arg);
      workspaceProvided = true;
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  return options;
}

function checkPortAvailability(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port, host);
  });
}

async function findAvailablePort(startingPort, host) {
  let port = startingPort;

  for (let attempts = 0; attempts < 20; attempts += 1) {
    const isAvailable = await checkPortAvailability(port, host);
    if (isAvailable) {
      return port;
    }
    port += 1;
  }

  throw new Error(`Could not find an available port starting from ${startingPort}`);
}

function openBrowser(url) {
  let command;
  let args;

  if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (process.platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });

  child.on('error', () => {});
  child.unref();
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

function ensureRuntimeApp(dataDir) {
  const runtimeDir = path.join(dataDir, 'runtime-app');
  const versionFile = path.join(runtimeDir, '.contextselector-version');
  const runtimeNodeModules = path.join(runtimeDir, 'node_modules');
  const installedVersion = PACKAGE_JSON.version;
  const currentVersion = fs.existsSync(versionFile)
    ? fs.readFileSync(versionFile, 'utf8').trim()
    : '';

  if (currentVersion !== installedVersion || !fs.existsSync(runtimeNodeModules)) {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
    fs.mkdirSync(runtimeDir, { recursive: true });

    for (const entry of RUNTIME_SOURCE_ENTRIES) {
      const sourcePath = path.join(PACKAGE_DIR, entry);
      const targetPath = path.join(runtimeDir, entry);
      fs.cpSync(sourcePath, targetPath, { recursive: true });
    }

    fs.cpSync(path.join(PACKAGE_DIR, 'node_modules'), runtimeNodeModules, { recursive: true });

    fs.writeFileSync(versionFile, installedVersion);
  }

  return runtimeDir;
}

function runNextCommand(args, env, cwd) {
  const nextBin = path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next');

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [nextBin, ...args], {
      cwd,
      stdio: 'inherit',
      env,
    });

    child.on('close', (code) => {
      resolve(code ?? 0);
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const workspacePath = path.resolve(options.workspace);

  if (!fs.existsSync(workspacePath)) {
    console.error(`Error: Path does not exist: ${workspacePath}`);
    process.exit(1);
  }

  if (!fs.statSync(workspacePath).isDirectory()) {
    console.error(`Error: Path is not a directory: ${workspacePath}`);
    process.exit(1);
  }

  if (!fs.existsSync(NEXT_BIN)) {
    console.error('Error: Next.js runtime is missing from this installation.');
    process.exit(1);
  }

  const requestedPort = options.port;
  const port = await findAvailablePort(requestedPort, options.host);
  const url = `http://${options.host}:${port}`;
  const firstRun = !fs.existsSync(path.join(options.dataDir, 'mydatabase.db'));
  const runtimeDir = ensureRuntimeApp(options.dataDir);
  const runtimeBuildId = path.join(runtimeDir, '.next', 'BUILD_ID');

  process.env.CONTEXTSELECTOR_WORKSPACE = workspacePath;
  process.env.CONTEXTSELECTOR_DATA_DIR = options.dataDir;
  process.env.CONTEXTSELECTOR_AUTH_SECRET = ensureAuthSecret(options.dataDir);
  process.env.PORT = String(port);
  process.env.HOSTNAME = options.host;
  process.env.NODE_ENV = 'production';

  console.log('\nContext Selector');
  console.log(`Workspace: ${workspacePath}`);
  console.log(`Data directory: ${options.dataDir}`);
  if (requestedPort !== port) {
    console.log(`Port ${requestedPort} is busy, using ${port} instead.`);
  }
  console.log(`URL: ${url}`);
  if (firstRun) {
    console.log('First-run login: admin / 123456');
  }
  if (!fs.existsSync(runtimeBuildId)) {
    console.log('Preparing local app build for this installation...\n');
    const buildExitCode = await runNextCommand(['build', '--webpack'], process.env, runtimeDir);
    if (buildExitCode !== 0) {
      process.exit(buildExitCode);
    }
  }
  console.log('Press Ctrl+C to stop.\n');

  const runtimeNextBin = path.join(runtimeDir, 'node_modules', 'next', 'dist', 'bin', 'next');

  const server = spawn(process.execPath, [runtimeNextBin, 'start', '--hostname', options.host, '--port', String(port)], {
    cwd: runtimeDir,
    stdio: 'inherit',
    env: process.env,
  });

  if (options.open) {
    setTimeout(() => {
      openBrowser(url);
    }, 1500);
  }

  process.on('SIGINT', () => {
    server.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    server.kill('SIGTERM');
  });

  server.on('close', (code) => {
    process.exit(code || 0);
  });
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
