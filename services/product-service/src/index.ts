// =============================================================================
//  product-service
//
//  Owns the "products" table (the menu).
//  It has no events at all - it is a simple read API.
//
//  Routes (nginx sends /api/products* here):
//    GET /api/products      -> the whole menu
//    GET /api/products/:id  -> one product (order-service uses this to get
//                              the real price, so the client cannot fake it)
//    GET /health            -> only used by the Docker healthcheck
// =============================================================================
import Fastify from "fastify";
import { waitForDb } from "./db";
import { createProductsTable, findAllProducts, findProductById } from "./products.repository";
import { seedMenu } from "./seed";

const PORT = Number(process.env.PORT ?? 3001);
const app = Fastify();

// Unexpected errors (for example from the database) are logged here, and the
// client only gets a generic message, so no internals leak out.
app.setErrorHandler((err: any, req, reply) => {
  const code = err.statusCode ?? 500;
  if (code >= 500) {
    console.error("[product-service] unexpected error", err);
    return reply.code(500).send({ error: "internal server error" });
  }
  return reply.code(code).send({ error: err.message });
});

app.get("/health", async () => {
  return { status: "ok", service: "product-service" };
});

app.get("/api/products", async () => {
  const products = await findAllProducts();
  return { products };
});

app.get("/api/products/:id", async (req, reply) => {
  const params = req.params as { id: string };
  const product = await findProductById(params.id);

  if (product === null) {
    return reply.code(404).send({ error: "product not found" });
  }
  return product;
});

async function start() {
  await waitForDb();
  await createProductsTable();
  await seedMenu();
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`[product-service] listening on port ${PORT}`);
}

start().catch((err) => {
  console.error("[product-service] could not start", err);
  process.exit(1);
});
