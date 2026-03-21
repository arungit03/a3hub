import { MENU_ITEM_STATUS } from "./canteen";

export const sampleMenuItems = [
  {
    name: "Paneer Puff",
    description: "Flaky bakery puff filled with spiced paneer and onions.",
    image:
      "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=80",
    price: 35,
    category: "Snacks",
    quantity: 18,
    status: MENU_ITEM_STATUS.AVAILABLE,
    visible: true,
  },
  {
    name: "Masala Lemon Rice",
    description: "Ready-to-serve lemon rice with peanuts and curry leaves.",
    image:
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80",
    price: 65,
    category: "Meals",
    quantity: 7,
    status: MENU_ITEM_STATUS.LIMITED,
    visible: true,
  },
  {
    name: "Cold Coffee",
    description: "Chilled coffee topped with thick foam.",
    image:
      "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=900&q=80",
    price: 45,
    category: "Drinks",
    quantity: 12,
    status: MENU_ITEM_STATUS.AVAILABLE,
    visible: true,
  },
  {
    name: "Veg Sandwich",
    description: "Fresh sandwich layered with vegetables and mint chutney.",
    image:
      "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=900&q=80",
    price: 50,
    category: "Snacks",
    quantity: 4,
    status: MENU_ITEM_STATUS.LIMITED,
    visible: true,
  },
  {
    name: "Mini Meals Combo",
    description: "Curd rice, pickle, chips, and one sweet in a combo tray.",
    image:
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80",
    price: 90,
    category: "Combos",
    quantity: 0,
    status: MENU_ITEM_STATUS.SOLD_OUT,
    visible: true,
  },
  {
    name: "Fruit Custard Cup",
    description: "Fresh-cut seasonal fruits mixed in chilled custard.",
    image:
      "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=900&q=80",
    price: 40,
    category: "Desserts",
    quantity: 6,
    status: MENU_ITEM_STATUS.AVAILABLE,
    visible: false,
  },
];

export default sampleMenuItems;
