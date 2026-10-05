const express = require('express');
const orderRoutes = require('./routes/orderRoutes');

const app = express();
app.use(express.json());
app.use('/api/orders', orderRoutes);

app.listen(process.env.PORT || 3000);
