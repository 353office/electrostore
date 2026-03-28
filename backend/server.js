require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { createPool } = require('./db');

const app = express();
const pool = createPool();

const BUILD_ID = 'address-route-check-' + new Date().toISOString();

app.use((req, res, next) => {
  res.setHeader('X-ElectroStore-Build', BUILD_ID);
  next();
});

function normalizeOrigin(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

const rawCorsOrigin = process.env.CORS_ORIGIN || '*';
const allowedOrigins = rawCorsOrigin === '*'
  ? '*'
  : rawCorsOrigin.split(',').map(normalizeOrigin).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins === '*') return callback(null, true);
    return callback(null, allowedOrigins.includes(normalizeOrigin(origin)));
  },
  credentials: true
}));
app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).json({ ok: true, service: 'ElectroStore API', db_required: true });
});

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


function normalizeBarcode(value) {
  return String(value || '').trim();
}

function isValidBarcode(value) {
  return /^[0-9]{8,14}$/.test(normalizeBarcode(value));
}

function validateBarcodeOrRespond(res, barcode) {
  if (!isValidBarcode(barcode)) {
    res.status(400).json({ error: 'Баркодът трябва да съдържа само цифри и да е между 8 и 14 знака.' });
    return false;
  }
  return true;
}

app.get('/api/health', async (req, res) => {
  try {
    res.json({ ok: true, service: 'ElectroStore API', timestamp: new Date().toISOString(), build: BUILD_ID });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Health check failed' });
  }
});

app.get('/api/build-info', (req, res) => {
  res.json({
    ok: true,
    build: BUILD_ID,
    routes: [
      'GET /api/health',
      'GET /api/db-health',
      'GET /api/me/addresses',
      'PUT /api/me/addresses',
      'POST /api/me/addresses',
      'PATCH /api/me/addresses'
    ]
  });
});

app.get('/api/db-health', async (req, res) => {
  try {
    const now = await pool.query('SELECT NOW() AS now');
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('product', 'app_users', 'customer', 'orders')
      ORDER BY table_name
    `);
    res.json({
      ok: true,
      database_time: now.rows[0].now,
      tables: tables.rows.map(r => r.table_name)
    });
  } catch (error) {
    console.error('DB health failed:', error);
    res.status(500).json({
      ok: false,
      error: error.message,
      hint: 'Check DATABASE_URL, Aiven SSL settings, and whether init_postgres.sql was imported.'
    });
  }
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
  if (!validateBarcodeOrRespond(res, req.params.barcode)) return;
  const result = await pool.query('SELECT * FROM product WHERE barcode = $1', [normalizeBarcode(req.params.barcode)]);
  if (!result.rows[0]) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json(result.rows[0]);
});

app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT category FROM product WHERE category IS NOT NULL ORDER BY category');
    res.json(result.rows.map(r => r.category));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not load categories', details: error.message });
  }
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
    const normalizedBarcode = normalizeBarcode(barcode);
    if (!validateBarcodeOrRespond(res, normalizedBarcode)) return;
    const qty = Math.max(1, Number(quantity) || 1);

    const productResult = await pool.query('SELECT * FROM product WHERE barcode = $1', [normalizedBarcode]);
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
      [cart.id, normalizedBarcode]
    );

    if (existing.rows[0]) {
      const newQty = existing.rows[0].quantity + qty;
      if (newQty > Number(product.stock_qty || 0)) {
        return res.status(400).json({ error: product.stock_qty > 0 ? `Няма достатъчна наличност за ${product.name}.` : 'Продуктът е изчерпан.' });
      }
      await pool.query('UPDATE cart_items SET quantity = $1 WHERE id = $2', [newQty, existing.rows[0].id]);
    } else {
      if (qty > Number(product.stock_qty || 0)) {
        return res.status(400).json({ error: product.stock_qty > 0 ? `Няма достатъчна наличност за ${product.name}.` : 'Продуктът е изчерпан.' });
      }
      await pool.query('INSERT INTO cart_items (cart_id, barcode, quantity) VALUES ($1, $2, $3)', [cart.id, normalizedBarcode, qty]);
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
    const itemResult = await pool.query(
      `SELECT ci.id, p.stock_qty, p.name
       FROM cart_items ci
       JOIN product p ON p.barcode = ci.barcode
       WHERE ci.id = $1
         AND ci.cart_id IN (SELECT id FROM carts WHERE user_id = $2 AND status = 'active')`,
      [req.params.id, req.user.id]
    );
    const item = itemResult.rows[0];
    if (!item) return res.status(404).json({ error: 'Артикулът не е намерен в количката.' });
    if (qty > Number(item.stock_qty || 0)) {
      return res.status(400).json({ error: item.stock_qty > 0 ? `Няма достатъчна наличност за ${item.name}.` : 'Продуктът е изчерпан.' });
    }
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
    if (req.user.role !== 'customer' || !req.user.customer_egn) {
      return res.status(400).json({ error: 'Само клиентски профили могат да финализират поръчка.', code: 'NOT_CUSTOMER' });
    }

    const { shipping_address_id, billing_address_id, payment_method = 'Card', notes = '' } = req.body || {};

    let resolvedShippingId = shipping_address_id || null;
    let resolvedBillingId = billing_address_id || null;

    if (!resolvedShippingId || !resolvedBillingId) {
      const addressResult = await pool.query(
        `SELECT id, address_type, is_default
         FROM customer_address
         WHERE egn = $1
         ORDER BY is_default DESC, id ASC`,
        [req.user.customer_egn]
      );
      const addresses = addressResult.rows;
      const shippingAddress = addresses.find(a => String(a.address_type || '').toLowerCase() === 'shipping') || addresses[0];
      const billingAddress = addresses.find(a => String(a.address_type || '').toLowerCase() === 'billing') || shippingAddress || addresses[0];
      resolvedShippingId = resolvedShippingId || (shippingAddress ? shippingAddress.id : null);
      resolvedBillingId = resolvedBillingId || (billingAddress ? billingAddress.id : null);
    }

    if (!resolvedShippingId || !resolvedBillingId) {
      return res.status(400).json({ error: 'Моля въведи и запази адрес за доставка и адрес за фактура.', code: 'MISSING_ADDRESSES' });
    }

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

    const itemsResult = await pool.query(
      `SELECT ci.*, p.name, p.price, p.stock_qty
       FROM cart_items ci
       JOIN product p ON p.barcode = ci.barcode
       WHERE ci.cart_id = $1`,
      [cart.id]
    );

    const items = itemsResult.rows;
    if (!items.length) {
      return res.status(400).json({ error: 'Количката е празна.', code: 'EMPTY_CART' });
    }

    for (const item of items) {
      if (item.quantity > item.stock_qty) {
        return res.status(400).json({ error: `Няма достатъчна наличност за ${item.name}.`, code: 'INSUFFICIENT_STOCK', barcode: item.barcode });
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
      [notes, subtotal, tax, shipping, total, resolvedShippingId, resolvedBillingId, payment_method, req.user.customer_egn]
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

async function saveAddressesHandler(req, res) {
  const client = await pool.connect();
  try {
    if (!req.user.customer_egn) {
      return res.status(400).json({ error: 'No customer profile linked to this account' });
    }

    const shippingAddress = String(req.body?.shipping_address || '').trim();
    const billingAddress = String(req.body?.billing_address || '').trim();

    if (!shippingAddress || !billingAddress) {
      return res.status(400).json({ error: 'Shipping and billing addresses are required' });
    }

    await client.query('BEGIN');

    const shippingExisting = await client.query(
      `SELECT id FROM customer_address WHERE egn = $1 AND LOWER(COALESCE(address_type, '')) = 'shipping' ORDER BY id ASC LIMIT 1`,
      [req.user.customer_egn]
    );

    let shippingId;
    if (shippingExisting.rows[0]) {
      const updated = await client.query(
        `UPDATE customer_address SET address = $1, is_default = TRUE WHERE id = $2 RETURNING id`,
        [shippingAddress, shippingExisting.rows[0].id]
      );
      shippingId = updated.rows[0].id;
    } else {
      const inserted = await client.query(
        `INSERT INTO customer_address (address, address_type, is_default, egn) VALUES ($1, 'Shipping', TRUE, $2) RETURNING id`,
        [shippingAddress, req.user.customer_egn]
      );
      shippingId = inserted.rows[0].id;
    }

    const billingExisting = await client.query(
      `SELECT id FROM customer_address WHERE egn = $1 AND LOWER(COALESCE(address_type, '')) = 'billing' ORDER BY id ASC LIMIT 1`,
      [req.user.customer_egn]
    );

    let billingId;
    if (billingExisting.rows[0]) {
      const updated = await client.query(
        `UPDATE customer_address SET address = $1, is_default = FALSE WHERE id = $2 RETURNING id`,
        [billingAddress, billingExisting.rows[0].id]
      );
      billingId = updated.rows[0].id;
    } else {
      const inserted = await client.query(
        `INSERT INTO customer_address (address, address_type, is_default, egn) VALUES ($1, 'Billing', FALSE, $2) RETURNING id`,
        [billingAddress, req.user.customer_egn]
      );
      billingId = inserted.rows[0].id;
    }

    await client.query('COMMIT');
    res.json({
      ok: true,
      shipping_address_id: shippingId,
      billing_address_id: billingId
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Could not save addresses' });
  } finally {
    client.release();
  }
}

app.put('/api/me/addresses', authRequired, saveAddressesHandler);
app.post('/api/me/addresses', authRequired, saveAddressesHandler);
app.patch('/api/me/addresses', authRequired, saveAddressesHandler);

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

    const normalizedBarcode = normalizeBarcode(barcode);
    if (!validateBarcodeOrRespond(res, normalizedBarcode)) return;

    const result = await pool.query(
      `INSERT INTO product
      (barcode, name, price, brand, stock_qty, category, model, release_year, release_month, managed_by_egn, image_url, description, is_featured)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *`,
      [normalizedBarcode, name, price, brand, stock_qty, category, model, release_year || null, release_month || null, req.user.staff_egn, image_url || null, description || null, !!is_featured]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not create product' });
  }
});

app.put('/api/admin/products/:barcode', authRequired, adminRequired, async (req, res) => {
  try {
    if (!validateBarcodeOrRespond(res, req.params.barcode)) return;
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
    if (!validateBarcodeOrRespond(res, req.params.barcode)) return;
    await pool.query('DELETE FROM product WHERE barcode = $1', [normalizeBarcode(req.params.barcode)]);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not delete product. Remove order references first.' });
  }
});

app.get('/api/admin/orders', authRequired, adminRequired, async (req, res) => {
  const result = await pool.query(
    `SELECT o.id, o.order_status, o.total_amount, o.order_date, o.payment_method,
            o.order_subtotal, o.tax_amount, o.shipping_cost, o.notes, o.tracking_number,
            c.first_name, c.last_name, c.city, c.country,
            sa.address AS shipping_address,
            ba.address AS billing_address,
            COALESCE(SUM(oi.qty), 0)::INT AS item_count
     FROM orders o
     LEFT JOIN customer c ON c.egn = o.egn
     LEFT JOIN customer_address sa ON sa.id = o.shipping_address_id
     LEFT JOIN customer_address ba ON ba.id = o.billing_address_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     GROUP BY o.id, c.first_name, c.last_name, c.city, c.country, sa.address, ba.address
     ORDER BY o.order_date DESC`
  );
  res.json(result.rows);
});

app.get('/api/admin/orders/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const orderResult = await pool.query(
      `SELECT o.*, c.first_name, c.middle_name, c.last_name, c.country, c.city, c.street, c.street_no,
              sa.address AS shipping_address,
              ba.address AS billing_address
       FROM orders o
       LEFT JOIN customer c ON c.egn = o.egn
       LEFT JOIN customer_address sa ON sa.id = o.shipping_address_id
       LEFT JOIN customer_address ba ON ba.id = o.billing_address_id
       WHERE o.id = $1`,
      [req.params.id]
    );
    const order = orderResult.rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const itemsResult = await pool.query(
      `SELECT oi.id, oi.qty, oi.unit_price, oi.subtotal, oi.discount_amount,
              p.barcode, p.name, p.brand, p.category, p.model
       FROM order_items oi
       JOIN product p ON p.barcode = oi.barcode
       WHERE oi.order_id = $1
       ORDER BY p.name`,
      [req.params.id]
    );

    res.json({ ...order, items: itemsResult.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not load order details' });
  }
});

app.delete('/api/admin/orders/:id', authRequired, adminRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const itemsResult = await client.query('SELECT barcode, qty FROM order_items WHERE order_id = $1', [req.params.id]);
    const orderResult = await client.query('SELECT id FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!orderResult.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    for (const item of itemsResult.rows) {
      await client.query('UPDATE product SET stock_qty = stock_qty + $1 WHERE barcode = $2', [item.qty, item.barcode]);
    }

    await client.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Could not delete order' });
  } finally {
    client.release();
  }
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

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error', details: error.message });
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`ElectroStore API running on port ${port}`);
});
