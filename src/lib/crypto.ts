/**
 * SmartBookmark Pro - 보안 암호화 모듈
 * Web Crypto API 기반 PBKDF2 해싱 및 AES-GCM 암복호화
 */

/** PBKDF2 해싱 반복 횟수 (OWASP 2024 권장: 600,000+) */
const PBKDF2_ITERATIONS = 600_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

/**
 * 랜덤 salt 생성
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * 비밀번호를 PBKDF2로 해싱
 * @param password 평문 비밀번호 또는 패턴 문자열
 * @param salt 솔트 바이트 배열
 * @returns 해시된 바이트 배열
 */
export async function hashPassword(
  password: string,
  salt: Uint8Array,
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH,
  );
}

/**
 * 해시 비교 (상수 시간 비교로 타이밍 공격 방지)
 */
export function constantTimeCompare(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const viewA = new Uint8Array(a);
  const viewB = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < viewA.length; i++) {
    diff |= viewA[i] ^ viewB[i];
  }
  return diff === 0;
}

/**
 * 비밀번호에서 AES-GCM 암호화 키 유도
 */
async function deriveEncryptionKey(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * AES-GCM 암호화
 * @returns salt(16) + iv(12) + ciphertext 형태의 결합 바이트
 */
export async function encrypt(
  plaintext: string,
  password: string,
): Promise<Uint8Array> {
  const salt = generateSalt();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveEncryptionKey(password, salt);
  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  );
  // salt(16) + iv(12) + ciphertext
  const result = new Uint8Array(
    salt.length + iv.length + ciphertext.byteLength,
  );
  result.set(salt, 0);
  result.set(iv, salt.length);
  result.set(new Uint8Array(ciphertext), salt.length + iv.length);
  return result;
}

/**
 * AES-GCM 복호화
 * @param data salt(16) + iv(12) + ciphertext 형태의 결합 바이트
 */
export async function decrypt(
  data: Uint8Array,
  password: string,
): Promise<string> {
  const salt = data.slice(0, SALT_LENGTH);
  const iv = data.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = data.slice(SALT_LENGTH + IV_LENGTH);
  const key = await deriveEncryptionKey(password, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(decrypted);
}

/**
 * ArrayBuffer를 숫자 배열로 변환 (chrome.storage 저장용)
 */
export function bufferToArray(buffer: ArrayBuffer): number[] {
  return Array.from(new Uint8Array(buffer));
}

/**
 * 숫자 배열을 Uint8Array로 변환 (chrome.storage 로드용)
 */
export function arrayToBuffer(arr: number[]): Uint8Array {
  return new Uint8Array(arr);
}

/**
 * 패턴 잠금 좌표 시퀀스를 문자열로 변환
 * 예: [[0,0],[1,1],[2,2]] → "0,0-1,1-2,2"
 */
export function patternToString(points: [number, number][]): string {
  return points.map(([x, y]) => `${x},${y}`).join('-');
}
