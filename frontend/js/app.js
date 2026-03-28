function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

window.STATE = {
  user: null,
  products: [],
  categories: [],
  cart: null,
  currentPage: 'shop',
  editingBarcode: null,
  selectedProduct: null,
  selectedAdminOrder: null
};

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  tryRestoreSession();
  await loadCatalog();
  refreshIcons();
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
    await refreshApplicationShell();
    return;
  }
  try {
    const { user } = await API.getSession();
    STATE.user = user;
  } catch (error) {
    localStorage.removeItem('electrostore_token');
    STATE.user = null;
  }
  await refreshApplicationShell();
}

async function refreshApplicationShell(options = {}) {
  const { keepCurrentPage = false } = options;
  updateAuthUI();
  clearRoleSpecificPanels();
  renderFeaturedProducts();
  renderProductGrid();

  if (!STATE.user) {
    STATE.cart = null;
    renderCart();
    renderOrders([]);
    if (!keepCurrentPage) showPage('shop');
    refreshIcons();
    return;
  }

  if (STATE.user.role === 'customer') {
    await Promise.all([refreshCart(), loadAddresses(), loadOrders()]);
    if (!keepCurrentPage || STATE.currentPage === 'admin') showPage('shop');
  } else {
    await Promise.all([loadAdmin(), loadOrders()]);
    if (!keepCurrentPage && STATE.currentPage === 'cart') showPage('shop');
  }
  refreshIcons();
}

function clearRoleSpecificPanels() {
  document.getElementById('summary-cards').innerHTML = '';
  document.getElementById('admin-products-table').innerHTML = '';
  document.getElementById('admin-orders-table').innerHTML = '';
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
    userBadge.textContent = 'Гост';
    adminNav.classList.add('hidden');
    cartNav.classList.add('hidden');
    ordersNav.classList.add('hidden');
    authActions.innerHTML = `<button class="btn btn-primary" onclick="openLogin()"><i data-lucide="log-in"></i>Вход</button>`;
    refreshIcons();
    return;
  }

  loginScreen.classList.add('hidden');
  appScreen.classList.remove('blurred');
  userBadge.textContent = `${STATE.user.display_name} · ${STATE.user.role === 'admin' ? 'админ' : 'клиент'}`;
  authActions.innerHTML = `<button class="btn btn-secondary" onclick="logout()"><i data-lucide="log-out"></i>Изход</button>`;

  if (STATE.user.role === 'admin') {
    adminNav.classList.remove('hidden');
    cartNav.classList.add('hidden');
    ordersNav.classList.remove('hidden');
  } else {
    adminNav.classList.add('hidden');
    cartNav.classList.remove('hidden');
    ordersNav.classList.remove('hidden');
  }
  refreshIcons();
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
    document.getElementById('login-form').reset();
    await refreshApplicationShell();
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
  STATE.selectedProduct = null;
  await refreshApplicationShell();
}

function showPage(page) {
  STATE.currentPage = page;
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');
  const nav = document.querySelector(`.nav-link[data-page="${page}"]`);
  if (nav) nav.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  refreshIcons();
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
    if (STATE.selectedProduct) {
      const match = STATE.products.find(product => product.barcode === STATE.selectedProduct.barcode);
      if (match) {
        STATE.selectedProduct = match;
        renderProductDetails(match);
      }
    }
    refreshIcons();
  } catch (error) {
    document.getElementById('product-grid').innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

function renderCategoryFilter() {
  const current = document.getElementById('category-filter').value;
  const select = document.getElementById('category-filter');
  select.innerHTML = `<option value="">Всички категории</option>` +
    STATE.categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  select.value = current;
}

function renderFeaturedProducts() {
  const featured = STATE.products.filter(p => p.is_featured).slice(0, 4);
  const container = document.getElementById('featured-grid');
  if (!featured.length) {
    container.innerHTML = `<div class="empty-state">Няма препоръчани продукти.</div>`;
    return;
  }
  container.innerHTML = featured.map(renderProductCard).join('');
  refreshIcons();
}

function renderProductGrid() {
  const container = document.getElementById('product-grid');
  if (!STATE.products.length) {
    container.innerHTML = `<div class="empty-state">Няма продукти по зададените критерии.</div>`;
    return;
  }
  container.innerHTML = STATE.products.map(renderProductCard).join('');
  refreshIcons();
}

function renderProductCard(product) {
  const image = product.image_url || 'https://placehold.co/600x400?text=ElectroStore';
  const isOutOfStock = Number(product.stock_qty || 0) <= 0;
  const primaryAction = isOutOfStock
    ? `<button class="btn btn-disabled" type="button" disabled onclick="event.stopPropagation(); return false;"><i data-lucide="ban"></i>Изчерпан</button>`
    : STATE.user && STATE.user.role === 'customer'
      ? `<button class="btn btn-primary" onclick="event.stopPropagation(); addProductToCart('${product.barcode}')"><i data-lucide="shopping-cart"></i>Добави</button>`
      : `<button class="btn btn-secondary" onclick="event.stopPropagation(); openLogin()"><i data-lucide="log-in"></i>Вход</button>`;

  return `
    <article class="product-card product-card-clickable" onclick="openProductPage('${product.barcode}')">
      <div class="product-image-wrap">
        <img class="product-image" src="${image}" alt="${escapeHtml(product.name)}">
      </div>
      <div class="product-body">
        <div class="product-meta">${escapeHtml(product.category || 'Разни')} · ${escapeHtml(product.brand || '')}</div>
        <h3>${escapeHtml(product.name)}</h3>
        <div class="product-card-bottom">
          <div class="product-pricing">
            <div class="price">${formatMoney(product.price)}</div>
            <div class="stock ${Number(product.stock_qty || 0) <= 0 ? 'zero' : product.stock_qty <= 10 ? 'low' : ''}">${Number(product.stock_qty || 0) <= 0 ? 'Няма наличност' : `Наличност: ${product.stock_qty}`}</div>
          </div>
          <div class="product-card-actions">
            <button class="btn btn-ghost" onclick="event.stopPropagation(); openProductPage('${product.barcode}')"><i data-lucide="arrow-right"></i>Детайли</button>
            ${primaryAction}
          </div>
        </div>
      </div>
    </article>
  `;
}

async function openProductPage(barcode) {
  try {
    const product = await API.getProduct(barcode);
    STATE.selectedProduct = product;
    renderProductDetails(product);
    showPage('product');
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderProductDetails(product) {
  const container = document.getElementById('product-detail-content');
  const image = product.image_url || 'https://placehold.co/900x600?text=ElectroStore';
  const specs = [
    ['Марка', product.brand || '—'],
    ['Категория', product.category || '—'],
    ['Модел', product.model || '—'],
    ['Година', product.release_year || '—'],
    ['Месец', product.release_month || '—'],
    ['Баркод', product.barcode || '—']
  ];
  const isOutOfStock = Number(product.stock_qty || 0) <= 0;
  const action = isOutOfStock
    ? `<button class="btn btn-disabled detail-buy-btn" type="button" disabled><i data-lucide="ban"></i>Изчерпан</button>`
    : STATE.user && STATE.user.role === 'customer'
      ? `<button class="btn btn-primary detail-buy-btn" onclick="addProductToCart('${product.barcode}')"><i data-lucide="shopping-cart"></i>Добави в количката</button>`
      : `<button class="btn btn-secondary detail-buy-btn" onclick="openLogin()"><i data-lucide="log-in"></i>Вход за покупка</button>`;

  container.innerHTML = `
    <div class="product-detail-layout">
      <div class="product-detail-media panel">
        <img class="product-detail-image" src="${image}" alt="${escapeHtml(product.name)}">
      </div>
      <div class="product-detail-main panel">
        <div class="product-detail-top">
          <div class="product-meta">${escapeHtml(product.category || 'Разни')} · ${escapeHtml(product.brand || '')}</div>
          <h1>${escapeHtml(product.name)}</h1>
          <div class="detail-price-row">
            <div>
              <div class="price detail-price">${formatMoney(product.price)}</div>
              <div class="stock ${Number(product.stock_qty || 0) <= 0 ? 'zero' : product.stock_qty <= 10 ? 'low' : ''}">${Number(product.stock_qty || 0) <= 0 ? 'Няма наличност' : `Наличност: ${product.stock_qty}`}</div>
            </div>
            ${action}
          </div>
        </div>
        <div class="product-detail-copy">
          <h3>Описание</h3>
          <p>${escapeHtml(product.description || `${product.name} от ${product.brand || 'избрана марка'} с надеждна производителност и удобен дизайн за всекидневна употреба.`)}</p>
        </div>
        <div class="product-detail-copy">
          <h3>Спецификации</h3>
          <div class="spec-grid">
            ${specs.map(([label, value]) => `
              <div class="spec-item">
                <div class="spec-label">${escapeHtml(label)}</div>
                <div class="spec-value">${escapeHtml(value)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
  refreshIcons();
}

async function addProductToCart(barcode) {
  const product = STATE.products.find(item => item.barcode === barcode) || (STATE.selectedProduct && STATE.selectedProduct.barcode === barcode ? STATE.selectedProduct : null);
  if (product && Number(product.stock_qty || 0) <= 0) {
    showToast('Продуктът е изчерпан.', true);
    return;
  }
  try {
    await API.addToCart(barcode, 1);
    await refreshCart();
    renderFeaturedProducts();
    renderProductGrid();
    showToast('Продуктът е добавен в количката');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function refreshCart() {
  if (!STATE.user || STATE.user.role !== 'customer') {
    renderCart();
    return;
  }
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
  if (!STATE.user || STATE.user.role !== 'customer') {
    wrap.innerHTML = `<div class="empty-state">Количката е достъпна след вход като клиент.</div>`;
    totalBox.textContent = '0,00 €';
    return;
  }
  if (!STATE.cart || !STATE.cart.items.length) {
    wrap.innerHTML = `<div class="empty-state">Количката е празна.</div>`;
    totalBox.textContent = '0,00 €';
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
        <button class="btn btn-ghost" onclick="removeCartItem(${item.id})">Премахни</button>
      </div>
    </div>
  `).join('');
  totalBox.textContent = formatMoney(STATE.cart.subtotal);
  refreshIcons();
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
  const preferredShipping = addresses.find(a => String((a.address_type || '').toLowerCase()).includes('shipping')) || addresses.find(a => a.is_default) || addresses[0];
  const preferredBilling = addresses.find(a => String((a.address_type || '').toLowerCase()).includes('billing')) || addresses.find(a => a.is_default) || addresses[0];
  shipping.value = preferredShipping?.address || '';
  billing.value = preferredBilling?.address || preferredShipping?.address || '';
}

async function persistAddresses() {
  const shipping = document.getElementById('shipping-address').value.trim();
  const billing = document.getElementById('billing-address').value.trim();
  if (!shipping || !billing) {
    throw new Error('Моля въведи адрес за доставка и адрес за фактура.');
  }
  return API.saveAddresses({
    shipping_address: shipping,
    billing_address: billing
  });
}

async function handleCheckout(event) {
  event.preventDefault();
  try {
    const session = await API.getSession();
    STATE.user = session.user;
    if (!STATE.user || STATE.user.role !== 'customer') {
      throw new Error('Трябва да си влязъл като клиент, за да направиш поръчка.');
    }

    const saved = await persistAddresses();
    const payload = {
      shipping_address_id: saved.shipping_address_id,
      billing_address_id: saved.billing_address_id,
      payment_method: document.getElementById('payment-method').value,
      notes: document.getElementById('checkout-notes').value.trim()
    };
    const result = await API.checkout(payload);
    showToast(`Поръчка №${result.order_id} е приета успешно`);
    await refreshApplicationShell({ keepCurrentPage: true });
    showPage('orders');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function loadOrders() {
  if (!STATE.user) {
    renderOrders([]);
    return;
  }
  if (STATE.user.role === 'admin') {
    const orders = await API.getAdminOrders();
    renderAdminOrders(orders);
  } else {
    const orders = await API.getMyOrders();
    renderOrders(orders);
  }
  refreshIcons();
}

function renderOrders(orders) {
  const wrap = document.getElementById('orders-list');
  if (!orders.length) {
    wrap.innerHTML = `<div class="empty-state">Все още няма поръчки.</div>`;
    return;
  }
  wrap.innerHTML = orders.map(order => `
    <div class="order-card">
      <div class="order-head">
        <strong>Поръчка №${order.id}</strong>
        <span class="pill">${escapeHtml(order.order_status || 'Неизвестен')}</span>
      </div>
      <div class="muted">${formatDateTime(order.order_date)}</div>
      <div>${order.item_count} артикул(а)</div>
      <div class="price">${formatMoney(order.total_amount)}</div>
    </div>
  `).join('');
}

async function loadAdmin() {
  if (!STATE.user || STATE.user.role !== 'admin') return;
  const [summary, products, orders] = await Promise.all([
    API.getAdminSummary(),
    API.getAdminProducts(),
    API.getAdminOrders()
  ]);
  document.getElementById('summary-cards').innerHTML = `
    <div class="summary-card"><div class="muted">Продукти</div><strong>${summary.products}</strong></div>
    <div class="summary-card"><div class="muted">Ниска наличност</div><strong>${summary.low_stock_products}</strong></div>
    <div class="summary-card"><div class="muted">Поръчки</div><strong>${summary.orders}</strong></div>
    <div class="summary-card"><div class="muted">Оборот</div><strong>${formatMoney(summary.revenue)}</strong></div>
  `;
  renderAdminProducts(products);
  renderAdminOrders(orders);
  refreshIcons();
}

function renderAdminProducts(products) {
  const wrap = document.getElementById('admin-products-table');
  if (!products.length) {
    wrap.innerHTML = '<div class="empty-state">Все още няма продукти.</div>';
    return;
  }
  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>Баркод</th><th>Име</th><th>Категория</th><th>Цена</th><th>Наличност</th><th></th></tr>
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
              <button class="btn btn-ghost" onclick='editProduct(${JSON.stringify(p).replace(/'/g, "&apos;")})'>Редакция</button>
              <button class="btn btn-danger" onclick="deleteProduct('${p.barcode}')">Изтрий</button>
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
    wrap.innerHTML = '<div class="empty-state">Няма налични поръчки.</div>';
    return;
  }
  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>ID</th><th>Клиент</th><th>Дата</th><th>Статус</th><th>Общо</th><th>Артикули</th><th></th></tr>
      </thead>
      <tbody>
        ${orders.map(order => `
          <tr>
            <td>${order.id}</td>
            <td>${escapeHtml((order.first_name || '') + ' ' + (order.last_name || ''))}</td>
            <td>${formatDateTimeBg(order.order_date)}</td>
            <td><span class="pill status-pill">${escapeHtml(order.order_status || '')}</span></td>
            <td>${formatMoney(order.total_amount)}</td>
            <td>${order.item_count || 0}</td>
            <td class="table-actions order-actions-cell">
              <select onchange="updateOrderStatus(${order.id}, this.value)">
                ${['Чакаща', 'Обработва се', 'Изпратена', 'Завършена', 'Отказана'].map(s => `<option value="${s}" ${s === order.order_status ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
              <button class="btn btn-ghost" onclick="openAdminOrderDetails(${order.id})">Детайли</button>
              <button class="btn btn-danger" onclick="deleteOrderAsAdmin(${order.id})">Изтрий</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function openAdminOrderDetails(id) {
  try {
    const order = await API.getAdminOrder(id);
    STATE.selectedAdminOrder = order;
    renderAdminOrderModal(order);
  } catch (error) {
    showToast(error.message, true);
  }
}

function closeAdminOrderModal() {
  STATE.selectedAdminOrder = null;
  document.getElementById('order-modal').classList.add('hidden');
  document.getElementById('order-modal-content').innerHTML = '';
}

function renderAdminOrderModal(order) {
  const modal = document.getElementById('order-modal');
  const content = document.getElementById('order-modal-content');
  const customerName = [order.first_name, order.middle_name, order.last_name].filter(Boolean).join(' ');
  content.innerHTML = `
    <div class="order-detail-grid">
      <div class="panel">
        <div class="section-title compact"><h2>Поръчка №${order.id}</h2><span class="pill status-pill">${escapeHtml(order.order_status || '')}</span></div>
        <div class="detail-list">
          <div><strong>Клиент:</strong> ${escapeHtml(customerName || '—')}</div>
          <div><strong>Дата:</strong> ${formatDateTimeBg(order.order_date)}</div>
          <div><strong>Плащане:</strong> ${escapeHtml(order.payment_method || '—')}</div>
          <div><strong>Tracking:</strong> ${escapeHtml(order.tracking_number || '—')}</div>
          <div><strong>Бележки:</strong> ${escapeHtml(order.notes || '—')}</div>
          <div><strong>Доставка:</strong> ${escapeHtml(order.shipping_address || '—')}</div>
          <div><strong>Фактура:</strong> ${escapeHtml(order.billing_address || '—')}</div>
        </div>
      </div>
      <div class="panel">
        <div class="section-title compact"><h2>Суми</h2></div>
        <div class="detail-list">
          <div><strong>Междинна сума:</strong> ${formatMoney(order.order_subtotal)}</div>
          <div><strong>ДДС:</strong> ${formatMoney(order.tax_amount)}</div>
          <div><strong>Доставка:</strong> ${formatMoney(order.shipping_cost)}</div>
          <div><strong>Общо:</strong> ${formatMoney(order.total_amount)}</div>
        </div>
      </div>
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="section-title compact"><h2>Артикули</h2></div>
      <table class="data-table">
        <thead><tr><th>Продукт</th><th>Баркод</th><th>Количество</th><th>Ед. цена</th><th>Сума</th></tr></thead>
        <tbody>
          ${(order.items || []).map(item => `
            <tr>
              <td>${escapeHtml(item.name || '')}</td>
              <td>${escapeHtml(item.barcode || '')}</td>
              <td>${item.qty}</td>
              <td>${formatMoney(item.unit_price)}</td>
              <td>${formatMoney(item.subtotal)}</td>
            </tr>
          `).join('') || '<tr><td colspan="5">Няма артикули.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
  modal.classList.remove('hidden');
}

async function deleteOrderAsAdmin(id) {
  if (!confirm(`Да бъде ли изтрита поръчка №${id}? Наличностите ще бъдат върнати обратно.`)) return;
  try {
    await API.deleteAdminOrder(id);
    showToast('Поръчката е изтрита');
    if (STATE.selectedAdminOrder && Number(STATE.selectedAdminOrder.id) === Number(id)) {
      closeAdminOrderModal();
    }
    await loadOrders();
    await loadAdmin();
    await loadCatalog();
  } catch (error) {
    showToast(error.message, true);
  }
}

function editProduct(product) {
  STATE.editingBarcode = product.barcode;
  document.getElementById('product-form-title').textContent = `Редакция на продукт: ${product.name}`;
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
  document.getElementById('product-form-title').textContent = 'Добавяне на нов продукт';
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

  if (!/^[0-9]{8,14}$/.test(payload.barcode)) {
    showToast('Баркодът трябва да съдържа само цифри и да е 8–14 знака.', true);
    return;
  }

  try {
    if (STATE.editingBarcode) {
      await API.updateProduct(STATE.editingBarcode, payload);
      showToast('Продуктът е обновен');
    } else {
      await API.createProduct(payload);
      showToast('Продуктът е създаден');
    }
    resetProductForm();
    await loadAdmin();
    await loadCatalog();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function deleteProduct(barcode) {
  if (!confirm('Да бъде ли изтрит този продукт?')) return;
  try {
    await API.deleteProduct(barcode);
    showToast('Продуктът е изтрит');
    await loadAdmin();
    await loadCatalog();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function updateOrderStatus(id, status) {
  try {
    await API.updateOrderStatus(id, status);
    showToast('Статусът на поръчката е обновен');
    await loadOrders();
    if (STATE.user && STATE.user.role === 'admin') {
      await loadAdmin();
    }
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


function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('bg-BG', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function formatDateTimeBg(value) {
  return formatDateTime(value);
}

function formatMoney(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('bg-BG', { style: 'currency', currency: 'EUR' }).format(number);
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${isError ? 'error' : ''}`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2600);
}
