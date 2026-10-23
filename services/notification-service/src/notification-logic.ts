// =============================================================================
//  Pure logic for notification-service.
//
//  It turns an event into the text the customer reads. No database, no network,
//  so it is easy to unit test.
// =============================================================================

// Returns the message for an event, or null if we have nothing to say
// about that event.
export function buildMessage(routingKey: string, event: any): string | null {
  if (routingKey === "order.created") {
    return `Hi ${event.customerName}! We got your order. Total: ${event.total} kr.`;
  }
  if (routingKey === "kitchen.started") {
    return "The kitchen has started making your food.";
  }
  if (routingKey === "kitchen.ready") {
    return "Your order is ready! Please pick it up at the counter.";
  }
  return null;
}
