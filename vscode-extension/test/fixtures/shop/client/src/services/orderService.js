export async function placeOrder(cart) {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cart),
  });
  return res.json();
}

// fetch('/api/commented-out', { method: 'POST' })
