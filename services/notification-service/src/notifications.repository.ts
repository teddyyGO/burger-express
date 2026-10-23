// DATA LAYER for notification-service.
// All SQL for the "notifications" table is here.
import { sql } from "./db";

export type Notification = {
  id: number;
  orderId: string;
  message: string;
  sentAt: Date;
};

// DDL: create the table if it does not exist yet.
export async function createNotificationsTable() {
  await sql`
    create table if not exists notifications (
      id       serial      primary key,
      order_id uuid        not null,
      message  text        not null,
      sent_at  timestamptz not null default now()
    )
  `;
  console.log("[notification-service] notifications table is ready");
}

function toNotification(row: any): Notification {
  return {
    id: row.id,
    orderId: row.order_id,
    message: row.message,
    sentAt: row.sent_at,
  };
}

export async function insertNotification(orderId: string, message: string) {
  await sql`
    insert into notifications (order_id, message)
    values (${orderId}, ${message})
  `;
}

export async function findNotificationsByOrderId(orderId: string): Promise<Notification[]> {
  try {
    const rows = await sql`
      select * from notifications
      where order_id = ${orderId}
      order by sent_at asc, id asc
    `;
    return rows.map(toNotification);
  } catch (err) {
    // Not a real uuid, so there are no notifications for it.
    return [];
  }
}
