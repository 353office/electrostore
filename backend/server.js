require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { createPool } = require('./db');

const app = express();
const pool = createPool();

const configuredOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)
  .map(origin => origin === '*' ? origin : origin.replace(/\/$/, ''));

app.use(cors({
  origin(origin, callback) {
    if (!origin || configuredOrigins.includes('*')) return callback(null, true);
    const normalizedOrigin = origin.replace(/\/$/, '');
    if (configuredOrigins.includes(normalizedOrigin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json());

function mapUser(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    display_name: row.display_name,
    customer_egn: row.customer_egn,
    staff_egn: row.staff_egn
  };
}

async function getUserFromToken(token) {
  const result = await pool.query(
    `SELECT u.*
     FROM app_sessions s
     JOIN app_users u ON u.id = s.user_id
     WHERE s.token = $1`,
    [token]
  );
  return result.rows[0] || null;
}

async function authRequired(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'Missing token' });
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

function adminRequired(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

app.get('/api/health', async (req, res) => {
  const result = await pool.query('SELECT NOW() AS now');
  res.json({ ok: true, time: result.rows[0].now });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const result = await pool.query('SELECT * FROM app_users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const ok = user.password_hash.startsWith('plain:')
      ? password === user.password_hash.slice(6)
      : await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = uuidv4();
    await pool.query('INSERT INTO app_sessions (token, user_id) VALUES ($1, $2)', [token, user.id]);

    res.json({ token, user: mapUser(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/session', authRequired, async (req, res) => {
  res.json({ user: mapUser(req.user) });
});

app.post('/api/auth/logout', authRequired, async (req, res) => {
  await pool.query('DELETE FROM app_sessions WHERE token = $1', [req.token]);
  res.json({ ok: true });
});

app.get('/api/products', async (req, res) => {
  try {
    const { search = '', category = '', featured = '' } = req.query;
    let where = [];
    let params = [];
    if (search) {
      params.push(`%${search}%`);
      where.push(`(p.name ILIKE $${params.length} OR p.brand ILIKE $${params.length} OR p.model ILIKE $${params.length})`);
    }
    if (category) {
      params.push(category);
      where.push(`p.category = $${params.length}`);
    }
    if (featured === 'true') {
      where.push('p.is_featured = TRUE');
    }
    const sql = `
      SELECT p.*
      FROM product p
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY p.is_featured DESC, p.name ASC
    `;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not load products' });
  }
});

app.get('/api/products/:barcode', async (req, res) => {
  const result = await pool.query('SELECT * FROM product WHERE barcode = $1', [req.params.barcode]);
  if (!result.rows[0]) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json(result.rows[0]);
});

app.get('/api/categories', async (req, res) => {
  const result = await pool.query('SELECT DISTINCT category FROM product WHERE category IS NOT NULL ORDER BY category');
  res.json(result.rows.map(r => r.category));
});

app.get('/api/cart', authRequired, async (req, res) => {
  try {
    let cartResult = await pool.query(
      'SELECT * FROM carts WHERE user_id = $1 AND status = $2 ORDER BY id DESC LIMIT 1',
      [req.user.id, 'active']
    );

    let cart = cartResult.rows[0];
    if (!cart) {
      cartResult = await pool.query(
        'INSERT INTO carts (user_id, status) VALUES ($1, $2) RETURNING *',
        [req.user.id, 'active']
      );
      cart = cartResult.rows[0];
    }

    const items = await pool.query(
      `SELECT ci.id, ci.quantity, p.barcode, p.name, p.brand, p.price, p.stock_qty, p.image_url
       FROM cart_items ci
       JOIN product p ON p.barcode = ci.barcode
       WHERE ci.cart_id = $1
       ORDER BY p.name`,
      [cart.id]
    );

    const subtotal = items.rows.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
    res.json({ cart_id: cart.id, items: items.rows, subtotal: subtotal.toFixed(2) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not load cart' });
  }
});

app.post('/api/cart/items', authRequired, async (req, res) => {
  try {
    const { barcode, quantity = 1 } = req.body;
    const qty = Math.max(1, Number(quantity) || 1);

    const productResult = await pool.query('SELECT * FROM product WHERE barcode = $1', [barcode]);
    const product = productResult.rows[0];
    if (!product) return res.status(404).json({ error: 'Product not found' });

    let cartResult = await pool.query(
      'SELECT * FROM carts WHERE user_id = $1 AND status = $2 ORDER BY id DESC LIMIT 1',
      [req.user.id, 'active']
    );
    let cart = cartResult.rows[0];
    if (!cart) {
      cartResult = await pool.query(
        'INSERT INTO carts (user_id, status) VALUES ($1, $2) RETURNING *',
        [req.user.id, 'active']
      );
      cart = cartResult.rows[0];
    }

    const existing = await pool.query(
      'SELECT * FROM cart_items WHERE cart_id = $1 AND barcode = $2',
      [cart.id, barcode]
    );

    if (existing.rows[0]) {
      const newQty = existing.rows[0].quantity + qty;
      await pool.query('UPDATE cart_items SET quantity = $1 WHERE id = $2', [newQty, existing.rows[0].id]);
    } else {
      await pool.query('INSERT INTO cart_items (cart_id, barcode, quantity) VALUES ($1, $2, $3)', [cart.id, barcode, qty]);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not update cart' });
  }
});

app.patch('/api/cart/items/:id', authRequired, async (req, res) => {
  try {
    const qty = Math.max(1, Number(req.body.quantity) || 1);
    await pool.query(
      `UPDATE cart_items
       SET quantity = $1
       WHERE id = $2
         AND cart_id IN (SELECT id FROM carts WHERE user_id = $3 AND status = 'active')`,
      [qty, req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not update item quantity' });
  }
});

app.delete('/api/cart/items/:id', authRequired, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM cart_items
       WHERE id = $1
         AND cart_id IN (SELECT id FROM carts WHERE user_id = $2 AND status = 'active')`,
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not remove item' });
  }
});

app.post('/api/orders/checkout', authRequired, async (req, res) => {
  try {
    if (!req.user.customer_egn) {
      return res.status(400).json({ error: 'Only customer accounts can checkout' });
    }

    const { shipping_address_id, billing_address_id, payment_method = 'Card', notes = '' } = req.body || {};

    const cartResult = await pool.query(
      'SELECT * FROM carts WHERE user_id = $1 AND status = $2 ORDER BY id DESC LIMIT 1',
      [req.user.id, 'active']
    );
    const cart = cartResult.rows[0];
    if (!cart) return res.status(400).json({ error: 'No active cart found' });

    const itemsResult = await pool.query(
      `SELECT ci.*, p.name, p.price, p.stock_qty
       FROM cart_items ci
       JOIN product p ON p.barcode = ci.barcode
       WHERE ci.cart_id = $1`,
      [cart.id]
    );

    const items = itemsResult.rows;
    if (!items.length) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    for (const item of items) {
      if (item.quantity > item.stock_qty) {
        return res.status(400).json({ error: `Insufficient stock for ${item.name}` });
      }
    }

    const subtotal = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
    const tax = Number((subtotal * 0.2).toFixed(2));
    const shipping = subtotal >= 1000 ? 0 : 15;
    const total = Number((subtotal + tax + shipping).toFixed(2));

    const orderResult = await pool.query(
      `INSERT INTO orders
      (notes, order_status, order_subtotal, tax_amount, shipping_cost, total_amount, shipping_address_id, billing_address_id, payment_method, egn)
      VALUES ($1, 'Processing', $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [notes, subtotal, tax, shipping, total, shipping_address_id || null, billing_address_id || null, payment_method, req.user.customer_egn]
    );
    const order = orderResult.rows[0];

    for (const item of items) {
      const itemSubtotal = Number(item.price) * item.quantity;
      await pool.query(
        `INSERT INTO order_items (barcode, egn, order_id, qty, unit_price, subtotal, discount_amount)
         VALUES ($1, $2, $3, $4, $5, $6, 0)`,
        [item.barcode, req.user.customer_egn, order.id, item.quantity, item.price, itemSubtotal]
      );
      await pool.query(
        'UPDATE product SET stock_qty = stock_qty - $1 WHERE barcode = $2',
        [item.quantity, item.barcode]
      );
    }

    await pool.query('UPDATE carts SET status = $1 WHERE id = $2', ['converted', cart.id]);
    await pool.query('INSERT INTO carts (user_id, status) VALUES ($1, $2)', [req.user.id, 'active']);

    res.json({ ok: true, order_id: order.id, total_amount: order.total_amount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

app.get('/api/orders/me', authRequired, async (req, res) => {
  try {
    if (!req.user.customer_egn) return res.json([]);
    const result = await pool.query(
      `SELECT o.*,
              COUNT(oi.id) AS item_count
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.egn = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [req.user.customer_egn]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not load orders' });
  }
});

app.get('/api/me/addresses', authRequired, async (req, res) => {
  try {
    if (!req.user.customer_egn) return res.json([]);
    const result = await pool.query(
      'SELECT * FROM customer_address WHERE egn = $1 ORDER BY is_default DESC, id ASC',
      [req.user.customer_egn]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not load addresses' });
  }
});

app.get('/api/admin/summary', authRequired, adminRequired, async (req, res) => {
  try {
    const [products, lowStock, orders, revenue] = await Promise.all([
      pool.query('SELECT COUNT(*)::INT AS count FROM product'),
      pool.query('SELECT COUNT(*)::INT AS count FROM product WHERE stock_qty <= 10'),
      pool.query('SELECT COUNT(*)::INT AS count FROM orders'),
      pool.query("SELECT COALESCE(SUM(total_amount), 0)::NUMERIC(12,2) AS revenue FROM orders")
    ]);

    res.json({
      products: products.rows[0].count,
      low_stock_products: lowStock.rows[0].count,
      orders: orders.rows[0].count,
      revenue: revenue.rows[0].revenue
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not load admin summary' });
  }
});

app.get('/api/admin/products', authRequired, adminRequired, async (req, res) => {
  const result = await pool.query('SELECT * FROM product ORDER BY name ASC');
  res.json(result.rows);
});

app.post('/api/admin/products', authRequired, adminRequired, async (req, res) => {
  try {
    const {
      barcode,
      name,
      price,
      brand,
      stock_qty = 0,
      category,
      model,
      release_year,
      release_month,
      image_url,
      description,
      is_featured = false
    } = req.body;

    const result = await pool.query(
      `INSERT INTO product
      (barcode, name, price, brand, stock_qty, category, model, release_year, release_month, managed_by_egn, image_url, description, is_featured)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *`,
      [barcode, name, price, brand, stock_qty, category, model, release_year || null, release_month || null, req.user.staff_egn, image_url || null, description || null, !!is_featured]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not create product' });
  }
});

app.put('/api/admin/products/:barcode', authRequired, adminRequired, async (req, res) => {
  try {
    const {
      name,
      price,
      brand,
      stock_qty,
      category,
      model,
      release_year,
      release_month,
      image_url,
      description,
      is_featured
    } = req.body;

    const result = await pool.query(
      `UPDATE product
       SET name = $1,
           price = $2,
           brand = $3,
           stock_qty = $4,
           category = $5,
           model = $6,
           release_year = $7,
           release_month = $8,
           image_url = $9,
           description = $10,
           is_featured = $11,
           managed_by_egn = $12
       WHERE barcode = $13
       RETURNING *`,
      [name, price, brand, stock_qty, category, model, release_year || null, release_month || null, image_url || null, description || null, !!is_featured, req.user.staff_egn, req.params.barcode]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not update product' });
  }
});

app.delete('/api/admin/products/:barcode', authRequired, adminRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM product WHERE barcode = $1', [req.params.barcode]);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not delete product. Remove order references first.' });
  }
});

app.get('/api/admin/orders', authRequired, adminRequired, async (req, res) => {
  const result = await pool.query(
    `SELECT o.id, o.order_status, o.total_amount, o.order_date, o.payment_method,
            c.first_name, c.last_name, c.egn
     FROM orders o
     LEFT JOIN customer c ON c.egn = o.egn
     ORDER BY o.order_date DESC`
  );
  res.json(result.rows);
});

app.patch('/api/admin/orders/:id/status', authRequired, adminRequired, async (req, res) => {
  const { order_status } = req.body;
  const result = await pool.query(
    `UPDATE orders
     SET order_status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING *`,
    [order_status, req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Order not found' });
  res.json(result.rows[0]);
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`ElectroStore API running on port ${port}`);
});
