// =============================================================================
//  Pure logic for order-service.
//
//  There is no database and no network in this file, only plain functions.
//  That is exactly why it is easy to unit test (see tests/unit/order-logic.test.ts).
// =============================================================================

// The three statuses an order can have.
export const NEW = "NEW";
export const COOKING = "COOKING";
export const READY = "READY";

export type OrderLine = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  lineTotal: number;
};

// round to 2 decimals.
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Checks the body the customer sent us.
// Returns a list of problems. An empty list means the body is ok.
export function validateOrder(body: any): string[] {
  const errors: string[] = [];

  if (!body || typeof body !== "object") {
    errors.push("body must be a json object");
    return errors;
  }

  if (typeof body.customerName !== "string" || body.customerName.trim() === "") {
    errors.push("customerName must be a non-empty text");
  } else if (body.customerName.trim().length > 100) {
    errors.push("customerName may not be longer than 100 characters");
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push("items must be a list with at least one item");
    return errors;
  }

  // Every line is one HTTP call to product-service, so the list is capped.
  if (body.items.length > 20) {
    errors.push("items may not have more than 20 lines");
    return errors;
  }

  for (let i = 0; i < body.items.length; i++) {
    const item = body.items[i];

    if (!item || typeof item.productId !== "string" || item.productId.trim() === "" || item.productId.length > 100) {
      errors.push(`items[${i}].productId must be a non-empty text of at most 100 characters`);
    }
    if (!Number.isInteger(item?.quantity) || item.quantity < 1) {
      errors.push(`items[${i}].quantity must be a whole number above 0`);
    }
    if (Number.isInteger(item?.quantity) && item.quantity > 50) {
      errors.push(`items[${i}].quantity may not be more than 50`);
    }
  }

  return errors;
}

export function buildOrderLine(
  product: { id: string; name: string; price: number },
  quantity: number,
): OrderLine {
  return {
    productId: product.id,
    name: product.name,
    price: product.price,
    quantity: quantity,
    lineTotal: round2(product.price * quantity),
  };
}

// Adds all the lines together.
export function calculateTotal(lines: OrderLine[]): number {
  let total = 0;
  for (const line of lines) {
    total = total + line.lineTotal;
  }
  return round2(total);
}

// The kitchen tells us what happened, and we translate that into an order status.
// If we get an event we do not know about, we return null and ignore it.
export function statusFromKitchenEvent(routingKey: string): string | null {
  if (routingKey === "kitchen.started") return COOKING;
  if (routingKey === "kitchen.ready") return READY;
  return null;
}
