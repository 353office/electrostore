window.APP_CONFIG = {
  API_BASE_URL: window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : 'https://electrostore-bzob.onrender.com'
};
