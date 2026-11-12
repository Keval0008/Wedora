import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { getEnv } from "../env";
import * as schema from "./schema";

export type DB = MySql2Database<typeof schema>;

let instance: { pool: mysql.Pool; db: DB } | null = null;

/** TiDB Cloud only accepts TLS; a local MySQL usually has none. */
function wantsTls(url: string, flag?: "true" | "false"): boolean {
  if (flag) return flag === "true";
  return /tidbcloud\.com/i.test(url);
}

function connect() {
  const env = getEnv();
  const pool = mysql.createPool({
    uri: env.DATABASE_URL,
    // Serverless instances are many and short-lived; a few connections each is plenty.
    connectionLimit: 5,
    maxIdle: 2,
    idleTimeout: 30_000,
    timezone: "Z",
    dateStrings: false,
    enableKeepAlive: true,
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
  try {
    attachDatabasePool(pool.pool);
  } catch (error) {
    console.warn("[db] attachDatabasePool skipped:", (error as Error).message);
  }

  return { pool, db: drizzle(pool, { schema, mode: "default" }) };
}

export function getDb(): DB {
  instance ??= connect();
  return instance.db;
}

/**
 * The Drizzle database, connected on first use. Methods are bound to the real
 * instance so query builders keep their `this`.
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
