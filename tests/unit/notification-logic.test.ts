// =============================================================================
//  UNIT TESTS for the notification texts.
// =============================================================================
import { test, expect, describe } from "bun:test";
import { buildMessage } from "../../services/notification-service/src/notification-logic";

describe("buildMessage", () => {
  test("order.created says thank you and shows the total", () => {
    const text = buildMessage("order.created", { customerName: "Alex", total: 187 });
    expect(text).toContain("Alex");
    expect(text).toContain("187");
  });

  test("kitchen.started tells the customer the food is being made", () => {
    const text = buildMessage("kitchen.started", {});
    expect(text).toContain("started");
  });

  test("kitchen.ready tells the customer to pick up the food", () => {
    const text = buildMessage("kitchen.ready", {});
    expect(text).toContain("ready");
  });

  test("an event we do not know gives no message", () => {
    expect(buildMessage("user.created", {})).toBe(null);
  });
});
