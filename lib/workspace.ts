import fs from 'fs/promises';
import path from 'path';

export class WorkspacePathError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'WorkspacePathError';
    this.status = status;
  }
}

export function getWorkspaceRoot() {
  return path.resolve(process.env.CONTEXTSELECTOR_WORKSPACE || process.cwd());
}

export function isPathWithinWorkspace(candidatePath: string, workspaceRoot = getWorkspaceRoot()) {
  const relativePath = path.relative(workspaceRoot, candidatePath);

  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

export function resolveWorkspacePath(requestedPath: string | null | undefined) {
  if (!requestedPath?.trim()) {
    throw new WorkspacePathError('Path parameter is required');
  }

  const resolvedPath = path.resolve(requestedPath);
  const workspaceRoot = getWorkspaceRoot();

  if (!isPathWithinWorkspace(resolvedPath, workspaceRoot)) {
    throw new WorkspacePathError('Requested path is outside the workspace', 403);
  }

  return resolvedPath;
}

export async function getWorkspaceStats(requestedPath: string | null | undefined) {
  const resolvedPath = resolveWorkspacePath(requestedPath);

  try {
    const stats = await fs.lstat(resolvedPath);
    return { resolvedPath, stats };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new WorkspacePathError('Path does not exist', 404);
    }

    throw error;
  }
}
