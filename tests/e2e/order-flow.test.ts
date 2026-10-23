// =============================================================================
//  END TO END TEST of the whole flow.
//
//  It uses only the public entry point (http://localhost), exactly like a real
//  customer and a real member of the kitchen staff. Nothing is mocked, so if
//  this test passes then nginx, all four services, RabbitMQ and PostgreSQL
//  all work together.
//
//  The system must be running first:
//      docker compose up --build
//      bun test tests/e2e
// =============================================================================
import { test, expect } from "bun:test";

const BASE = process.env.BASE_URL ?? "http://localhost";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// TypeScript says response.json() is "unknown", because it cannot know what the
// server sends back. This little helper gives us a normal object instead, so
// the tests stay easy to read.
async function readJson(response: Response): Promise<any> {
  return await response.json();
}

// Events take a little time (that is normal in an event driven system),
// so we ask again a few times before we say the test failed.
async function waitForOrderStatus(orderId: string, wanted: string): Promise<any> {
  for (let i = 0; i < 30; i++) {
    const response = await fetch(`${BASE}/api/orders/${orderId}`);
    const order = await readJson(response);
    if (order.status === wanted) return order;
    await sleep(500);
  }
  throw new Error(`order ${orderId} never got the status ${wanted}`);
}

async function waitForTicket(orderId: string): Promise<any> {
  for (let i = 0; i < 30; i++) {
    const response = await fetch(`${BASE}/api/kitchen/tickets`);
    const data = await readJson(response);
    const ticket = data.tickets.find((t: any) => t.orderId === orderId);
    if (ticket) return ticket;
    await sleep(500);
  }
  throw new Error(`no kitchen ticket was created for order ${orderId}`);
}

// ---------------------------------------------------------------------------
//  The happy path: menu -> order -> kitchen -> ready -> notifications
// ---------------------------------------------------------------------------
test(
  "a customer orders food and the staff cooks it until it is READY",
  async () => {
    // 1. The customer reads the menu.
    const menuResponse = await fetch(`${BASE}/api/products`);
    expect(menuResponse.status).toBe(200);

    const menu = await readJson(menuResponse);
    expect(menu.products.length).toBeGreaterThan(0);

    const burger = menu.products[0];
    const drink = menu.products[1];

    // 2. The customer places an order.
    const createResponse = await fetch(`${BASE}/api/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerName: "Test Customer",
        items: [
          { productId: burger.id, quantity: 2 },
          { productId: drink.id, quantity: 1 },
        ],
      }),
    });

    expect(createResponse.status).toBe(201);
    const order = await readJson(createResponse);

    expect(order.id).toBeTruthy();
    expect(order.status).toBe("NEW");
    // The total is calculated by the server, not by us.
    expect(order.total).toBe(burger.price * 2 + drink.price);

    // 3. The order.created event should give the kitchen a new ticket.
    const ticket = await waitForTicket(order.id);
    expect(ticket.status).toBe("WAITING");
    expect(ticket.customerName).toBe("Test Customer");

    // 4. The staff presses "start cooking".
    const startResponse = await fetch(`${BASE}/api/kitchen/tickets/${order.id}/start`, {
      method: "POST",
    });
    expect(startResponse.status).toBe(200);

    // The kitchen.started event must change the order for the customer.
    const cooking = await waitForOrderStatus(order.id, "COOKING");
    expect(cooking.status).toBe("COOKING");

    // 5. The staff presses "food is ready".
    const readyResponse = await fetch(`${BASE}/api/kitchen/tickets/${order.id}/ready`, {
      method: "POST",
    });
    expect(readyResponse.status).toBe(200);

    const ready = await waitForOrderStatus(order.id, "READY");
    expect(ready.status).toBe("READY");
    // The order should still have the same items and the same total.
    expect(ready.total).toBe(order.total);
    expect(ready.items.length).toBe(2);

    // 6. A finished ticket disappears from the kitchen screen.
    const screenResponse = await fetch(`${BASE}/api/kitchen/tickets`);
    const screen = await readJson(screenResponse);
    const stillThere = screen.tickets.find((t: any) => t.orderId === order.id);
    expect(stillThere).toBeUndefined();

    // 7. The customer should have got three notifications, one per event.
    const noteResponse = await fetch(`${BASE}/api/notifications/${order.id}`);
    expect(noteResponse.status).toBe(200);

    const notes = await readJson(noteResponse);
    expect(notes.notifications.length).toBe(3);
    expect(notes.notifications[0].message).toContain("Test Customer");
    expect(notes.notifications[2].message).toContain("ready");
  },
  60_000,
);

// ---------------------------------------------------------------------------
//  Error cases. A system that only works when everything is perfect is not done.
// ---------------------------------------------------------------------------
test(
  "a product that does not exist gives 400 and no order is saved",
  async () => {
    const response = await fetch(`${BASE}/api/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerName: "Test Customer",
        items: [{ productId: "pizza-with-pineapple", quantity: 1 }],
      }),
    });

    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect(body.error).toContain("unknown product");
  },
  15_000,
);

test(
  "an order without items gives 400",
  async () => {
    const response = await fetch(`${BASE}/api/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerName: "Test Customer", items: [] }),
    });

    expect(response.status).toBe(400);
  },
  15_000,
);

test(
  "asking for an order that does not exist gives 404",
  async () => {
    const response = await fetch(`${BASE}/api/orders/this-is-not-an-order`);
    expect(response.status).toBe(404);
  },
  15_000,
);

test(
  "the staff cannot mark food ready before they started cooking it",
  async () => {
    // Make a fresh order so we have a ticket that is still WAITING.
    const menuResponse = await fetch(`${BASE}/api/products`);
    const menu = await readJson(menuResponse);

    const createResponse = await fetch(`${BASE}/api/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerName: "Wrong Order Test",
        items: [{ productId: menu.products[0].id, quantity: 1 }],
      }),
    });
    const order = await readJson(createResponse);
    await waitForTicket(order.id);

    // Skipping a step must not be allowed.
    const readyResponse = await fetch(`${BASE}/api/kitchen/tickets/${order.id}/ready`, {
      method: "POST",
    });
    expect(readyResponse.status).toBe(409);

    // And the order must still be NEW.
    const orderResponse = await fetch(`${BASE}/api/orders/${order.id}`);
    const stillNew = await readJson(orderResponse);
    expect(stillNew.status).toBe("NEW");
  },
  60_000,
);

test(
  "the kitchen answers 404 for a ticket that does not exist",
  async () => {
    const response = await fetch(`${BASE}/api/kitchen/tickets/not-a-real-ticket/start`, {
      method: "POST",
    });
    expect(response.status).toBe(404);
  },
  15_000,
);
