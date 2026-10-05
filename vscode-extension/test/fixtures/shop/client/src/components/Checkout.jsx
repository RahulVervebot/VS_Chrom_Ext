import React, { useState } from 'react';
import { placeOrder } from '../services/orderService';

export default function Checkout({ cart }) {
  const [status, setStatus] = useState('idle');

  async function handlePlaceOrder() {
    setStatus('loading');
    const order = await placeOrder(cart);
    setStatus('done');
    return order;
  }

  return (
    <div>
      <button onClick={handlePlaceOrder}>Place Order</button>
    </div>
  );
}
