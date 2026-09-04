import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { setAuthToken } from '../services/api.js';

const AuthContext = createContext(null);
const TOKEN_KEY = 'gridpulse_token';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  //  if token in storage, fetch /auth/me 
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    setAuthToken(token);
    api.get('/auth/me')
      .then((r) => setUser(r.data))
      .catch(() => {
        // Token invalid 
        localStorage.removeItem(TOKEN_KEY);
        setAuthToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    setAuthToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  // Continue with Google. The backend rejects emails that aren't already
  // provisioned by an admin, so this won't create new accounts.
  const googleLogin = useCallback(async (idToken) => {
    const { data } = await api.post('/auth/google', { idToken });
    localStorage.setItem(TOKEN_KEY, data.token);
    setAuthToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await api.get('/auth/me');
    setUser(data);
    return data;
  }, []);

  //  Password reset flow (OTP) 
  // These don't change auth state; pages call them directly.
  const forgotPassword = useCallback(async (email) => {
    const { data } = await api.post('/auth/forgot-password', { email });
    return data;
  }, []);

  const verifyOtp = useCallback(async (email, otp) => {
    const { data } = await api.post('/auth/verify-otp', { email, otp });
    return data;
  }, []);

  const resetPassword = useCallback(async (email, otp, password) => {
    const { data } = await api.post('/auth/reset-password', { email, otp, password });
    return data;
  }, []);

  const value = {
    user,
    loading,
    login,
    googleLogin,
    logout,
    refresh,
    forgotPassword,
    verifyOtp,
    resetPassword,
    isAdmin: user?.role === 'admin',
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
