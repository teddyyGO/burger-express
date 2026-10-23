// DATA LAYER for kitchen-service.
// All SQL for the "tickets" table is here.
import { sql } from "./db";
import { WAITING, READY } from "./kitchen-logic";

export type TicketItem = {
  name: string;
  quantity: number;
};

export type Ticket = {
  orderId: string;
  customerName: string;
  status: string;
  items: TicketItem[];
  createdAt: Date;
};

// DDL: create the table if it does not exist yet.
// The order id is the primary key, one order = one ticket.
export async function createTicketsTable() {
  await sql`
    create table if not exists tickets (
      order_id      uuid        primary key,
      customer_name text        not null,
      status        text        not null,
      items         jsonb       not null,
      created_at    timestamptz not null default now()
    )
  `;
  console.log("[kitchen-service] tickets table is ready");
}

function toTicket(row: any): Ticket {
  return {
    orderId: row.order_id,
    customerName: row.customer_name,
    status: row.status,
    items: row.items,
    createdAt: row.created_at,
  };
}

// "on conflict do nothing" makes this safe to run twice. RabbitMQ can deliver
// the same message more than once, and then we do not want two tickets.
export async function insertTicket(orderId: string, customerName: string, items: TicketItem[]) {
  await sql`
    insert into tickets (order_id, customer_name, status, items)
    values (${orderId}, ${customerName}, ${WAITING}, ${sql.json(items)})
    on conflict (order_id) do nothing
  `;
}

// The kitchen screen: everything that is not finished yet, oldest first.
export async function findOpenTickets(): Promise<Ticket[]> {
  const rows = await sql`
    select * from tickets
    where status <> ${READY}
    order by created_at asc
  `;
  return rows.map(toTicket);
}

export async function findTicketByOrderId(orderId: string): Promise<Ticket | null> {
  try {
    const rows = await sql`select * from tickets where order_id = ${orderId}`;
    if (rows.length === 0) return null;
    return toTicket(rows[0]);
  } catch (err) {
    // Not a real uuid, so there is no such ticket.
    return null;
  }
}

export async function updateTicketStatus(orderId: string, status: string) {
  await sql`update tickets set status = ${status} where order_id = ${orderId}`;
}
