// The menu. It is inserted on startup, but only if the table is empty.
// This is why "docker compose up" is enough - you never run SQL by hand.
import { countProducts, insertProduct, type Product } from "./products.repository";

export const MENU: Product[] = [
  { id: "burger", name: "Hamburger", price: 79 },
  { id: "cheeseburger", name: "Cheeseburger", price: 89 },
  { id: "chicken-burger", name: "Chicken Burger", price: 99 },
  { id: "veggie-burger", name: "Veggie Burger", price: 95 },
  { id: "fries", name: "Fries", price: 39 },
  { id: "nuggets", name: "Nuggets 10 pcs", price: 59 },
  { id: "salad", name: "Side Salad", price: 45 },
  { id: "cola", name: "Cola 40cl", price: 29 },
  { id: "coffee", name: "Coffee", price: 25 },
  { id: "milkshake", name: "Milkshake", price: 49 },
];

export async function seedMenu() {
  const total = await countProducts();
  if (total > 0) {
    console.log("[product-service] menu already exists, no seeding needed");
    return;
  }

  for (const product of MENU) {
    await insertProduct(product);
  }
  console.log(`[product-service] seeded ${MENU.length} products`);
}
