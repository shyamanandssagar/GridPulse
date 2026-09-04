import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: `${baseURL}/api`,
  withCredentials: true,
});

// Set or clear the Authorization header for all subsequent requests.
// Called by AuthContext on login/logout/initial-hydrate.
export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

api.interceptors.response.use(
  (r) => r,
  (err) => {
    // Auto-logout on 401 so stale tokens don't loop forever
    if (err.response?.status === 401) {
      localStorage.removeItem('gridpulse_token');
      setAuthToken(null);
      // Reload only if we're not already on the login page
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    const msg = err.response?.data?.message || err.message || 'Network error';
    return Promise.reject(new Error(msg));
  }
);

export default api;

// Endpoint helpers — keeps pages clean.
export const auth = {
  login: (email, password) => api.post('/auth/login', { email, password }).then((r) => r.data),
  google: (idToken) => api.post('/auth/google', { idToken }).then((r) => r.data),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }).then((r) => r.data),
  verifyOtp: (email, otp) => api.post('/auth/verify-otp', { email, otp }).then((r) => r.data),
  resetPassword: (email, otp, password) =>
    api.post('/auth/reset-password', { email, otp, password }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};

export const meters = {
  list: (params) => api.get('/meters', { params }).then((r) => r.data),
  get: (id) => api.get(`/meters/${id}`).then((r) => r.data),
  create: (body) => api.post('/meters', body).then((r) => r.data),
  update: (id, body) => api.patch(`/meters/${id}`, body).then((r) => r.data),
  remove: (id) => api.delete(`/meters/${id}`).then((r) => r.data),
};

export const users = {
  list: () => api.get('/users').then((r) => r.data),
  create: (body) => api.post('/users', body).then((r) => r.data),
  update: (id, body) => api.patch(`/users/${id}`, body).then((r) => r.data),
  resetPassword: (id, password) =>
    api.patch(`/users/${id}/password`, { password }).then((r) => r.data),
  remove: (id) => api.delete(`/users/${id}`).then((r) => r.data),
};

export const readings = {
  recent: (meterId, limit = 200) =>
    api.get(`/readings/${meterId}`, { params: { limit } }).then((r) => r.data),
  aggregate: (meterId, hours = 24, bucket = 'minute') =>
    api.get(`/readings/${meterId}/aggregate`, { params: { hours, bucket } }).then((r) => r.data),
};

export const feeders = {
  topology: () => api.get('/feeders/topology').then((r) => r.data),
  fault: (id) => api.post(`/feeders/${id}/fault`).then((r) => r.data),
  restore: (id) => api.post(`/feeders/${id}/restore`).then((r) => r.data),
};

export const anomalies = {
  list: (params) => api.get('/anomalies', { params }).then((r) => r.data),
  ack: (id) => api.patch(`/anomalies/${id}/ack`).then((r) => r.data),
  stats: () => api.get('/anomalies/stats').then((r) => r.data),
};

export const analytics = {
  summary: () => api.get('/analytics/summary').then((r) => r.data),
  reliability: (days = 30) =>
    api.get('/analytics/reliability', { params: { days } }).then((r) => r.data),
  outages: () => api.get('/analytics/outages').then((r) => r.data),
  bills: () => api.get('/analytics/bills').then((r) => r.data),
  loadCurve: (hours = 24) => api.get('/analytics/load-curve', { params: { hours } }).then((r) => r.data),
  lossAnalysis: (windowMinutes = 30) =>
    api.get('/analytics/loss-analysis', { params: { windowMinutes } }).then((r) => r.data),
  injectTheft: (count = 8) =>
    api.post('/analytics/loss-analysis/inject-demo', { count }).then((r) => r.data),
  clearTheft: () => api.post('/analytics/loss-analysis/clear').then((r) => r.data),
};

// Trigger a browser download of a meter's bill PDF.
export async function downloadBillPdf(meterId, suggestedName = 'bill.pdf') {
  const res = await api.get(`/meters/${meterId}/bill.pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
