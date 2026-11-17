import "server-only";
import { createDb, type Db } from "./db-core";
import { databaseUrl, pgliteDir } from "./config";

export type { Db, Row } from "./db-core";

// One connection pool / embedded database per Node process. Kept on globalThis so
// Next.js dev hot-reload does not open a new one on every edit.
const g = globalThis as unknown as { __bahadDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!g.__bahadDb) {
    const url = databaseUrl();
    if (!url && process.env.NODE_ENV === "production" && process.env.BAHAD_ALLOW_PGLITE !== "1") {
      throw new Error("DATABASE_URL is required in production (set BAHAD_ALLOW_PGLITE=1 for a local test run only)");
    }
    g.__bahadDb = createDb(url ? { kind: "pg", url } : { kind: "pglite", dir: pgliteDir() }).catch((e) => {
      g.__bahadDb = undefined;
      throw e;
    });
  }
  return g.__bahadDb;
}
