// =============================================================================
//  UNIT TESTS for the order rules.
//
//  These test plain functions, so no Docker and no database is needed.
//  Run them with: bun test tests/unit
// =============================================================================
import { test, expect, describe } from "bun:test";
import {
  validateOrder,
  buildOrderLine,
  calculateTotal,
  statusFromKitchenEvent,
  round2,
  COOKING,
  READY,
} from "../../services/order-service/src/order-logic";

describe("validateOrder", () => {
  test("a correct order gives no errors", () => {
    const errors = validateOrder({
      customerName: "Alex",
      items: [{ productId: "burger", quantity: 2 }],
    });
    expect(errors.length).toBe(0);
  });

  test("an order without items is not allowed", () => {
    const errors = validateOrder({ customerName: "Alex", items: [] });
    expect(errors.length).toBeGreaterThan(0);
  });

  test("an order without a customer name is not allowed", () => {
    const errors = validateOrder({
      customerName: "   ",
      items: [{ productId: "burger", quantity: 1 }],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  test("quantity 0 or less is not allowed", () => {
    const errors = validateOrder({
      customerName: "Alex",
      items: [{ productId: "burger", quantity: 0 }],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  test("quantity must be a whole number", () => {
    const errors = validateOrder({
      customerName: "Alex",
      items: [{ productId: "burger", quantity: 1.5 }],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  test("you cannot order 1000 burgers", () => {
    const errors = validateOrder({
      customerName: "Alex",
      items: [{ productId: "burger", quantity: 1000 }],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  test("a very long customer name is not allowed", () => {
    const errors = validateOrder({
      customerName: "x".repeat(101),
      items: [{ productId: "burger", quantity: 1 }],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  test("more than 20 order lines is not allowed", () => {
    const items = Array.from({ length: 21 }, () => ({ productId: "burger", quantity: 1 }));
    const errors = validateOrder({ customerName: "Alex", items });
    expect(errors.length).toBeGreaterThan(0);
  });

  test("an empty body is not allowed", () => {
    expect(validateOrder(null).length).toBeGreaterThan(0);
    expect(validateOrder({}).length).toBeGreaterThan(0);
  });
});

describe("prices", () => {
  test("a line total is price times quantity", () => {
    const line = buildOrderLine({ id: "burger", name: "Hamburger", price: 79 }, 3);
    expect(line.lineTotal).toBe(237);
    expect(line.productId).toBe("burger");
  });

  test("the total is all the lines added together", () => {
    const lines = [
      buildOrderLine({ id: "burger", name: "Hamburger", price: 79 }, 2),
      buildOrderLine({ id: "cola", name: "Cola 40cl", price: 29 }, 1),
    ];
    expect(calculateTotal(lines)).toBe(187);
  });

  test("the total of nothing is 0", () => {
    expect(calculateTotal([])).toBe(0);
  });

  test("money is rounded to two decimals", () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe("statusFromKitchenEvent", () => {
  test("kitchen.started means the order is COOKING", () => {
    expect(statusFromKitchenEvent("kitchen.started")).toBe(COOKING);
  });

  test("kitchen.ready means the order is READY", () => {
    expect(statusFromKitchenEvent("kitchen.ready")).toBe(READY);
  });

  test("an unknown event is ignored", () => {
    expect(statusFromKitchenEvent("something.else")).toBe(null);
  });
});
