const AUTH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const AUTH_COOKIE_NAME = 'auth';
export const AUTH_COOKIE_TTL_SECONDS = Math.floor(AUTH_TOKEN_TTL_MS / 1000);

type AuthTokenPayload = {
  sub: string;
  exp: number;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

let generatedSecret: string | null = null;
let signingKeyPromise: Promise<CryptoKey> | null = null;

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(`${normalized}${padding}`);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function getAuthSecret() {
  const configuredSecret =
    process.env.CONTEXTSELECTOR_AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim();

  if (configuredSecret) {
    return configuredSecret;
  }

  if (!generatedSecret) {
    const secretBytes = crypto.getRandomValues(new Uint8Array(32));
    generatedSecret = bytesToBase64Url(secretBytes);
  }

  return generatedSecret;
}

async function getSigningKey() {
  if (!signingKeyPromise) {
    signingKeyPromise = crypto.subtle.importKey(
      'raw',
      textEncoder.encode(getAuthSecret()),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
  }

  return signingKeyPromise;
}

async function signValue(value: string) {
  const signingKey = await getSigningKey();
  const signature = await crypto.subtle.sign('HMAC', signingKey, textEncoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function createAuthToken(username: string) {
  const payload: AuthTokenPayload = {
    sub: username,
    exp: Date.now() + AUTH_TOKEN_TTL_MS,
  };
  const encodedPayload = bytesToBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const signature = await signValue(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export async function verifyAuthToken(token: string | undefined) {
  if (!token) {
    return null;
  }

  const [encodedPayload, encodedSignature] = token.split('.');

  if (!encodedPayload || !encodedSignature) {
    return null;
  }

  try {
    const signingKey = await getSigningKey();
    const isValid = await crypto.subtle.verify(
      'HMAC',
      signingKey,
      base64UrlToBytes(encodedSignature),
      textEncoder.encode(encodedPayload)
    );

    if (!isValid) {
      return null;
    }

    const payload = JSON.parse(
      textDecoder.decode(base64UrlToBytes(encodedPayload))
    ) as Partial<AuthTokenPayload>;

    if (
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      typeof payload.exp !== 'number' ||
      payload.exp <= Date.now()
    ) {
      return null;
    }

    return payload.sub;
  } catch {
    return null;
  }
}
