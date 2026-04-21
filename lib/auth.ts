import { cookies } from 'next/headers';
import { openDb } from './db';
import bcrypt from 'bcryptjs';
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_TTL_SECONDS,
  createAuthToken,
  verifyAuthToken,
} from './authSession';

// Verify username and password
export async function verifyUser(username: string, password: string): Promise<boolean> {
  const db = await openDb();
  
  try {
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    
    if (!user) {
      return false;
    }
    
    return bcrypt.compare(password, user.password);
  } catch (error) {
    console.error('Error verifying user:', error);
    return false;
  } finally {
    await db.close();
  }
}

// Set authentication cookie
export async function setAuthCookie(username: string) {
  const cookieStore = await cookies();
  const expiry = new Date();
  expiry.setTime(expiry.getTime() + AUTH_COOKIE_TTL_SECONDS * 1000);
  
  cookieStore.set(AUTH_COOKIE_NAME, await createAuthToken(username), {
    httpOnly: true,
    expires: expiry,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
}

// Get current authenticated user
export async function getAuthCookie() {
  const cookieStore = await cookies();
  return verifyAuthToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
}

// Clear auth cookie (logout)
export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

// Change password
export async function changePassword(username: string, currentPassword: string, newPassword: string): Promise<boolean> {
  const isVerified = await verifyUser(username, currentPassword);
  
  if (!isVerified) {
    return false;
  }
  
  const db = await openDb();
  
  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.run('UPDATE users SET password = ? WHERE username = ?', [hashedPassword, username]);
    return true;
  } catch (error) {
    console.error('Error changing password:', error);
    return false;
  } finally {
    await db.close();
  }
} 
