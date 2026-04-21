export const dynamic = 'force-dynamic'; // Force dynamic rendering

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { FileNode } from '@/types/files';
import ignore from 'ignore';
import {
  getWorkspaceRoot,
  isPathWithinWorkspace,
  resolveWorkspacePath,
  WorkspacePathError,
} from '@/lib/workspace';

// Helper to check if we have read permission
const hasReadPermission = async (path: string): Promise<boolean> => {
  try {
    await fs.promises.access(path, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

// Helper to get all .gitignore files in the hierarchy
const getGitignoreRules = async (startPath: string, workspaceRoot: string): Promise<string[]> => {
  const rules: string[] = [];
  let currentDir = startPath;

  while (true) {
    const gitignorePath = path.join(currentDir, '.gitignore');
    try {
      const content = await fs.promises.readFile(gitignorePath, 'utf-8');
      rules.push(content);
    } catch {
      // Ignore missing .gitignore files
    }

    if (currentDir === workspaceRoot) {
      break;
    }

    currentDir = path.dirname(currentDir);
  }
  return rules.reverse(); // Start from root and work downwards
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dirPath = searchParams.get('path');
    const depth = parseInt(searchParams.get('depth') || '1', 10);
    const respectGitignore = searchParams.get('respectGitignore') === 'true';
    const showHiddenFiles = searchParams.get('showHiddenFiles') === 'true';

    if (!dirPath) {
      return NextResponse.json({ error: 'Path parameter is required' }, { status: 400 });
    }

    const normalizedPath = resolveWorkspacePath(dirPath);
    const workspaceRoot = getWorkspaceRoot();

    // Check if path exists and is accessible
    if (!(await hasReadPermission(normalizedPath))) {
      return NextResponse.json({ error: 'Path does not exist or is not accessible' }, { status: 404 });
    }

    // Initialize ignore instance with all gitignore rules (conditionally)
    let gitignore: ReturnType<typeof ignore>; // Use proper type from 'ignore' package
    if (respectGitignore) {
      const gitignoreRules = await getGitignoreRules(normalizedPath, workspaceRoot);
      gitignore = ignore().add(gitignoreRules.join('\n'));
    } else {
      gitignore = ignore(); // An empty ignore instance that ignores nothing
    }

    const getFileNode = async (filePath: string, currentDepth: number, visitedPaths = new Set<string>()): Promise<FileNode | null> => {
      try {
        // Skip if we don't have permission or if it's outside the workspace
        if (!(await hasReadPermission(filePath)) || !isPathWithinWorkspace(filePath, workspaceRoot)) {
          return null;
        }

        // Check if we've already visited this path to prevent loops
        if (visitedPaths.has(filePath)) {
          return null;
        }

        // Check if the file/directory is ignored by .gitignore
        const relativePath = path.relative(normalizedPath, filePath);
        if (relativePath && (gitignore.ignores(relativePath) || gitignore.ignores(relativePath + '/'))) {
          return null;
        }

        const stats = await fs.promises.lstat(filePath);
        const name = path.basename(filePath);
        visitedPaths.add(filePath);

        if (stats.isDirectory() && !stats.isSymbolicLink()) {
          try {
            const entries = await fs.promises.readdir(filePath);
            let filteredEntries = entries.filter(entry => entry !== 'node_modules');

            if (!showHiddenFiles) {
                filteredEntries = filteredEntries.filter(entry => !entry.startsWith('.'));
            }

            filteredEntries = filteredEntries.filter(entry => {
                const entryPath = path.relative(normalizedPath, path.join(filePath, entry));
                return !gitignore.ignores(entryPath) && !gitignore.ignores(entryPath + '/');
            });
            
            // Check if directory has any valid children
            const hasChildren = filteredEntries.length > 0;
            
            // If we've reached max depth, return directory with empty children array
            if (depth !== -1 && currentDepth >= depth) {
              return {
                name,
                path: filePath,
                type: 'directory',
                hasChildren,
                children: []
              };
            }

            // Otherwise, recursively get children
            const children = await Promise.all(
              filteredEntries.map(async entry => {
                const childPath = path.join(filePath, entry);
                return await getFileNode(childPath, currentDepth + 1, new Set(visitedPaths));
              })
            );

            return {
              name,
              path: filePath,
              type: 'directory',
              hasChildren,
              children: children
                .filter((child): child is FileNode => child !== null)
                .sort((a, b) => {
                  if (a.type !== b.type) {
                    return a.type === 'directory' ? -1 : 1;
                  }
                  return a.name.localeCompare(b.name);
                })
            };
          } catch (error) {
            console.error(`Error reading directory ${filePath}:`, error);
            return {
              name,
              path: filePath,
              type: 'directory',
              hasChildren: false,
              children: []
            };
          }
        } else if (stats.isFile()) {
          return {
            name,
            path: filePath,
            type: 'file'
          };
        }

        return null;
      } catch (error) {
        console.error(`Error processing ${filePath}:`, error);
        return null;
      }
    };

    const fileNode = await getFileNode(normalizedPath, 0);
    if (!fileNode) {
      return NextResponse.json({ error: 'Failed to read directory' }, { status: 500 });
    }

    return NextResponse.json(fileNode);
  } catch (error) {
    if (error instanceof WorkspacePathError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('Error in /api/files:', error);
    return NextResponse.json(
      { error: 'Failed to read directory' },
      { status: 500 }
    );
  }
}
