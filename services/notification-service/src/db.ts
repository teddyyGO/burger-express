// Database connection for notification-service.
// Only the connection lives here, the SQL lives in notifications.repository.ts.
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://app:app@postgres:5432/restaurant";

export const sql = postgres(DATABASE_URL, { onnotice: () => {} });

export async function waitForDb() {
  for (let i = 1; i <= 30; i++) {
    try {
      await sql`select 1`;
      console.log("[notification-service] database connected");
      return;
    } catch (err) {
      console.log(`[notification-service] database not ready (try ${i}/30)`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error("[notification-service] could not connect to the database");
}
