// =============================================================================
//  Pure logic for kitchen-service.
//
//  A ticket is one order on the kitchen screen. The staff moves it forward:
//
//      WAITING  --(staff presses "start")-->  COOKING  --("ready")-->  READY
//
//  The staff can never skip a step or go backwards. Those rules are here,
//  as plain functions, so they can be unit tested without Docker.
// =============================================================================

export const WAITING = "WAITING";
export const COOKING = "COOKING";
export const READY = "READY";

// The staff may only start a ticket that is still waiting.
export function canStartCooking(status: string): boolean {
  return status === WAITING;
}

// The staff may only mark a ticket ready if it is being cooked.
export function canMarkReady(status: string): boolean {
  return status === COOKING;
}

// A short text for the kitchen screen, so the staff sees how big the order is.
export function ticketSummary(items: Array<{ name: string; quantity: number }>): string {
  const parts = items.map((item) => `${item.quantity}x ${item.name}`);
  return parts.join(", ");
}
