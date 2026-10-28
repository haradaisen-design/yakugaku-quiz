// 問題データの復号（アプリと scripts/build.mjs の検証で共通に使う）
// 形式: gzip した JSON を AES-256-GCM で暗号化。ファイルは IV(12バイト)‖暗号文‖認証タグ(16バイト)
export const CHECK_TEXT = 'yakugaku-quiz:ok';

const te = new TextEncoder();

export function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** パスワードから 32 バイトの鍵を作る（PBKDF2） */
export async function deriveKeyBytes(password, kdf) {
  const base = await crypto.subtle.importKey('raw', te.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: kdf.hash, salt: b64ToBytes(kdf.salt), iterations: kdf.iterations },
    base,
    256,
  );
  return new Uint8Array(bits);
}

export function importKey(bytes) {
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt']);
}

export async function decrypt(key, data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, key, bytes.subarray(12));
  return new Uint8Array(plain);
}

export async function gunzipText(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export async function decryptJson(key, data) {
  return JSON.parse(await gunzipText(await decrypt(key, data)));
}

/** 確認用の暗号文が復号できればパスワードは正しい */
export async function checkKey(key, checkB64) {
  try {
    return new TextDecoder().decode(await decrypt(key, b64ToBytes(checkB64))) === CHECK_TEXT;
  } catch {
    return false;
  }
}
