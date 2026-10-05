CREATE TABLE users (
  id INT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE payments (
  id INT PRIMARY KEY,
  order_id INT NOT NULL,
  amount DECIMAL(10,2),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE orders (
  id INT PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  total DECIMAL(10,2)
);
