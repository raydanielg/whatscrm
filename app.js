/**
 * CommonJS production entry — required by LiteSpeed/cPanel hosts that call
 * `require("app.js")` from lsnode.js.
 *
 * package.json intentionally uses "type": "commonjs" so this file is parsed as
 * CommonJS. The TanStack/Nitro server bundle remains ESM and is loaded with
 * dynamic import(), which keeps its top-level-await graph out of LiteSpeed's
 * synchronous require() chain.
 *
 * Supported server layouts:
 *   1. <appRoot>/.output/server/index.mjs   (upload the full `.output/` folder)
 *   2. <appRoot>/server/index.mjs           (extract `.output` contents at root)
 *
 * Build first:
 *   DEPLOY_TARGET=node npm run build
 */
"use strict";

const { createReadStream, existsSync, readFileSync, statSync } = require("node:fs");
const { createServer } = require("node:http");
const { extname, resolve, sep } = require("node:path");
const { Readable } = require("node:stream");
const { pathToFileURL } = require("node:url");

function stabilizeProcessStdin() {
  const descriptor = Object.getOwnPropertyDescriptor(process, "stdin");
  if (!descriptor || typeof descriptor.get !== "function" || !descriptor.configurable) {
    return;
  }

  const fallbackStdin = new Readable({
    read() {
      this.push(null);
    },
  });
  fallbackStdin.fd = 0;
  fallbackStdin.isTTY = false;
  fallbackStdin.setRawMode = () => fallbackStdin;

  Object.defineProperty(process, "stdin", {
    configurable: true,
    enumerable: true,
    value: fallbackStdin,
  });
}

stabilizeProcessStdin();

function loadDotEnvFile() {
  const envPath = resolve(__dirname, ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadDotEnvFile();

process.env.HOST = process.env.HOST || "0.0.0.0";
process.env.PORT = process.env.PORT || process.env.PASSENGER_PORT || "3000";
process.env.NODE_ENV = process.env.NODE_ENV || "production";

const candidates = [
  resolve(__dirname, ".output/server/index.mjs"),
  resolve(__dirname, "server/index.mjs"),
];

const serverEntry = candidates.find((candidate) => existsSync(candidate));
const staticRoots = [resolve(__dirname, ".output/public"), resolve(__dirname, "public")];
const passenger = globalThis.PhusionPassenger;
const isPassenger = Boolean(passenger);
let didStartServer = false;

if (isPassenger && typeof passenger.configure === "function") {
  passenger.configure({ autoInstall: false });
}

function startNodeServer(handler, source) {
  if (didStartServer) return;
  if (typeof handler !== "function") {
    throw new TypeError(`[wacrm] ${source} did not provide a Node request handler.`);
  }

  didStartServer = true;

  const server = createServer((req, res) => {
    try {
      if (serveStaticAsset(req, res)) return;

      const result = handler(req, res);
      if (result && typeof result.then === "function") {
        result.catch((error) => {
          console.error("[wacrm] Request handler failed:", error);
          if (!res.headersSent) res.statusCode = 500;
          if (!res.writableEnded) res.end("Internal Server Error");
        });
      }
    } catch (error) {
      console.error("[wacrm] Request handler failed:", error);
      if (!res.headersSent) res.statusCode = 500;
      if (!res.writableEnded) res.end("Internal Server Error");
    }
  });

  server.on("error", (error) => {
    console.error("[wacrm] HTTP server failed:", error);
    process.exit(1);
  });

  server.on("listening", () => {
    const address = server.address();
    const location =
      typeof address === "string"
        ? address
        : `http://${process.env.HOST}:${address?.port ?? process.env.PORT}`;
    console.log(`[wacrm] Listening via ${source} on ${location}`);
  });

  if (isPassenger) {
    server.listen("passenger");
  } else {
    server.listen(Number(process.env.PORT), process.env.HOST);
  }
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json; charset=utf-8",
};

function resolveStaticFile(pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }

  if (!decodedPath || decodedPath.includes("\0")) return undefined;
  if (decodedPath === "/" || decodedPath.endsWith("/")) return undefined;

  const relativePath = decodedPath.replace(/^\/+/, "");
  if (!relativePath) return undefined;

  for (const root of staticRoots) {
    const filePath = resolve(root, relativePath);
    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) continue;
    if (!existsSync(filePath)) continue;

    try {
      const stats = statSync(filePath);
      if (stats.isFile()) return { filePath, stats };
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function serveStaticAsset(req, res) {
  const method = req.method || "GET";
  if (method !== "GET" && method !== "HEAD") return false;

  const host = req.headers.host || "localhost";
  const url = new URL(req.url || "/", `http://${host}`);
  const match = resolveStaticFile(url.pathname);
  if (!match) return false;

  const ext = extname(match.filePath).toLowerCase();
  res.statusCode = 200;
  res.setHeader("Content-Type", contentTypes[ext] || "application/octet-stream");
  res.setHeader("Content-Length", String(match.stats.size));
  res.setHeader("Last-Modified", match.stats.mtime.toUTCString());
  res.setHeader(
    "Cache-Control",
    url.pathname.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "public, max-age=300, must-revalidate",
  );

  if (method === "HEAD") {
    res.end();
    return true;
  }

  createReadStream(match.filePath)
    .on("error", (error) => {
      console.error("[wacrm] Static asset failed:", error);
      if (!res.headersSent) res.statusCode = 500;
      if (!res.writableEnded) res.end("Internal Server Error");
    })
    .pipe(res);

  return true;
}

function createWebRequest(req) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto || (req.socket.encrypted ? "https" : "http");
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || req.headers.host || "localhost";
  const url = new URL(req.url || "/", `${protocol}://${host}`);
  const method = req.method || "GET";
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry);
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  return new Request(url, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : req,
    duplex: "half",
  });
}

function writeWebResponse(webResponse, res) {
  res.statusCode = webResponse.status;
  res.statusMessage = webResponse.statusText;
  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!webResponse.body) {
    res.end();
    return;
  }

  Readable.fromWeb(webResponse.body).pipe(res);
}

function createExecutionContext() {
  return {
    waitUntil(promise) {
      Promise.resolve(promise).catch((error) => {
        console.error("[wacrm] Background task failed:", error);
      });
    },
    passThroughOnException() {},
  };
}

function asNodeHandler(candidate, source) {
  if (typeof candidate === "function") return candidate;
  if (candidate && typeof candidate.handler === "function") return candidate.handler;
  if (candidate && candidate.node && typeof candidate.node.handler === "function") {
    return candidate.node.handler;
  }
  if (candidate && typeof candidate.fetch === "function") {
    return async (req, res) => {
      const webRequest = createWebRequest(req);
      const webResponse = await candidate.fetch(webRequest, process.env, createExecutionContext());
      writeWebResponse(webResponse, res);
    };
  }
  if (candidate && typeof candidate.default !== "undefined") {
    return asNodeHandler(candidate.default, `${source}.default`);
  }
  return undefined;
}

function resolveExportedHandler(module) {
  const candidates = [
    module.middleware,
    module.handler,
    module.listener,
    module.server,
    module.app,
    module.default,
    module,
  ];

  for (const candidate of candidates) {
    const handler = asNodeHandler(candidate, "server export");
    if (handler) return handler;
  }

  return undefined;
}

globalThis.__srvxLoader__ = ({ server }) => {
  startNodeServer(server?.node?.handler, "Passenger bootstrap");
};

if (!serverEntry) {
  const message =
    "[wacrm] Could not find the built server entry.\n" +
    "Looked in:\n  - " +
    candidates.join("\n  - ") +
    "\nBuild locally with `DEPLOY_TARGET=node npm run build` and upload the `.output/` folder.";

  console.error(message);
  throw new Error(message);
}

import(pathToFileURL(serverEntry).href)
  .then((module) => {
    const exportedHandler = resolveExportedHandler(module);
    if (!didStartServer && typeof exportedHandler === "function") {
      startNodeServer(exportedHandler, "exported handler");
    }
    if (!didStartServer) {
      throw new Error(
        "[wacrm] Server entry loaded, but no HTTP listener or handler was created.",
      );
    }
    console.log(`[wacrm] Server entry loaded: ${serverEntry}`);
  })
  .catch((err) => {
    console.error("[wacrm] Failed to start server entry:", serverEntry);
    console.error(err);
    process.exit(1);
  });
