// =============================================================================
//  kitchen-service
//
//  This is the screen the staff in the restaurant works on. It is NOT a
//  simulation with timers - a real person presses the buttons, exactly like
//  in a real hamburger restaurant.
//
//  Routes (nginx sends /api/kitchen* here):
//    GET  /api/kitchen/tickets            -> the kitchen screen (open tickets)
//    POST /api/kitchen/tickets/:id/start  -> staff starts cooking
//    POST /api/kitchen/tickets/:id/ready  -> staff says the food is ready
//
//  Events:
//    listens to order.created  -> a new ticket shows up on the screen
//    publishes kitchen.started
//    publishes kitchen.ready
// =============================================================================
import Fastify from "fastify";
import { waitForDb } from "./db";
import { connectRabbit, publishEvent, consumeEvents } from "./rabbit";
import {
  createTicketsTable,
  insertTicket,
  findOpenTickets,
  findTicketByOrderId,
  updateTicketStatus,
} from "./tickets.repository";
import { canStartCooking, canMarkReady, ticketSummary, COOKING, READY } from "./kitchen-logic";

const PORT = Number(process.env.PORT ?? 3003);
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://app:app@rabbitmq:5672";

const app = Fastify();

// Unexpected errors (for example from the database) are logged here, and the
// client only gets a generic message, so no internals leak out.
app.setErrorHandler((err: any, req, reply) => {
  const code = err.statusCode ?? 500;
  if (code >= 500) {
    console.error("[kitchen-service] unexpected error", err);
    return reply.code(500).send({ error: "internal server error" });
  }
  return reply.code(code).send({ error: err.message });
});

app.get("/health", async () => {
  return { status: "ok", service: "kitchen-service" };
});

// ---------------------------------------------------------------------------
//  GET /api/kitchen/tickets  - what the staff sees on the screen
// ---------------------------------------------------------------------------
app.get("/api/kitchen/tickets", async () => {
  const tickets = await findOpenTickets();

  // We add a short text line so the screen is easy to read.
  const withSummary = tickets.map((ticket) => ({
    ...ticket,
    summary: ticketSummary(ticket.items),
  }));

  return { tickets: withSummary };
});

// ---------------------------------------------------------------------------
//  POST /api/kitchen/tickets/:id/start  - staff presses "start cooking"
// ---------------------------------------------------------------------------
app.post("/api/kitchen/tickets/:id/start", async (req, reply) => {
  const params = req.params as { id: string };
  const ticket = await findTicketByOrderId(params.id);

  if (ticket === null) {
    return reply.code(404).send({ error: "ticket not found" });
  }
  if (!canStartCooking(ticket.status)) {
    // 409 = the request is fine, but the ticket is in the wrong state.
    return reply.code(409).send({ error: `cannot start a ticket that is ${ticket.status}` });
  }

  await updateTicketStatus(ticket.orderId, COOKING);
  publishEvent("kitchen.started", { orderId: ticket.orderId });
  console.log(`[kitchen-service] staff started cooking order ${ticket.orderId}`);

  return { orderId: ticket.orderId, status: COOKING };
});

// ---------------------------------------------------------------------------
//  POST /api/kitchen/tickets/:id/ready  - staff presses "food is ready"
// ---------------------------------------------------------------------------
app.post("/api/kitchen/tickets/:id/ready", async (req, reply) => {
  const params = req.params as { id: string };
  const ticket = await findTicketByOrderId(params.id);

  if (ticket === null) {
    return reply.code(404).send({ error: "ticket not found" });
  }
  if (!canMarkReady(ticket.status)) {
    return reply.code(409).send({ error: `cannot finish a ticket that is ${ticket.status}` });
  }

  await updateTicketStatus(ticket.orderId, READY);
  publishEvent("kitchen.ready", { orderId: ticket.orderId });
  console.log(`[kitchen-service] order ${ticket.orderId} is ready`);

  return { orderId: ticket.orderId, status: READY };
});

// ---------------------------------------------------------------------------
//  Event: a new order was created, so we put a ticket on the screen
// ---------------------------------------------------------------------------
async function handleOrderCreated(message: any) {
  // The kitchen only needs to know what to cook, not what it costs.
  const items = message.items.map((item: any) => ({
    name: item.name,
    quantity: item.quantity,
  }));

  await insertTicket(message.orderId, message.customerName, items);
  console.log(`[kitchen-service] new ticket for order ${message.orderId}`);
}

async function start() {
  await waitForDb();
  await createTicketsTable();
  await connectRabbit(RABBITMQ_URL);
  await consumeEvents("kitchen-service.new-orders", "order.created", handleOrderCreated);
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`[kitchen-service] listening on port ${PORT}`);
}

start().catch((err) => {
  console.error("[kitchen-service] could not start", err);
  process.exit(1);
});
