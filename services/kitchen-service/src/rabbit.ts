// =============================================================================
//  RabbitMQ helper.
//
//  The whole system uses ONE topic exchange called "restaurant".
//  Every service that needs events has this same small helper file.
//
//  Events in the system:
//    order.created     - published by order-service
//    kitchen.started   - published by kitchen-service
//    kitchen.ready     - published by kitchen-service
//
//  Exchange and queues are durable and messages are persistent, so nothing
//  is lost if RabbitMQ restarts. We ack a message only AFTER we handled it.
// =============================================================================
import { connect } from "amqplib";

export const EXCHANGE = "restaurant";

// One channel per service. "any" keeps it simple.
let channel: any = null;

export async function connectRabbit(url: string) {
  for (let i = 1; i <= 30; i++) {
    try {
      const connection = await connect(url);

      // If we lose the connection we exit, and Docker restarts the service.
      // That is easier to follow than writing our own reconnect logic.
      connection.on("close", () => {
        console.error("[rabbit] connection closed, exiting so Docker restarts us");
        process.exit(1);
      });

      const ch = await connection.createChannel();
      await ch.assertExchange(EXCHANGE, "topic", { durable: true });
      await ch.prefetch(1); // handle one message at a time
      channel = ch;
      console.log(`[rabbit] connected, exchange '${EXCHANGE}' is ready`);
      return;
    } catch (err) {
      console.log(`[rabbit] not ready (try ${i}/30)`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error("[rabbit] could not connect to RabbitMQ");
}

// Send an event to the exchange. The routing key decides which queues get it.
export function publishEvent(routingKey: string, message: object) {
  if (channel === null) throw new Error("[rabbit] no channel yet");

  const data = Buffer.from(JSON.stringify(message));
  channel.publish(EXCHANGE, routingKey, data, { persistent: true });
  console.log(`[rabbit] published '${routingKey}'`);
}

// Listen to events. bindingKey can be an exact key ("order.created"),
// a pattern ("kitchen.*") or "#" which means every event.
export async function consumeEvents(
  queueName: string,
  bindingKey: string,
  handler: (message: any, routingKey: string) => Promise<void>,
) {
  if (channel === null) throw new Error("[rabbit] no channel yet");

  await channel.assertQueue(queueName, { durable: true });
  await channel.bindQueue(queueName, EXCHANGE, bindingKey);

  await channel.consume(queueName, async (msg: any) => {
    if (!msg) return;
    try {
      const content = JSON.parse(msg.content.toString());
      await handler(content, msg.fields.routingKey);
      channel.ack(msg); // ack first when the work is done
    } catch (err) {
      console.error(`[rabbit] could not handle message in '${queueName}'`, err);
      // false = do not put the message back, so one broken message
      // cannot block the queue forever.
      channel.nack(msg, false, false);
    }
  });

  console.log(`[rabbit] listening on queue '${queueName}' for '${bindingKey}'`);
}
