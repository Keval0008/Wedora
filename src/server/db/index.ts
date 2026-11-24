import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { getEnv } from "../env";
import * as schema from "./schema";
import { allowMysqlTlsOnWorkers } from "./workers-tls";

export type DB = MySql2Database<typeof schema>;

type Instance = { pool: mysql.Pool; db: DB };

/** TiDB Cloud only accepts TLS; a local MySQL usually has none. */
function wantsTls(url: string, flag?: "true" | "false"): boolean {
  if (flag) return flag === "true";
  return /tidbcloud\.com/i.test(url);
}

/**
 * On Cloudflare Workers the OpenNext worker stores `{ env, ctx, cf }` here for
 * the request being handled. It is undefined on Vercel and in `next dev`.
 */
const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

/** The current Cloudflare request's ExecutionContext, or undefined elsewhere. */
function cloudflareRequest(): object | undefined {
  const context = (globalThis as Record<symbol, { ctx?: object } | undefined>)[CLOUDFLARE_CONTEXT];
  return context?.ctx ?? undefined;
}

function connect(onWorkers: boolean): Instance {
  const env = getEnv();
  if (onWorkers) allowMysqlTlsOnWorkers();
  const pool = mysql.createPool({
    uri: env.DATABASE_URL,
    // Workers allow 6 open connections per request (fetches included), and a
    // pool there lives for one request, so keep it small.
    connectionLimit: onWorkers ? 2 : 5,
    maxIdle: 2,
    idleTimeout: 30_000,
    timezone: "Z",
    dateStrings: false,
    enableKeepAlive: !onWorkers,
    // Workers forbid eval / new Function, which mysql2 uses to build row parsers.
    disableEval: onWorkers,
    ssl: wantsTls(env.DATABASE_URL, env.DATABASE_SSL)
      ? { minVersion: "TLSv1.2", rejectUnauthorized: true }
      : undefined,
  });

  // Every session runs in UTC, so CURRENT_TIMESTAMP defaults match the Dates mysql2 writes.
  pool.pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'", (error) => {
      if (error) console.error("[db] could not set the session time zone to UTC:", error);
    });
  });

  // Keeps the Vercel instance alive just long enough to close idle connections cleanly.
  // It recognises mysql2's core pool, which the promise wrapper keeps in `.pool`.
  if (!onWorkers) {
    try {
      attachDatabasePool(pool.pool);
    } catch (error) {
      console.warn("[db] attachDatabasePool skipped:", (error as Error).message);
    }
  }

  return { pool, db: drizzle(pool, { schema, mode: "default" }) };
}

/** Node (Vercel, `next start`, `next dev`): one pool shared by every request. */
let shared: Instance | null = null;

/**
 * Cloudflare Workers: a socket opened while handling one request cannot be
 * used by another ("Cannot perform I/O on behalf of a different request"),
 * so each request gets its own pool. Workers close its sockets when the
 * request ends, and the WeakMap entry goes with the request's context.
 */
const perRequest = new WeakMap<object, Instance>();

export function getDb(): DB {
  const request = cloudflareRequest();
  if (request) {
    let instance = perRequest.get(request);
    if (!instance) {
      instance = connect(true);
      perRequest.set(request, instance);
    }
    return instance.db;
  }
  shared ??= connect(false);
  return shared.db;
}

/**
 * The Drizzle database for the current request, connected on first use.
 * Methods are bound to the real instance so query builders keep their `this`.
 */
export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };

/** mysql2 returns [ResultSetHeader, …] for writes. */
export function affectedRows(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as { affectedRows?: number } | undefined)?.affectedRows ?? 0);
}

export function isDuplicateKey(error: unknown): boolean {
  const e = error as { code?: string; errno?: number; cause?: { code?: string; errno?: number } } | null;
  return (
    e?.code === "ER_DUP_ENTRY" ||
    e?.cause?.code === "ER_DUP_ENTRY" ||
    e?.errno === 1062 ||
    e?.cause?.errno === 1062
  );
}
