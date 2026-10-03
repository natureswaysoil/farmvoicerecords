import crypto from "node:crypto";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function johnDeereConfigured() {
  return Boolean(
    process.env.JOHN_DEERE_CLIENT_ID &&
      process.env.JOHN_DEERE_CLIENT_SECRET &&
      process.env.JOHN_DEERE_AUTH_URL &&
      process.env.JOHN_DEERE_TOKEN_URL &&
      process.env.JOHN_DEERE_API_BASE_URL &&
      process.env.JOHN_DEERE_TOKEN_ENCRYPTION_KEY,
  );
}

export function getJohnDeereConfig() {
  return {
    clientId: requireEnv("JOHN_DEERE_CLIENT_ID"),
    clientSecret: requireEnv("JOHN_DEERE_CLIENT_SECRET"),
    authUrl: requireEnv("JOHN_DEERE_AUTH_URL"),
    tokenUrl: requireEnv("JOHN_DEERE_TOKEN_URL"),
    apiBaseUrl: requireEnv("JOHN_DEERE_API_BASE_URL").replace(/\/$/, ""),
    redirectUri:
      process.env.JOHN_DEERE_REDIRECT_URI ??
      "https://farmvoicerecords.com/api/john-deere/callback",
    scopes:
      process.env.JOHN_DEERE_SCOPES ??
      "ag1 ag2 ag3 eq1 org1 offline_access",
  };
}

function encryptionKey() {
  const raw = requireEnv("JOHN_DEERE_TOKEN_ENCRYPTION_KEY");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "JOHN_DEERE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
    );
  }
  return key;
}

export function encryptJohnDeereSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export function decryptJohnDeereSecret(value: string) {
  const [ivText, tagText, encryptedText] = value.split(".");
  if (!ivText || !tagText || !encryptedText) {
    throw new Error("Invalid encrypted John Deere token.");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function buildJohnDeereAuthorizeUrl(state: string) {
  const config = getJohnDeereConfig();
  const url = new URL(config.authUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scopes);
  url.searchParams.set("state", state);
  return url.toString();
}

export type JohnDeereTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
};

async function tokenRequest(params: URLSearchParams) {
  const config = getJohnDeereConfig();
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${config.clientId}:${config.clientSecret}`,
      ).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof body?.error_description === "string"
        ? body.error_description
        : typeof body?.error === "string"
          ? body.error
          : `John Deere token request failed (${response.status}).`;
    throw new Error(message);
  }

  return body as JohnDeereTokenResponse;
}

export function exchangeJohnDeereAuthorizationCode(code: string) {
  const config = getJohnDeereConfig();
  return tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    }),
  );
}

export function refreshJohnDeereAccessToken(refreshToken: string) {
  return tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
}

export function johnDeereTokenExpiry(seconds: number) {
  return new Date(
    Date.now() + Math.max(30, Number(seconds || 0) - 60) * 1000,
  ).toISOString();
}

export type DeereLink = {
  rel?: string;
  uri?: string;
};

export type DeereCollection<T> = {
  values?: T[];
  links?: DeereLink[];
};

export function deereLink(
  body: { links?: DeereLink[] } | null | undefined,
  rel: string,
) {
  return body?.links?.find((link) => link.rel === rel)?.uri ?? null;
}

export async function johnDeereRequest<T>(
  accessToken: string,
  pathOrUrl: string,
  options?: {
    unitSystem?: "ENGLISH" | "METRIC";
    signature?: string | null;
  },
) {
  const config = getJohnDeereConfig();
  const url = /^https?:\/\//i.test(pathOrUrl)
    ? pathOrUrl
    : `${config.apiBaseUrl}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
  const headers = new Headers({
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.deere.axiom.v3+json, application/json",
  });
  if (options?.unitSystem) {
    headers.set("Accept-UOM-System", options.unitSystem);
  }
  if (options?.signature) {
    headers.set("x-deere-signature", options.signature);
  }

  const response = await fetch(url, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof body?.message === "string"
        ? body.message
        : `John Deere API request failed (${response.status}).`,
    );
  }

  return {
    data: body as T,
    signature: response.headers.get("x-deere-signature"),
  };
}

export async function collectDeerePages<T>(
  accessToken: string,
  firstPath: string,
  options?: { unitSystem?: "ENGLISH" | "METRIC" },
) {
  const values: T[] = [];
  let next: string | null = firstPath;
  let pages = 0;

  while (next && pages < 100) {
    const response = await johnDeereRequest<DeereCollection<T>>(
      accessToken,
      next,
      options,
    );
    values.push(...(response.data.values ?? []));
    next =
      deereLink(response.data, "nextPage") ??
      deereLink(response.data, "next") ??
      null;
    pages += 1;
  }

  if (pages >= 100 && next) {
    throw new Error("John Deere pagination exceeded 100 pages.");
  }

  return values;
}
