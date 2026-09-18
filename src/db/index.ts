import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Lazy db handle. Returns null when DATABASE_URL is not set, so the app
// builds and deploys before the database exists (deploy-early rule).
// Day 2+ pages must null-check the result of getDb().
let cached: PostgresJsDatabase<typeof schema> | null = null;
let attempted = false;

export function getDb(): PostgresJsDatabase<typeof schema> | null {
  if (!attempted) {
    attempted = true;
    const url = process.env.DATABASE_URL;
    if (url) {
      cached = drizzle(postgres(url, { prepare: false }), { schema });
    }
  }
  return cached;
}

export { schema };
