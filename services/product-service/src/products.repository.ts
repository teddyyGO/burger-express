// DATA LAYER for product-service.
// All SQL for the "products" table is written here, and nowhere else.
// index.ts (the HTTP layer) only calls these functions.
import { sql } from "./db";

export type Product = {
  id: string;
  name: string;
  price: number;
};

// DDL: create the table if it does not exist yet.
export async function createProductsTable() {
  await sql`
    create table if not exists products (
      id    text          primary key,
      name  text          not null,
      price numeric(10,2) not null
    )
  `;
  console.log("[product-service] products table is ready");
}

export async function countProducts(): Promise<number> {
  const rows = await sql`select count(*)::int as total from products`;
  return rows[0].total;
}

export async function insertProduct(product: Product) {
  await sql`
    insert into products (id, name, price)
    values (${product.id}, ${product.name}, ${product.price})
  `;
}

export async function findAllProducts(): Promise<Product[]> {
  const rows = await sql`select id, name, price from products order by name`;
  // Postgres gives back "price" as a string, so we turn it into a number.
  return rows.map((row) => ({ id: row.id, name: row.name, price: Number(row.price) }));
}

export async function findProductById(id: string): Promise<Product | null> {
  const rows = await sql`select id, name, price from products where id = ${id}`;
  if (rows.length === 0) return null;
  return { id: rows[0].id, name: rows[0].name, price: Number(rows[0].price) };
}
