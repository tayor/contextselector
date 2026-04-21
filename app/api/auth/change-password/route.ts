import { NextRequest, NextResponse } from 'next/server';
import { changePassword, getAuthCookie } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { currentPassword, newPassword } = await request.json();
    
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { message: 'Current password and new password are required' },
        { status: 400 }
      );
    }
    
    const username = await getAuthCookie();
    
    if (!username) {
      return NextResponse.json(
        { message: 'Not authenticated' },
        { status: 401 }
      );
    }
    
    const success = await changePassword(username, currentPassword, newPassword);
    
    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { message: 'Current password is incorrect' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json(
      { message: 'An error occurred while changing password' },
      { status: 500 }
    );
  }
} 
