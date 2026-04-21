import fs from 'fs';
import os from 'os';
import path from 'path';

const APP_NAME = 'contextselector';

export function getRuntimeDataDir() {
  const configuredDir = process.env.CONTEXTSELECTOR_DATA_DIR?.trim();

  if (configuredDir) {
    return path.resolve(configuredDir);
  }

  if (process.env.XDG_DATA_HOME?.trim()) {
    return path.join(process.env.XDG_DATA_HOME, APP_NAME);
  }

  return path.join(os.homedir(), `.${APP_NAME}`);
}

export function ensureRuntimeDataDir() {
  const dataDir = getRuntimeDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

export function getDbPath() {
  return path.join(ensureRuntimeDataDir(), 'mydatabase.db');
}
