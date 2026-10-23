// DATA LAYER for order-service.
// Every SQL query for the "orders" table is here, so if the table changes
// there is only one file to change.
import { sql } from "./db";
import { NEW, type OrderLine } from "./order-logic";

export type Order = {
  id: string;
  customerName: string;
  status: string;
  total: number;
  items: OrderLine[];
  createdAt: Date;
};

// DDL: create the table if it does not exist yet.
export async function createOrdersTable() {
  await sql`
    create table if not exists orders (
      id            uuid          primary key default gen_random_uuid(),
      customer_name text          not null,
      status        text          not null,
      total         numeric(10,2) not null,
      items         jsonb         not null,
      created_at    timestamptz   not null default now()
    )
  `;
  console.log("[order-service] orders table is ready");
}

// Turns a database row into the object the rest of the code uses.
function toOrder(row: any): Order {
  return {
    id: row.id,
    customerName: row.customer_name,
    status: row.status,
    total: Number(row.total),
    items: row.items,
    createdAt: row.created_at,
  };
}

export async function insertOrder(customerName: string, total: number, items: OrderLine[]): Promise<Order> {
  // sql.json() is needed so the array is saved as jsonb and not as a Postgres array.
  const rows = await sql`
    insert into orders (customer_name, status, total, items)
    values (${customerName}, ${NEW}, ${total}, ${sql.json(items)})
    returning *
  `;
  return toOrder(rows[0]);
}

export async function findOrderById(id: string): Promise<Order | null> {
  try {
    const rows = await sql`select * from orders where id = ${id}`;
    if (rows.length === 0) return null;
    return toOrder(rows[0]);
  } catch (err) {
    // A text that is not a real uuid makes Postgres throw.
    // For the customer that is the same thing as "order not found".
    return null;
  }
}

export async function updateOrderStatus(id: string, status: string) {
  await sql`update orders set status = ${status} where id = ${id}`;
}
