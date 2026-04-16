import axios from 'axios';
import { getDeviceId } from '../utils/device';

const PROD_API_URL = 'https://api.anpexia.com.br/api/v1';

const baseURL =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname.includes('vercel.app') || window.location.hostname.includes('anpexia.com.br') ? PROD_API_URL : '/api/v1');

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('adminToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['X-Device-ID'] = getDeviceId();
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshURL = import.meta.env.VITE_API_URL
          ? `${import.meta.env.VITE_API_URL}/auth/refresh`
          : '/api/v1/auth/refresh';
        const { data } = await axios.post(refreshURL, {}, { withCredentials: true });
        const newToken = data.data.accessToken;
        sessionStorage.setItem('adminToken', newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch {
        sessionStorage.removeItem('adminToken');
        sessionStorage.removeItem('adminUser');
        window.location.href = '/';
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);

export default api;
