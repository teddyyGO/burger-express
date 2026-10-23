// =============================================================================
//  UNIT TESTS for the kitchen rules.
//
//  The important rule is that the staff can only move a ticket forward:
//  WAITING -> COOKING -> READY.
// =============================================================================
import { test, expect, describe } from "bun:test";
import {
  canStartCooking,
  canMarkReady,
  ticketSummary,
  WAITING,
  COOKING,
  READY,
} from "../../services/kitchen-service/src/kitchen-logic";

describe("canStartCooking", () => {
  test("a waiting ticket can be started", () => {
    expect(canStartCooking(WAITING)).toBe(true);
  });

  test("a ticket that is already cooking cannot be started again", () => {
    expect(canStartCooking(COOKING)).toBe(false);
  });

  test("a finished ticket cannot be started", () => {
    expect(canStartCooking(READY)).toBe(false);
  });
});

describe("canMarkReady", () => {
  test("a cooking ticket can be marked ready", () => {
    expect(canMarkReady(COOKING)).toBe(true);
  });

  test("you cannot mark a ticket ready before you started it", () => {
    expect(canMarkReady(WAITING)).toBe(false);
  });

  test("you cannot mark the same ticket ready twice", () => {
    expect(canMarkReady(READY)).toBe(false);
  });
});

describe("ticketSummary", () => {
  test("it writes the items in a short line for the screen", () => {
    const text = ticketSummary([
      { name: "Hamburger", quantity: 2 },
      { name: "Fries", quantity: 1 },
    ]);
    expect(text).toBe("2x Hamburger, 1x Fries");
  });

  test("an empty ticket gives an empty text", () => {
    expect(ticketSummary([])).toBe("");
  });
});
