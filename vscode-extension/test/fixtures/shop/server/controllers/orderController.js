const orderService = require('../services/orderService');

async function createOrder(req, res) {
  try {
    const order = await orderService.createOrder(req.user.id, req.body);
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function getOrder(req, res) {
  const order = await orderService.findOrder(req.params.id);
  res.json(order);
}

module.exports = { createOrder, getOrder };
