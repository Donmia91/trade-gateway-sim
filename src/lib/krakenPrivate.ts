/**
 * Kraken REST private API — read-only (Balance). No order placement or cancellation.
 * Uses KRAKEN_API_KEY and KRAKEN_API_SECRET from env. Never logs or returns secrets.
 */
import crypto from "crypto";

const KRAKEN_BASE = "https://api.kraken.com";
const BALANCE_PATH = "/0/private/Balance";
const TIMEOUT_MS = 6000;

export interface KrakenBalanceEntry {
  asset: string;
  amount: number;
}

function getKrakenSign(path: string, nonce: string, postData: string, secretB64: string): string {
  const decodedSecret = Buffer.from(secretB64, "base64");
  const hash = crypto.createHash("sha256");
  hash.update(nonce + postData);
  const sha256Digest = hash.digest();
  const message = Buffer.concat([Buffer.from(path, "utf8"), sha256Digest]);
  const hmac = crypto.createHmac("sha512", decodedSecret);
  hmac.update(message);
  return hmac.digest("base64");
}

export async function getBalance(): Promise<KrakenBalanceEntry[]> {
  const apiKey = process.env.KRAKEN_API_KEY?.trim();
  const apiSecret = process.env.KRAKEN_API_SECRET?.trim();

  if (!apiKey || !apiSecret) {
    throw new Error("MISSING_CREDENTIALS");
  }

  const nonce = String(Date.now());
  const body = new URLSearchParams({ nonce }).toString();
  const signature = getKrakenSign(BALANCE_PATH, nonce, body, apiSecret);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${KRAKEN_BASE}${BALANCE_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "API-Key": apiKey,
        "API-Sign": signature,
      },
      body,
      signal: controller.signal,
    });
    const data = (await res.json()) as {
      error?: string[];
      result?: Record<string, string>;
    };

    if (!res.ok) {
      const errMsg = Array.isArray(data.error) ? data.error.join(", ") : "Unknown error";
      throw new Error(errMsg || `HTTP ${res.status}`);
    }

    if (data.error && data.error.length > 0) {
      throw new Error(data.error.join(", "));
    }

    const result = data.result ?? {};
    return Object.entries(result).map(([asset, amountStr]) => ({
      asset,
      amount: parseFloat(amountStr) || 0,
    }));
  } finally {
    clearTimeout(timeout);
  }
}
