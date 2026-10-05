const Order = require('../models/Order');
const stripe = require('stripe')(process.env.STRIPE_KEY);

function validateOrder(items) {
  if (!items || items.length === 0) throw new Error('Cart is empty');
}

function calculateTotal(items) {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0);
}

async function createOrder(userId, cart) {
  validateOrder(cart.items);
  const total = calculateTotal(cart.items);
  await stripe.paymentIntents.create({ amount: total, currency: 'usd' });
  return Order.create({ user: userId, items: cart.items, total, status: 'PAID' });
}

async function findOrder(id) {
  return Order.findById(id);
}

module.exports = { createOrder, findOrder };
