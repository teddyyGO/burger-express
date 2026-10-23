// =============================================================================
//  order-service
//
//  Owns the "orders" table. This is where a customer order starts.
//
//  Routes (nginx sends /api/orders* here):
//    POST /api/orders      -> create an order
//    GET  /api/orders/:id  -> read one order (the customer polls this)
//
//  Events:
//    publishes  order.created
//    listens to kitchen.started  -> order becomes COOKING
//    listens to kitchen.ready    -> order becomes READY
//
//  The file is split in layers:
//    index.ts             = HTTP + events (this file)
//    order-logic.ts       = rules and calculations (unit tested)
//    orders.repository.ts = all SQL
//    db.ts                = the database connection
// =============================================================================
import Fastify from "fastify";
import { waitForDb } from "./db";
import { connectRabbit, publishEvent, consumeEvents } from "./rabbit";
import {
  createOrdersTable,
  insertOrder,
  findOrderById,
  updateOrderStatus,
} from "./orders.repository";
import {
  validateOrder,
  buildOrderLine,
  calculateTotal,
  statusFromKitchenEvent,
  type OrderLine,
} from "./order-logic";

const PORT = Number(process.env.PORT ?? 3002);
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://app:app@rabbitmq:5672";
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL ?? "http://product-service:3001";

const app = Fastify();

// Unexpected errors (for example from the database) are logged here, and the
// client only gets a generic message, so no internals leak out.
app.setErrorHandler((err: any, req, reply) => {
  const code = err.statusCode ?? 500;
  if (code >= 500) {
    console.error("[order-service] unexpected error", err);
    return reply.code(500).send({ error: "internal server error" });
  }
  return reply.code(code).send({ error: err.message });
});

app.get("/health", async () => {
  return { status: "ok", service: "order-service" };
});

// ---------------------------------------------------------------------------
//  POST /api/orders  - a customer places an order
// ---------------------------------------------------------------------------
app.post("/api/orders", async (req, reply) => {
  const body = req.body as any;

  // 1. Check the body before we do anything else.
  const errors = validateOrder(body);
  if (errors.length > 0) {
    return reply.code(400).send({ error: "invalid order", details: errors });
  }

  // 2. Ask product-service about every product, so we get the real price.
  const lines: OrderLine[] = [];
  for (const item of body.items) {
    const url = `${PRODUCT_SERVICE_URL}/api/products/${encodeURIComponent(item.productId)}`;

    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      // product-service is down. We answer 503 instead of saving a broken order.
      console.error("[order-service] could not reach product-service");
      return reply.code(503).send({ error: "product-service is not available, try again later" });
    }

    if (response.status === 404) {
      return reply.code(400).send({ error: `unknown product: ${item.productId}` });
    }
    if (!response.ok) {
      return reply.code(503).send({ error: "could not check the products right now" });
    }

    const product = (await response.json()) as { id: string; name: string; price: number };
    lines.push(buildOrderLine(product, item.quantity));
  }

  // 3. The total is calculated here on the server, never sent by the client.
  const total = calculateTotal(lines);

  // 4. Save the order with status NEW.
  const order = await insertOrder(body.customerName.trim(), total, lines);

  // 5. Tell the rest of the system. order-service does not care who listens.
  publishEvent("order.created", {
    orderId: order.id,
    customerName: order.customerName,
    items: order.items,
    total: order.total,
    createdAt: order.createdAt,
  });

  console.log(`[order-service] order ${order.id} created, total ${order.total} kr`);
  return reply.code(201).send(order);
});

// ---------------------------------------------------------------------------
//  GET /api/orders/:id  - the customer checks the status
// ---------------------------------------------------------------------------
app.get("/api/orders/:id", async (req, reply) => {
  const params = req.params as { id: string };
  const order = await findOrderById(params.id);

  if (order === null) {
    return reply.code(404).send({ error: "order not found" });
  }
  return order;
});

// ---------------------------------------------------------------------------
//  Events from the kitchen
// ---------------------------------------------------------------------------
async function handleKitchenEvent(message: any, routingKey: string) {
  const status = statusFromKitchenEvent(routingKey);
  if (status === null) return; // an event we do not care about

  await updateOrderStatus(message.orderId, status);
  console.log(`[order-service] order ${message.orderId} is now ${status}`);
}

async function start() {
  await waitForDb();
  await createOrdersTable();
  await connectRabbit(RABBITMQ_URL);
  // "kitchen.*" matches both kitchen.started and kitchen.ready.
  await consumeEvents("order-service.kitchen-events", "kitchen.*", handleKitchenEvent);
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`[order-service] listening on port ${PORT}`);
}

start().catch((err) => {
  console.error("[order-service] could not start", err);
  process.exit(1);
});
