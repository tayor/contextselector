import { NextRequest, NextResponse } from 'next/server';
import { verifyUser, setAuthCookie } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();
    
    if (!username || !password) {
      return NextResponse.json(
        { message: 'Username and password are required' },
        { status: 400 }
      );
    }
    
    const isVerified = await verifyUser(username, password);
    
    if (isVerified) {
      await setAuthCookie(username);
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { message: 'Invalid username or password' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { message: 'An error occurred during login' },
      { status: 500 }
    );
  }
} 
