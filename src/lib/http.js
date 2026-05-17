export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      ...securityHeaders(),
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

export function handleError(error) {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof HttpError ? error.message : "Internal server error.";
  if (!(error instanceof HttpError)) {
    console.error(error);
  } else {
    console.error("http_error", status, message);
  }
  return jsonResponse({ success: false, error: message }, status);
}

export function corsHeaders() {
  return {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  };
}

export function securityHeaders() {
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'self'",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-src 'self'",
      "img-src 'self' data:",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
    ].join("; "),
    "Referrer-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

export function requireString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "Missing required field: " + fieldName);
  }
  return value.trim();
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON request body.");
  }
}
