export const dynamic = 'force-dynamic'; // Force dynamic rendering

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import { getWorkspaceStats, WorkspacePathError } from '@/lib/workspace';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const { resolvedPath: filePath, stats } = await getWorkspaceStats(searchParams.get('path'));

    // Return empty content for directories
    if (stats.isDirectory()) {
      return NextResponse.json({ content: '' });
    }

    // Don't try to read symbolic links
    if (stats.isSymbolicLink()) {
      return NextResponse.json(
        { error: 'Path is a symbolic link' },
        { status: 400 }
      );
    }

    // Check if file is too large (e.g., over 1MB)
    if (stats.size > 1024 * 1024) {
      // For CSV files, read just the first few lines instead of returning an error
      if (filePath.toLowerCase().endsWith('.csv')) {
        try {
          // Read just the first 10KB of the file to get the header and a few rows
          const buffer = Buffer.alloc(10 * 1024); // 10KB buffer
          const handle = await fs.open(filePath, 'r');
          try {
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
            const partialContent = buffer.subarray(0, bytesRead).toString('utf-8');
            const lines = partialContent.split('\n');
            const headerAndSomeRows = lines.slice(0, 20).join('\n'); // Get header and up to 20 rows

            return NextResponse.json({
              content: headerAndSomeRows,
              truncated: true,
              totalSize: stats.size
            });
          } finally {
            await handle.close();
          }
        } catch (csvError) {
          console.error('Error reading partial CSV file:', csvError);
          // Fall through to the regular error case
        }
      }

      return NextResponse.json(
        { error: 'File is too large to display' },
        { status: 400 }
      );
    }

    const content = await fs.readFile(filePath, 'utf-8');
    return NextResponse.json({ content });
  } catch (error) {
    if (error instanceof WorkspacePathError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('Error in /api/file-content:', error);
    return NextResponse.json(
      { error: 'Failed to read file' },
      { status: 500 }
    );
  }
}
