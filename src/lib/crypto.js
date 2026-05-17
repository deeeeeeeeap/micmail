const encoder = new TextEncoder();
const aesKeyCache = new Map();

export async function encryptText(plainText, secret) {
  if (!secret) {
    throw new Error("TOKEN_ENCRYPTION_SECRET is not configured.");
  }
  const key = await getAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plainText),
  );
  return uint8ToBase64(iv) + "." + uint8ToBase64(new Uint8Array(encrypted));
}

export async function decryptText(payload, secret) {
  if (!secret) {
    throw new Error("TOKEN_ENCRYPTION_SECRET is not configured.");
  }
  const [ivEncoded, dataEncoded] = String(payload).split(".");
  if (!ivEncoded || !dataEncoded) {
    throw new Error("Encrypted token payload is invalid.");
  }

  const key = await getAesKey(secret);
  const iv = base64ToUint8(ivEncoded);
  const data = base64ToUint8(dataEncoded);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );
  return new TextDecoder().decode(decrypted);
}

export function base64ToUint8(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function uint8ToBase64(value) {
  let binary = "";
  for (const item of value) {
    binary += String.fromCharCode(item);
  }
  return btoa(binary);
}

async function getAesKey(secret) {
  if (aesKeyCache.has(secret)) {
    return await aesKeyCache.get(secret);
  }
  const material = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  const keyPromise = crypto.subtle.importKey(
    "raw",
    material,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  aesKeyCache.set(secret, keyPromise);
  return await keyPromise;
}
