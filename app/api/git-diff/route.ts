export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getWorkspaceRoot } from '@/lib/workspace';

const execFileAsync = promisify(execFile);

export async function GET() {
  try {
    const cwd = getWorkspaceRoot();
    
    const { stdout } = await execFileAsync(
      'git',
      ['diff', '--no-color', '--no-ext-diff'],
      { cwd, maxBuffer: 10 * 1024 * 1024 }
    );

    return NextResponse.json({ diff: stdout });
  } catch (error) {
    const errorCode = String((error as { code?: string | number }).code ?? '');
    if (errorCode === '128' || errorCode === 'ENOENT') {
      return NextResponse.json({ diff: '' });
    }

    console.error('Error in /api/git-diff:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get git diff' },
      { status: 500 }
    );
  }
} 
