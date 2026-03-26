window.STATE = {
  user: null,
  products: [],
  categories: [],
  cart: null,
  currentPage: 'shop',
  editingBarcode: null
};

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  tryRestoreSession();
  await loadCatalog();
});

function bindEvents() {
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('search-input').addEventListener('input', loadCatalog);
  document.getElementById('category-filter').addEventListener('change', loadCatalog);
  document.getElementById('checkout-form').addEventListener('submit', handleCheckout);
  document.getElementById('product-form').addEventListener('submit', handleSaveProduct);
}

async function tryRestoreSession() {
  const token = localStorage.getItem('electrostore_token');
  if (!token) {
    updateAuthUI();
    return;
  }
  try {
    const { user } = await API.getSession();
    STATE.user = user;
    updateAuthUI();
    if (user.role === 'customer') {
      await refreshCart();
      await loadAddresses();
      await loadOrders();
    }
    if (user.role === 'admin') {
      await loadAdmin();
    }
  } catch (error) {
    localStorage.removeItem('electrostore_token');
    updateAuthUI();
  }
}

function updateAuthUI() {
  const loginScreen = document.getElementById('login-screen');
  const appScreen = document.getElementById('app-screen');
  const userBadge = document.getElementById('user-badge');
  const adminNav = document.getElementById('admin-nav');
  const cartNav = document.getElementById('cart-nav');
  const ordersNav = document.getElementById('orders-nav');
  const authActions = document.getElementById('auth-actions');

  if (!STATE.user) {
    loginScreen.classList.remove('hidden');
    appScreen.classList.add('blurred');
    userBadge.textContent = 'Guest';
    adminNav.classList.add('hidden');
    cartNav.classList.add('hidden');
    ordersNav.classList.add('hidden');
    authActions.innerHTML = `<button class="btn btn-primary" onclick="openLogin()">Login</button>`;
    return;
  }

  loginScreen.classList.add('hidden');
  appScreen.classList.remove('blurred');
  userBadge.textContent = `${STATE.user.display_name} · ${STATE.user.role}`;
  authActions.innerHTML = `<button class="btn btn-secondary" onclick="logout()">Logout</button>`;

  if (STATE.user.role === 'admin') {
    adminNav.classList.remove('hidden');
    cartNav.classList.add('hidden');
    ordersNav.classList.remove('hidden');
  } else {
    adminNav.classList.add('hidden');
    cartNav.classList.remove('hidden');
    ordersNav.classList.remove('hidden');
  }
}

function openLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const errorBox = document.getElementById('login-error');

  try {
    const { token, user } = await API.login(email, password);
    localStorage.setItem('electrostore_token', token);
    STATE.user = user;
    errorBox.textContent = '';
    updateAuthUI();
    if (user.role === 'customer') {
      await refreshCart();
      await loadAddresses();
      await loadOrders();
      showPage('shop');
    } else {
      await loadAdmin();
      await loadOrders();
      showPage('admin');
    }
  } catch (error) {
    errorBox.textContent = error.message;
  }
}

async function logout() {
  try {
    await API.logout();
  } catch (_) {}
  localStorage.removeItem('electrostore_token');
  STATE.user = null;
  STATE.cart = null;
  updateAuthUI();
  showPage('shop');
}

function showPage(page) {
  STATE.currentPage = page;
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  const nav = document.querySelector(`.nav-link[data-page="${page}"]`);
  if (nav) nav.classList.add('active');
}

async function loadCatalog() {
  const search = document.getElementById('search-input').value.trim();
  const category = document.getElementById('category-filter').value;
  try {
    STATE.categories = await API.getCategories();
    renderCategoryFilter();
    STATE.products = await API.getProducts({ search, category });
    renderFeaturedProducts();
    renderProductGrid();
  } catch (error) {
    document.getElementById('product-grid').innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

function renderCategoryFilter() {
  const current = document.getElementById('category-filter').value;
  const select = document.getElementById('category-filter');
  select.innerHTML = `<option value="">All categories</option>` +
    STATE.categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  select.value = current;
}

function renderFeaturedProducts() {
  const featured = STATE.products.filter(p => p.is_featured).slice(0, 4);
  const container = document.getElementById('featured-grid');
  if (!featured.length) {
    container.innerHTML = `<div class="empty-state">No featured products found.</div>`;
    return;
  }
  container.innerHTML = featured.map(renderProductCard).join('');
}

function renderProductGrid() {
  const container = document.getElementById('product-grid');
  if (!STATE.products.length) {
    container.innerHTML = `<div class="empty-state">No products match the current filters.</div>`;
    return;
  }
  container.innerHTML = STATE.products.map(renderProductCard).join('');
}

function renderProductCard(product) {
  return `
    <article class="product-card">
      <div class="product-image-wrap">
        <img class="product-image" src="${product.image_url || 'https://placehold.co/600x400?text=ElectroStore'}" alt="${escapeHtml(product.name)}">
      </div>
      <div class="product-body">
        <div class="product-meta">${escapeHtml(product.category || 'Misc')} · ${escapeHtml(product.brand || '')}</div>
        <h3>${escapeHtml(product.name)}</h3>
        <p class="muted">${escapeHtml(product.description || product.model || '')}</p>
        <div class="product-footer">
          <div>
            <div class="price">${formatMoney(product.price)}</div>
            <div class="stock ${product.stock_qty <= 10 ? 'low' : ''}">Stock: ${product.stock_qty}</div>
          </div>
          ${STATE.user && STATE.user.role === 'customer'
            ? `<button class="btn btn-primary" onclick="addProductToCart('${product.barcode}')">Add to cart</button>`
            : `<button class="btn btn-secondary" onclick="openLogin()">Login to buy</button>`}
        </div>
      </div>
    </article>
  `;
}

async function addProductToCart(barcode) {
  try {
    await API.addToCart(barcode, 1);
    await refreshCart();
    showToast('Product added to cart');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function refreshCart() {
  if (!STATE.user || STATE.user.role !== 'customer') return;
  try {
    STATE.cart = await API.getCart();
    renderCart();
  } catch (error) {
    document.getElementById('cart-items').innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

function renderCart() {
  const wrap = document.getElementById('cart-items');
  const totalBox = document.getElementById('cart-total');
  if (!STATE.cart || !STATE.cart.items.length) {
    wrap.innerHTML = `<div class="empty-state">Your cart is empty.</div>`;
    totalBox.textContent = '€0.00';
    return;
  }
  wrap.innerHTML = STATE.cart.items.map(item => `
    <div class="cart-item">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <div class="muted">${escapeHtml(item.brand || '')}</div>
        <div>${formatMoney(item.price)}</div>
      </div>
      <div class="cart-actions">
        <input class="qty-input" type="number" min="1" value="${item.quantity}" onchange="changeQty(${item.id}, this.value)">
        <button class="btn btn-ghost" onclick="removeCartItem(${item.id})">Remove</button>
      </div>
    </div>
  `).join('');
  totalBox.textContent = formatMoney(STATE.cart.subtotal);
}

async function changeQty(id, quantity) {
  try {
    await API.updateCartItem(id, quantity);
    await refreshCart();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function removeCartItem(id) {
  try {
    await API.removeCartItem(id);
    await refreshCart();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function loadAddresses() {
  if (!STATE.user || STATE.user.role !== 'customer') return;
  const addresses = await API.getAddresses();
  const shipping = document.getElementById('shipping-address');
  const billing = document.getElementById('billing-address');
  const options = addresses.map(a => `<option value="${a.id}">${escapeHtml(a.address)} (${escapeHtml(a.address_type || 'Address')})</option>`).join('');
  shipping.innerHTML = options;
  billing.innerHTML = options;
}

async function handleCheckout(event) {
  event.preventDefault();
  try {
    const payload = {
      shipping_address_id: Number(document.getElementById('shipping-address').value),
      billing_address_id: Number(document.getElementById('billing-address').value),
      payment_method: document.getElementById('payment-method').value,
      notes: document.getElementById('checkout-notes').value.trim()
    };
    const result = await API.checkout(payload);
    showToast(`Order #${result.order_id} placed successfully`);
    await refreshCart();
    await loadOrders();
    showPage('orders');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function loadOrders() {
  if (!STATE.user) return;
  if (STATE.user.role === 'admin') {
    const orders = await API.getAdminOrders();
    renderAdminOrders(orders);
  } else {
    const orders = await API.getMyOrders();
    const wrap = document.getElementById('orders-list');
    if (!orders.length) {
      wrap.innerHTML = `<div class="empty-state">No orders yet.</div>`;
      return;
    }
    wrap.innerHTML = orders.map(order => `
      <div class="order-card">
        <div class="order-head">
          <strong>Order #${order.id}</strong>
          <span class="pill">${escapeHtml(order.order_status || 'Unknown')}</span>
        </div>
        <div class="muted">${new Date(order.order_date).toLocaleString()}</div>
        <div>${order.item_count} item(s)</div>
        <div class="price">${formatMoney(order.total_amount)}</div>
      </div>
    `).join('');
  }
}

async function loadAdmin() {
  if (!STATE.user || STATE.user.role !== 'admin') return;
  const [summary, products, orders] = await Promise.all([
    API.getAdminSummary(),
    API.getAdminProducts(),
    API.getAdminOrders()
  ]);
  document.getElementById('summary-cards').innerHTML = `
    <div class="summary-card"><div class="muted">Products</div><strong>${summary.products}</strong></div>
    <div class="summary-card"><div class="muted">Low stock</div><strong>${summary.low_stock_products}</strong></div>
    <div class="summary-card"><div class="muted">Orders</div><strong>${summary.orders}</strong></div>
    <div class="summary-card"><div class="muted">Revenue</div><strong>${formatMoney(summary.revenue)}</strong></div>
  `;
  renderAdminProducts(products);
  renderAdminOrders(orders);
}

function renderAdminProducts(products) {
  const wrap = document.getElementById('admin-products-table');
  if (!products.length) {
    wrap.innerHTML = '<div class="empty-state">No products yet.</div>';
    return;
  }
  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>Barcode</th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th></th></tr>
      </thead>
      <tbody>
        ${products.map(p => `
          <tr>
            <td>${escapeHtml(p.barcode)}</td>
            <td>${escapeHtml(p.name)}</td>
            <td>${escapeHtml(p.category || '')}</td>
            <td>${formatMoney(p.price)}</td>
            <td>${p.stock_qty}</td>
            <td class="table-actions">
              <button class="btn btn-ghost" onclick='editProduct(${JSON.stringify(p).replace(/'/g, "&apos;")})'>Edit</button>
              <button class="btn btn-danger" onclick="deleteProduct('${p.barcode}')">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderAdminOrders(orders) {
  const wrap = document.getElementById('admin-orders-table');
  if (!orders.length) {
    wrap.innerHTML = '<div class="empty-state">No orders available.</div>';
    return;
  }
  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>ID</th><th>Customer</th><th>Date</th><th>Status</th><th>Total</th><th></th></tr>
      </thead>
      <tbody>
        ${orders.map(order => `
          <tr>
            <td>${order.id}</td>
            <td>${escapeHtml((order.first_name || '') + ' ' + (order.last_name || ''))}</td>
            <td>${new Date(order.order_date).toLocaleString()}</td>
            <td>${escapeHtml(order.order_status || '')}</td>
            <td>${formatMoney(order.total_amount)}</td>
            <td>
              <select onchange="updateOrderStatus(${order.id}, this.value)">
                ${['Pending', 'Processing', 'Shipped', 'Completed', 'Cancelled'].map(s => `<option value="${s}" ${s === order.order_status ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function editProduct(product) {
  STATE.editingBarcode = product.barcode;
  document.getElementById('product-form-title').textContent = `Edit product ${product.name}`;
  document.getElementById('pf-barcode').value = product.barcode;
  document.getElementById('pf-barcode').disabled = true;
  document.getElementById('pf-name').value = product.name || '';
  document.getElementById('pf-brand').value = product.brand || '';
  document.getElementById('pf-category').value = product.category || '';
  document.getElementById('pf-model').value = product.model || '';
  document.getElementById('pf-price').value = product.price || '';
  document.getElementById('pf-stock').value = product.stock_qty || 0;
  document.getElementById('pf-year').value = product.release_year || '';
  document.getElementById('pf-month').value = product.release_month || '';
  document.getElementById('pf-image').value = product.image_url || '';
  document.getElementById('pf-description').value = product.description || '';
  document.getElementById('pf-featured').checked = !!product.is_featured;
  showPage('admin');
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function resetProductForm() {
  STATE.editingBarcode = null;
  document.getElementById('product-form-title').textContent = 'Add new product';
  document.getElementById('product-form').reset();
  document.getElementById('pf-barcode').disabled = false;
}

async function handleSaveProduct(event) {
  event.preventDefault();
  const payload = {
    barcode: document.getElementById('pf-barcode').value.trim(),
    name: document.getElementById('pf-name').value.trim(),
    brand: document.getElementById('pf-brand').value.trim(),
    category: document.getElementById('pf-category').value.trim(),
    model: document.getElementById('pf-model').value.trim(),
    price: Number(document.getElementById('pf-price').value),
    stock_qty: Number(document.getElementById('pf-stock').value),
    release_year: document.getElementById('pf-year').value ? Number(document.getElementById('pf-year').value) : null,
    release_month: document.getElementById('pf-month').value ? Number(document.getElementById('pf-month').value) : null,
    image_url: document.getElementById('pf-image').value.trim(),
    description: document.getElementById('pf-description').value.trim(),
    is_featured: document.getElementById('pf-featured').checked
  };

  try {
    if (STATE.editingBarcode) {
      await API.updateProduct(STATE.editingBarcode, payload);
      showToast('Product updated');
    } else {
      await API.createProduct(payload);
      showToast('Product created');
    }
    resetProductForm();
    await loadAdmin();
    await loadCatalog();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function deleteProduct(barcode) {
  if (!confirm('Delete this product?')) return;
  try {
    await API.deleteProduct(barcode);
    showToast('Product deleted');
    await loadAdmin();
    await loadCatalog();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function updateOrderStatus(id, status) {
  try {
    await API.updateOrderStatus(id, status);
    showToast('Order updated');
  } catch (error) {
    showToast(error.message, true);
  }
}

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatMoney(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('en-EU', { style: 'currency', currency: 'EUR' }).format(number);
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${isError ? 'error' : ''}`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2600);
}
