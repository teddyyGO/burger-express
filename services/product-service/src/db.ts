// Database connection for product-service.
// This file only knows HOW to talk to Postgres. The SQL itself lives in
// products.repository.ts (our data layer).
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://app:app@postgres:5432/restaurant";

export const sql = postgres(DATABASE_URL, { onnotice: () => {} });

// The database can need a few seconds before it accepts connections,
// so we try again a couple of times before we give up.
export async function waitForDb() {
  for (let i = 1; i <= 30; i++) {
    try {
      await sql`select 1`;
      console.log("[product-service] database connected");
      return;
    } catch (err) {
      console.log(`[product-service] database not ready (try ${i}/30)`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error("[product-service] could not connect to the database");
}
