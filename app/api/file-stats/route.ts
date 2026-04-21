export const dynamic = 'force-dynamic'; // Force dynamic rendering

import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceStats, WorkspacePathError } from '@/lib/workspace';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const { stats } = await getWorkspaceStats(searchParams.get('path'));
    return NextResponse.json({
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      size: stats.size,
    });
  } catch (error) {
    if (error instanceof WorkspacePathError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('Error in /api/file-stats:', error);
    return NextResponse.json(
      { error: 'Failed to get file stats' },
      { status: 500 }
    );
  }
}
