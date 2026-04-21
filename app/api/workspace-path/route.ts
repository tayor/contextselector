import { NextResponse } from 'next/server';
import { getWorkspaceRoot } from '@/lib/workspace';

// Force dynamic to read env var at runtime, not build time
export const dynamic = 'force-dynamic';

export async function GET() {
  const workspacePath = getWorkspaceRoot();
  return NextResponse.json({ path: workspacePath });
}
