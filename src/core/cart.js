// =====================================================================
// cart.js — the FoodNow MENU and the source of truth for PRICE.
//
// KEY INTERVIEW POINT:
//   The browser only ever sends an ITEM ID. The price is looked up HERE,
//   on the server. The browser never sends or is trusted for an amount.
//   If we trusted the client, a user could open dev tools and pay $0.01
//   for a $40 order. So the server owns the money math, always.
//
//   The storefront, the checkout page, and the charge all read from this
//   same object, so what the customer sees can never drift from what we
//   actually charge.
// =====================================================================

// Hardcoded menu so we don't drag a database into a demo. Amounts are in
// the smallest currency unit (cents for USD): 1850 = $18.50.
const MENU = {
  "1": {
    title: "Margherita Pizza",
    vendor: "Tony's Pizzeria",
    description:
      "Wood-fired sourdough crust, San Marzano tomato, fresh mozzarella, and basil.",
    emoji: "🍕",
    amount: 1850,
  },
  "2": {
    title: "Spicy Tuna Roll Set",
    vendor: "Sakura Sushi",
    description:
      "Eight pieces of spicy tuna roll with avocado, cucumber, and a side of miso soup.",
    emoji: "🍣",
    amount: 2200,
  },
  "3": {
    title: "Double Smash Burger + Fries",
    vendor: "Patty Stack",
    description:
      "Two seared beef patties, American cheese, house sauce, and crispy fries.",
    emoji: "🍔",
    amount: 1599,
  },
};

const CURRENCY = "usd";

// Return the full menu as an array (for rendering the storefront grid).
function getMenu() {
  return Object.entries(MENU).map(([id, item]) => ({ id, ...item }));
}

// Look up one menu item by id. Returns undefined if the id is unknown.
function getItem(itemId) {
  return MENU[itemId];
}

module.exports = { MENU, CURRENCY, getMenu, getItem };
