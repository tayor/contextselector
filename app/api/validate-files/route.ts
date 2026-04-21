import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { resolveWorkspacePath, WorkspacePathError } from '@/lib/workspace';

export async function POST(request: NextRequest) {
  try {
    const { files } = await request.json();
    
    if (!Array.isArray(files)) {
      return NextResponse.json({ error: 'Files must be an array' }, { status: 400 });
    }

    const validationResults = await Promise.all(files.map(async (filePath) => {
      try {
        const resolvedPath = resolveWorkspacePath(typeof filePath === 'string' ? filePath : '');
        const stats = await fs.lstat(resolvedPath);
        if (stats.isFile() && !stats.isSymbolicLink()) {
          return resolvedPath;
        }
        return null;
      } catch (error) {
        if (!(error instanceof WorkspacePathError)) {
          console.error(`Error validating file ${filePath}:`, error);
        }

        // Skip invalid files
        return null;
      }
    }));

    return NextResponse.json({ validFiles: validationResults.filter((filePath): filePath is string => filePath !== null) });
  } catch (error) {
    console.error('Error in validate-files route:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}
