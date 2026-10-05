const { createOrder } = require('./orderService');
test('rejects empty cart', async () => { await expect(createOrder(1, { items: [] })).rejects.toThrow(); });
