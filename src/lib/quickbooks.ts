import crypto from "node:crypto";

const QBO_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export class QuickBooksApiError extends Error {
  status: number | null;
  intuitTid: string | null;
  code: string | null;
  detail: string | null;
  reconnectRequired: boolean;

  constructor(
    message: string,
    options?: {
      status?: number | null;
      intuitTid?: string | null;
      code?: string | null;
      detail?: string | null;
      reconnectRequired?: boolean;
    }
  ) {
    super(message);
    this.name = "QuickBooksApiError";
    this.status = options?.status ?? null;
    this.intuitTid = options?.intuitTid ?? null;
    this.code = options?.code ?? null;
    this.detail = options?.detail ?? null;
    this.reconnectRequired = options?.reconnectRequired ?? false;
  }
}

export function isQuickBooksApiError(error: unknown): error is QuickBooksApiError {
  return error instanceof QuickBooksApiError;
}

function requiresReconnect(code: string | null, status: number | null, message: string) {
  const normalized = `${code ?? ""} ${message}`.toLowerCase();
  return (
    code === "invalid_grant" ||
    status === 401 ||
    normalized.includes("refresh token") ||
    normalized.includes("token revoked") ||
    normalized.includes("authorization has expired")
  );
}

export function getQuickBooksConfig() {
  return {
    clientId: requireEnv("QBO_CLIENT_ID"),
    clientSecret: requireEnv("QBO_CLIENT_SECRET"),
    redirectUri:
      process.env.QBO_REDIRECT_URI ??
      "https://farmvoicerecords.com/api/quickbooks/callback",
    environment: process.env.QBO_ENVIRONMENT === "sandbox" ? "sandbox" : "production",
  } as const;
}

export function quickBooksApiBase() {
  return getQuickBooksConfig().environment === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
}

export function buildQuickBooksAuthorizeUrl(state: string) {
  const { clientId, redirectUri } = getQuickBooksConfig();
  const url = new URL(QBO_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "com.intuit.quickbooks.accounting");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

function encryptionKey() {
  const raw = requireEnv("QBO_TOKEN_ENCRYPTION_KEY");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("QBO_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(value: string) {
  const [ivText, tagText, encryptedText] = value.split(".");
  if (!ivText || !tagText || !encryptedText) throw new Error("Invalid encrypted token.");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivText, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export type QboTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
};

export type QboResponse<T> = {
  data: T;
  intuitTid: string | null;
};

async function tokenRequest(params: URLSearchParams): Promise<QboResponse<QboTokenResponse>> {
  const { clientId, clientSecret } = getQuickBooksConfig();
  const response = await fetch(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  const intuitTid = response.headers.get("intuit_tid");
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const code = typeof body?.error === "string" ? body.error : null;
    const message =
      body?.error_description ??
      body?.error ??
      `QuickBooks token request failed (${response.status}).`;

    throw new QuickBooksApiError(message, {
      status: response.status,
      intuitTid,
      code,
      detail: typeof body?.error_description === "string" ? body.error_description : null,
      reconnectRequired: requiresReconnect(code, response.status, String(message)),
    });
  }

  return { data: body as QboTokenResponse, intuitTid };
}

export function exchangeAuthorizationCode(code: string) {
  const { redirectUri } = getQuickBooksConfig();
  return tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    })
  );
}

export function refreshQuickBooksToken(refreshToken: string) {
  return tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    })
  );
}

export async function qboRequest<T>(
  realmId: string,
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<QboResponse<T>> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(
    `${quickBooksApiBase()}/v3/company/${encodeURIComponent(realmId)}${path}`,
    {
      ...init,
      headers,
      cache: "no-store",
      signal: init?.signal ?? AbortSignal.timeout(30_000),
    }
  );

  const intuitTid = response.headers.get("intuit_tid");
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const fault = body?.Fault?.Error?.[0];
    const code = typeof fault?.code === "string" ? fault.code : null;
    const message =
      fault?.Detail ??
      fault?.Message ??
      `QuickBooks request failed (${response.status}).`;

    throw new QuickBooksApiError(message, {
      status: response.status,
      intuitTid,
      code,
      detail: typeof fault?.Message === "string" ? fault.Message : null,
      reconnectRequired: requiresReconnect(code, response.status, String(message)),
    });
  }

  return { data: body as T, intuitTid };
}

export function tokenExpiry(seconds: number) {
  return new Date(Date.now() + Math.max(30, seconds - 60) * 1000).toISOString();
}
