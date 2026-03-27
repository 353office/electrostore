window.API = {
  baseUrl: window.APP_CONFIG.API_BASE_URL,

  get token() {
    return localStorage.getItem('electrostore_token');
  },

  async request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const response = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = data.error || `Request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = data;
      throw error;
    }
    return data;
  },

  login(email, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  },

  getSession() {
    return this.request('/auth/session');
  },

  logout() {
    return this.request('/auth/logout', { method: 'POST' });
  },

  getProducts(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/products${query ? '?' + query : ''}`);
  },

  getProduct(barcode) {
    return this.request(`/products/${barcode}`);
  },

  getCategories() {
    return this.request('/categories');
  },

  getCart() {
    return this.request('/cart');
  },

  addToCart(barcode, quantity = 1) {
    return this.request('/cart/items', {
      method: 'POST',
      body: JSON.stringify({ barcode, quantity })
    });
  },

  updateCartItem(id, quantity) {
    return this.request(`/cart/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity })
    });
  },

  removeCartItem(id) {
    return this.request(`/cart/items/${id}`, { method: 'DELETE' });
  },

  getAddresses() {
    return this.request('/me/addresses');
  },

  async saveAddresses(payload) {
    if (!this.token) {
      throw new Error('Трябва да влезеш в профила си, за да запазиш адресите.');
    }

    try {
      return await this.request('/me/addresses', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } catch (error) {
      if (error.status === 404) {
        throw new Error('Адресният маршрут липсва на сървъра. Качи и деплойни backend/server.js от тази версия.');
      }
      throw error;
    }
  },

  checkout(payload) {
    return this.request('/orders/checkout', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  getMyOrders() {
    return this.request('/orders/me');
  },

  getAdminSummary() {
    return this.request('/admin/summary');
  },

  getAdminProducts() {
    return this.request('/admin/products');
  },

  createProduct(product) {
    return this.request('/admin/products', {
      method: 'POST',
      body: JSON.stringify(product)
    });
  },

  updateProduct(barcode, product) {
    return this.request(`/admin/products/${barcode}`, {
      method: 'PUT',
      body: JSON.stringify(product)
    });
  },

  deleteProduct(barcode) {
    return this.request(`/admin/products/${barcode}`, { method: 'DELETE' });
  },

  getAdminOrders() {
    return this.request('/admin/orders');
  },

  updateOrderStatus(id, order_status) {
    return this.request(`/admin/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ order_status })
    });
  }
};
