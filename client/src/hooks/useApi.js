import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5000`,
  timeout: 30000, // 30 second timeout for AI requests
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log('[API] ========== REQUEST ==========');
    console.log('[API] Method:', config.method?.toUpperCase());
    console.log('[API] URL:', config.url);
    console.log('[API] Full URL:', config.baseURL + config.url);
    console.log('[API] Headers:', config.headers);
    if (config.data) {
      console.log('[API] Data:', typeof config.data === 'string' ? config.data : JSON.stringify(config.data, null, 2));
    }
    console.log('[API] ========== REQUEST END ==========');
    return config;
  },
  (error) => {
    console.error('[API] Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for logging
api.interceptors.response.use(
  (response) => {
    console.log('[API] ========== RESPONSE ==========');
    console.log('[API] Status:', response.status);
    console.log('[API] URL:', response.config.url);
    console.log('[API] Data preview:', JSON.stringify(response.data)?.substring(0, 300));
    console.log('[API] ========== RESPONSE END ==========');
    return response;
  },
  (error) => {
    console.error('[API] ========== RESPONSE ERROR ==========');
    console.error('[API] Error type:', error.constructor.name);
    console.error('[API] Status:', error.response?.status);
    console.error('[API] Status text:', error.response?.statusText);
    console.error('[API] URL:', error.config?.url);
    console.error('[API] Message:', error.message);
    if (error.response?.data) {
      console.error('[API] Error data:', error.response.data);
    }
    if (error.code) {
      console.error('[API] Error code:', error.code);
    }
    console.error('[API] ========== RESPONSE ERROR END ==========');
    return Promise.reject(error);
  }
);

export default api;
