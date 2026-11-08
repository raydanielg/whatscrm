/**
 * Amazon S3 / Cloudflare R2 runtime.
 *
 * Both providers already collect bucket + access key + secret in their config
 * schema, so actions sign requests with SigV4 and call the REST endpoint
 * directly. No vendor SDK, which keeps this edge-safe like the rest of the
 * dispatcher.
 */
import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import type { ActionContext, ActionResult } from "./runtime.server";

const SERVICE = "s3";

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function signingKey(secret: string, dateStamp: string, region: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), region), SERVICE), "aws4_request");
}

/** RFC 3986 encoding — `encodeURIComponent` leaves !'()* unescaped, SigV4 does not. */
function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeObjectKey(key: string): string {
  return key
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(uriEncode)
    .join("/");
}

function canonicalQueryString(query: Record<string, string>): string {
  return Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join("&");
}

interface Endpoint {
  host: string;
  basePath: string;
  region: string;
}

function resolveEndpoint(ctx: ActionContext): Endpoint & {
  accessKeyId: string;
  secretAccessKey: string;
} {
  const accessKeyId = String(ctx.config.access_key_id ?? "").trim();
  const secretAccessKey = String(ctx.config.secret_access_key ?? "").trim();
  const bucket = String(ctx.config.bucket ?? "").trim();
  if (!accessKeyId || !secretAccessKey || !bucket)
    throw new Error("Bucket, access key ID, and secret access key are required");
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error("Invalid bucket name");

  if (ctx.providerId === "cloudflare-r2") {
    const accountId = String(ctx.config.account_id ?? "").trim();
    if (!/^[a-f0-9]{16,64}$/i.test(accountId)) throw new Error("A valid R2 account ID is required");
    return {
      host: `${accountId}.r2.cloudflarestorage.com`,
      basePath: `/${bucket}`,
      region: "auto",
      accessKeyId,
      secretAccessKey,
    };
  }

  const region = String(ctx.config.region ?? "").trim();
  if (!/^[a-z0-9-]{3,32}$/.test(region)) throw new Error("A valid AWS region is required");
  return {
    host: `${bucket}.s3.${region}.amazonaws.com`,
    basePath: "",
    region,
    accessKeyId,
    secretAccessKey,
  };
}

function timestamps(): { amzDate: string; dateStamp: string } {
  const amzDate = new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/** Signs with `Authorization`, for requests this server sends itself. */
function signedHeaderRequest(opts: {
  endpoint: ReturnType<typeof resolveEndpoint>;
  method: string;
  canonicalUri: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  payload: Buffer;
}): { url: string; headers: Record<string, string> } {
  const { endpoint, method, canonicalUri, query, payload } = opts;
  const { amzDate, dateStamp } = timestamps();
  const payloadHash = sha256Hex(payload);
  const headers: Record<string, string> = {
    ...opts.headers,
    host: endpoint.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const names = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort();
  const lookup = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const canonicalHeaders = `${names.map((n) => `${n}:${String(lookup.get(n)).trim()}`).join("\n")}\n`;
  const signedHeaders = names.join(";");
  const canonicalQuery = canonicalQueryString(query);
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${dateStamp}/${endpoint.region}/${SERVICE}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac(
    "sha256",
    signingKey(endpoint.secretAccessKey, dateStamp, endpoint.region),
  )
    .update(stringToSign, "utf8")
    .digest("hex");
  headers.Authorization = `AWS4-HMAC-SHA256 Credential=${endpoint.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return {
    url: `https://${endpoint.host}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ""}`,
    headers,
  };
}

/** Query-signed URL the browser can use directly, no credentials attached. */
function presign(opts: {
  endpoint: ReturnType<typeof resolveEndpoint>;
  method: string;
  canonicalUri: string;
  expiresIn: number;
}): string {
  const { endpoint, method, canonicalUri, expiresIn } = opts;
  const { amzDate, dateStamp } = timestamps();
  const scope = `${dateStamp}/${endpoint.region}/${SERVICE}/aws4_request`;
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${endpoint.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = canonicalQueryString(query);
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    `host:${endpoint.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac(
    "sha256",
    signingKey(endpoint.secretAccessKey, dateStamp, endpoint.region),
  )
    .update(stringToSign, "utf8")
    .digest("hex");
  return `https://${endpoint.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

const keySchema = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .refine((k) => !k.includes("..") && !k.startsWith("/"), "Invalid object key");

export async function runObjectStorageAction(ctx: ActionContext): Promise<ActionResult> {
  const started = Date.now();
  try {
    const endpoint = resolveEndpoint(ctx);

    if (ctx.capabilityId === "signed_url") {
      const input = z
        .object({
          key: keySchema,
          method: z.enum(["GET", "PUT"]).default("GET"),
          expiresIn: z.number().int().min(30).max(604800).default(900),
        })
        .parse(ctx.input);
      const url = presign({
        endpoint,
        method: input.method,
        canonicalUri: `${endpoint.basePath}/${encodeObjectKey(input.key)}`,
        expiresIn: input.expiresIn,
      });
      return {
        ok: true,
        status: 200,
        data: JSON.stringify({ url, method: input.method, expiresIn: input.expiresIn }),
        latencyMs: Date.now() - started,
      };
    }

    if (ctx.capabilityId === "upload_object") {
      const input = z
        .object({
          key: keySchema,
          content: z.string().min(1).max(40_000_000),
          contentType: z.string().max(200).default("application/octet-stream"),
        })
        .parse(ctx.input);
      const normalized = input.content.replace(/\s+/g, "");
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized))
        throw new Error("Object content must be base64 encoded");
      const payload = Buffer.from(normalized, "base64");
      const signed = signedHeaderRequest({
        endpoint,
        method: "PUT",
        canonicalUri: `${endpoint.basePath}/${encodeObjectKey(input.key)}`,
        query: {},
        headers: { "content-type": input.contentType },
        payload,
      });
      const response = await fetch(signed.url, {
        method: "PUT",
        headers: signed.headers,
        body: payload,
      });
      const body = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        data: response.ok ? JSON.stringify({ key: input.key, bytes: payload.length }) : null,
        error: response.ok ? undefined : storageError(response.status, body),
        latencyMs: Date.now() - started,
      };
    }

    if (ctx.capabilityId === "list_objects") {
      const input = z
        .object({
          prefix: z.string().max(1024).optional(),
          maxKeys: z.number().int().min(1).max(1000).default(100),
        })
        .parse(ctx.input);
      const query: Record<string, string> = {
        "list-type": "2",
        "max-keys": String(input.maxKeys),
      };
      if (input.prefix) query.prefix = input.prefix;
      const signed = signedHeaderRequest({
        endpoint,
        method: "GET",
        canonicalUri: endpoint.basePath || "/",
        query,
        headers: {},
        payload: Buffer.alloc(0),
      });
      const response = await fetch(signed.url, { method: "GET", headers: signed.headers });
      const body = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        data: response.ok ? body : null,
        error: response.ok ? undefined : storageError(response.status, body),
        latencyMs: Date.now() - started,
      };
    }

    throw new Error(`Unsupported object storage action: ${ctx.capabilityId}`);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Object storage action failed",
      latencyMs: Date.now() - started,
    };
  }
}

function storageError(status: number, body: string): string {
  const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1];
  const message = /<Message>([^<]+)<\/Message>/.exec(body)?.[1];
  const detail = [code, message].filter(Boolean).join(": ") || body.slice(0, 300);
  return `Object storage request failed (${status})${detail ? `: ${detail}` : ""}`;
}
