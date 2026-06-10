import { redactSensitiveText } from "./safety.js";
import { delay, parseJsonObject, summarizeUpstreamError, addDays } from "./util.js";
import { getRetentionDays, getSyncPageSize } from "./config.js";

export async function refreshAccessToken(env, clientId, refreshToken, scope = null) {
  const tenantId = env.MICROSOFT_TENANT_ID || "common";
  const url =
    "https://login.microsoftonline.com/" +
    encodeURIComponent(tenantId) +
    "/oauth2/v2.0/token";
  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
  if (scope) {
    body.set("scope", scope);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const detail = await response.text();
    const parsed = parseJsonObject(detail);
    const error = new Error("Microsoft token refresh failed: HTTP " + response.status + " " + redactSensitiveText(detail));
    error.status = response.status;
    error.code = parsed.error || "";
    throw error;
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error("Microsoft token refresh returned no access token.");
  }

  return payload.access_token;
}

export async function refreshImapAccessToken(env, clientId, refreshToken) {
  const attempts = [
    "https://outlook.office.com/IMAP.AccessAsUser.All offline_access",
    "https://outlook.office.com/.default offline_access",
    null,
  ];
  const errors = [];

  for (const scope of attempts) {
    try {
      return await refreshAccessToken(env, clientId, refreshToken, scope);
    } catch (error) {
      errors.push(scope ? scope + ": " + summarizeUpstreamError(error) : "original scope: " + summarizeUpstreamError(error));
    }
  }

  throw new Error("Unable to refresh IMAP access token. " + errors.join(" | "));
}

export async function verifyMicrosoftAccount(env, clientId, refreshToken) {
  const accessToken = await refreshAccessToken(env, clientId, refreshToken);
  const profile = await graphFetchJson(
    "https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName",
    accessToken,
  );
  return { accessToken, profile };
}

export function buildDeltaUrl(env, folder) {
  const cutoff = addDays(new Date(), -getRetentionDays(env)).toISOString();
  const params = new URLSearchParams();
  params.set(
    "$select",
    "id,internetMessageId,subject,from,receivedDateTime,body,isRead,hasAttachments,webLink",
  );
  params.set("$top", String(getSyncPageSize(env)));
  params.set("$filter", "receivedDateTime ge " + cutoff);

  return (
    "https://graph.microsoft.com/v1.0/me/mailFolders/" +
    encodeURIComponent(folder) +
    "/messages/delta?" +
    params.toString()
  );
}

export async function graphFetchJson(url, accessToken, options = {}) {
  const headers = {
    authorization: "Bearer " + accessToken,
  };
  if (options.pageSize) {
    headers.prefer = "odata.maxpagesize=" + String(options.pageSize);
  }
  const response = await graphFetchWithRetry(url, {
    headers,
    errorPrefix: "Microsoft Graph request failed",
  });

  return await response.json();
}

export async function graphFetchArrayBuffer(url, accessToken) {
  const response = await graphFetchWithRetry(url, {
    headers: {
      authorization: "Bearer " + accessToken,
    },
    errorPrefix: "Microsoft Graph binary request failed",
  });

  return await response.arrayBuffer();
}

async function graphFetchWithRetry(url, options) {
  const attempts = 3;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: options.headers });
      if (!response.ok) {
        throw await createGraphHttpError(response, options.errorPrefix);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts - 1 || !isRetryableGraphError(error)) {
        throw error;
      }
      const retryDelayMs = Math.min(8000, Math.max(error.retryAfterMs || 0, 500 * 2 ** attempt + Math.floor(Math.random() * 250)));
      await delay(retryDelayMs);
    }
  }
  throw lastError;
}

async function createGraphHttpError(response, prefix) {
  const detail = await response.text();
  const parsed = parseJsonObject(detail);
  const code = parsed.error?.code || parsed.code || "";
  const error = new Error(prefix + " (" + response.status + "): " + redactSensitiveText(detail));
  error.status = response.status;
  error.code = code;
  error.retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
  return error;
}

export function isRetryableGraphError(error) {
  const status = Number(error?.status || 0);
  if (status === 429 || status === 503 || status === 504 || status >= 500) return true;
  const code = String(error?.code || "").toLowerCase();
  if (["toomanyrequests", "ratelimitexceeded", "serviceunavailable", "internalservererror", "timeout"].includes(code)) return true;
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("network") || message.includes("timeout") || message.includes("timed out");
}

export function parseRetryAfterMs(value) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(value);
  return Number.isNaN(dateMs) ? 0 : Math.max(0, dateMs - Date.now());
}
