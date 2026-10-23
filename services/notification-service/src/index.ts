// =============================================================================
//  notification-service
//
//  Sends notifications to the customer. In a real system this would be SMS or
//  push. Here we save the message in the database and print it in the log,
//  so you can actually see and test that the notification was sent.
//
//  Routes (nginx sends /api/notifications* here):
//    GET /api/notifications/:orderId  -> all messages for one order
//
//  Events:
//    listens to "#" which means EVERY event on the exchange. That is the point
//    of this service - it does not care who sent the event.
// =============================================================================
import Fastify from "fastify";
import { waitForDb } from "./db";
import { connectRabbit, consumeEvents } from "./rabbit";
import {
  createNotificationsTable,
  insertNotification,
  findNotificationsByOrderId,
} from "./notifications.repository";
import { buildMessage } from "./notification-logic";

const PORT = Number(process.env.PORT ?? 3004);
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://app:app@rabbitmq:5672";

const app = Fastify();

// Unexpected errors (for example from the database) are logged here, and the
// client only gets a generic message, so no internals leak out.
app.setErrorHandler((err: any, req, reply) => {
  const code = err.statusCode ?? 500;
  if (code >= 500) {
    console.error("[notification-service] unexpected error", err);
    return reply.code(500).send({ error: "internal server error" });
  }
  return reply.code(code).send({ error: err.message });
});

app.get("/health", async () => {
  return { status: "ok", service: "notification-service" };
});

app.get("/api/notifications/:orderId", async (req) => {
  const params = req.params as { orderId: string };
  const notifications = await findNotificationsByOrderId(params.orderId);
  return { notifications };
});

// One handler for every event in the system.
async function handleEvent(message: any, routingKey: string) {
  const text = buildMessage(routingKey, message);
  if (text === null) return; // an event we have no message for

  await insertNotification(message.orderId, text);
  console.log(`[notification-service] to customer (order ${message.orderId}): ${text}`);
}

async function start() {
  await waitForDb();
  await createNotificationsTable();
  await connectRabbit(RABBITMQ_URL);
  // "#" is the topic pattern that matches all routing keys.
  await consumeEvents("notification-service.all-events", "#", handleEvent);
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`[notification-service] listening on port ${PORT}`);
}

start().catch((err) => {
  console.error("[notification-service] could not start", err);
  process.exit(1);
});
