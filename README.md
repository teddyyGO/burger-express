# Burger Express

An event-driven backend for a fast-food restaurant, built with **Bun +
TypeScript**, **Fastify**, **RabbitMQ**, **PostgreSQL**, **nginx** and **Docker
Compose**. Originally built as a course project on software quality and
distributed systems.

A customer orders at the counter, the order shows up on the kitchen screen, the
staff cooks it, and the customer gets a message when the food is ready.

---

## 1. Start the system

```bash
docker compose up --build
```

The tables are created and the menu is seeded automatically when the services
start, so no manual SQL is needed.

When it is up, open **<http://localhost>** in a browser. There is a small test
page with the menu, an order form and the kitchen screen, so you can click
through the whole flow.

To stop and remove everything:

```bash
docker compose down -v
```

### Configuration

The PostgreSQL and RabbitMQ credentials default to `app` / `app`. **These
defaults are for local development only.** Override them with environment
variables (or a `.env` file next to `docker-compose.yml`, which is git-ignored):

| Variable            | Default |
| ------------------- | ------- |
| `POSTGRES_USER`     | `app`   |
| `POSTGRES_PASSWORD` | `app`   |
| `RABBITMQ_USER`     | `app`   |
| `RABBITMQ_PASSWORD` | `app`   |

Neither PostgreSQL nor RabbitMQ (including its management UI) publishes a port,
so they are only reachable from inside the Docker network.

---

## 2. The public way into the system

**`http://localhost`** (nginx on port 80) is the *only* published port in the
whole system. All the other services run on the internal Docker network and
cannot be reached from your machine.

nginx is also the only gateway. It sends each path straight to the service that
owns it, so there is no extra proxy service in the middle:

| Method | Route                                | Goes to              | What it does                          |
| ------ | ------------------------------------ | -------------------- | ------------------------------------- |
| GET    | `/api/products`                      | product-service      | the whole menu                        |
| GET    | `/api/products/:id`                  | product-service      | one product                           |
| POST   | `/api/orders`                        | order-service        | place an order                        |
| GET    | `/api/orders/:id`                    | order-service        | check the status of your order        |
| GET    | `/api/kitchen/tickets`               | kitchen-service      | the kitchen screen (staff)            |
| POST   | `/api/kitchen/tickets/:id/start`     | kitchen-service      | staff starts cooking                  |
| POST   | `/api/kitchen/tickets/:id/ready`     | kitchen-service      | staff says the food is ready          |
| GET    | `/api/notifications/:orderId`        | notification-service | the messages the customer got         |

### Try it with curl

```bash
# 1. Look at the menu
curl http://localhost/api/products

# 2. Order two hamburgers and a cola
curl -X POST http://localhost/api/orders \
  -H 'content-type: application/json' \
  -d '{"customerName":"Alex","items":[{"productId":"burger","quantity":2},{"productId":"cola","quantity":1}]}'

# 3. The order id comes back in the answer. The kitchen now has a ticket:
curl http://localhost/api/kitchen/tickets

# 4. The staff starts cooking, and then says the food is ready
curl -X POST http://localhost/api/kitchen/tickets/<ORDER_ID>/start
curl -X POST http://localhost/api/kitchen/tickets/<ORDER_ID>/ready

# 5. The customer sees the new status and the notifications
curl http://localhost/api/orders/<ORDER_ID>
curl http://localhost/api/notifications/<ORDER_ID>
```

---

## 3. The flow

```
customer
   |  POST /api/orders
   v
 nginx  ->  order-service   (checks the products with product-service,
   |                         calculates the total, saves the order as NEW)
   |                              |
   |                              |  publishes  order.created
   |                              v
   |                          RabbitMQ  (topic exchange "restaurant")
   |                             /  \
   |          kitchen-service <-+    +-> notification-service
   |          (new ticket on           ("we got your order")
   |           the kitchen screen)
   |
   |  the staff presses "start cooking" and later "food is ready"
   v
kitchen-service publishes  kitchen.started  /  kitchen.ready
                              |
                              v
                          RabbitMQ
                             /  \
             order-service <-+    +-> notification-service
             (order becomes         ("we started cooking",
              COOKING, then READY)   "your food is ready")
```

An order has three statuses: **NEW → COOKING → READY**.
A kitchen ticket has the same three: **WAITING → COOKING → READY**.

There are exactly three events, all on the topic exchange `restaurant`:

| Event             | Published by      | Listened to by                       |
| ----------------- | ----------------- | ------------------------------------ |
| `order.created`   | order-service     | kitchen-service, notification-service |
| `kitchen.started` | kitchen-service   | order-service, notification-service   |
| `kitchen.ready`   | kitchen-service   | order-service, notification-service   |

Note that **the kitchen is not a simulation**. There are no timers that pretend
to cook. A real person presses the buttons on the kitchen screen, exactly like
in a real restaurant, and that is what drives the order forward.

---

## 4. The services

| Service                | Public?      | Own table       | Job                                              |
| ---------------------- | ------------ | --------------- | ------------------------------------------------ |
| `nginx`                | **yes** (80) | –               | the only public port and the only gateway        |
| `product-service`      | internal     | `products`      | the menu, and the real prices                    |
| `order-service`        | internal     | `orders`        | creates orders, publishes `order.created`        |
| `kitchen-service`      | internal     | `tickets`       | the kitchen screen the staff works on            |
| `notification-service` | internal     | `notifications` | listens to every event and writes to the customer |
| `postgres`             | internal     | –               | one database, `restaurant`, with four tables     |
| `rabbitmq`             | internal     | –               | one topic exchange, `restaurant`                 |

Every service is built in the same small layers, so it is easy to find things:

```
src/index.ts              HTTP routes and event listeners
src/<name>-logic.ts       the rules and calculations (pure functions, unit tested)
src/<name>.repository.ts  the data layer: every SQL query for that table
src/db.ts                 the database connection
src/rabbit.ts             the RabbitMQ helper
```

---

## 5. Tests

```bash
bun install

bun run test:unit   # fast, does not need Docker
bun run test:e2e    # needs the system to be running
bun test            # everything
```

* **Unit tests** (`tests/unit/`) test the rules on their own: order validation,
  the price calculation, the kitchen status rules and the notification texts.
* **The end to end test** (`tests/e2e/`) uses only `http://localhost`, like a
  real customer and a real member of staff: it reads the menu, places an order,
  waits for the kitchen ticket, starts cooking, marks the food ready, and checks
  that the order became `READY` and that three notifications were saved. It also
  tests the error cases (unknown product, empty order, unknown order, and the
  staff trying to skip a step).

Both run automatically on **every push and pull request** through GitHub Actions
(`.github/workflows/ci.yml`). The end to end job starts the whole system with
Docker Compose on the CI machine before it runs.

---

## 6. What happens when something goes wrong

| Situation                              | What the system does                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| The order has more than 20 lines, a quantity above 50, or a name over 100 characters | `400 Bad Request`. Limits keep one request from fanning out into many product lookups. |
| An unexpected server error (for example a database error) | `500` with a generic message. The details are only written to the service log. |
| The customer orders a product that does not exist | `400 Bad Request`, and **no** order is saved. The check happens before we write anything. |
| The customer sends an empty or broken body | `400 Bad Request` with a list of what was wrong.                                    |
| product-service is down                | `503 Service Unavailable`. We refuse the order instead of saving one with a made up price. |
| notification-service is down           | Nothing stops. The events wait in the durable queue in RabbitMQ, and are handled when the service comes back up. |
| The staff presses "ready" before "start" | `409 Conflict`. A ticket can only move forward.                                     |
| RabbitMQ sends the same event twice     | The kitchen uses `insert ... on conflict do nothing`, so the customer does not get two tickets. |
| A service loses the RabbitMQ connection | It exits, and Docker restarts it, so it connects again from a clean state.           |

---

## 7. Security notes and limitations

* **No authentication.** The kitchen endpoints (`/api/kitchen/*`) are open to
  anyone who can reach port 80. This is a demo; a real deployment would put
  staff login (or at least an API token) in front of them.
* Order ids are random UUIDs and act as the only "secret" for reading an order
  and its notifications.
* All SQL goes through the `postgres` tagged-template driver, so every value is
  sent as a bound parameter.
* The test page escapes all API data before rendering it.

More about the architecture, the design decisions and the test strategy is in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

[MIT](LICENSE)
