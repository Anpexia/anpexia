import { useState, useCallback, useEffect } from 'react';
import api from '../services/api';
import { getDeviceId } from '../utils/device';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  twoFactorEnabled?: boolean;
  tenant: { id: string; name: string; slug: string; plan: string; segment?: string } | null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(() => {
    const stored = sessionStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isAuthenticated = !!sessionStorage.getItem('accessToken');

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError('');
    try {
      const deviceId = getDeviceId();
      const { data } = await api.post('/auth/login', { email, password, deviceId });
      sessionStorage.setItem('accessToken', data.data.accessToken);
      sessionStorage.setItem('user', JSON.stringify(data.data.user));
      setUser(data.data.user);
      return { needs2FA: false, user: data.data.user };
    } catch (err: any) {
      const code = err.response?.data?.error?.code;
      const details = err.response?.data?.error?.details;
      if (code === 'DEVICE_NOT_TRUSTED') {
        // Not a login error — just needs 2FA
        sessionStorage.setItem('pending2FA', JSON.stringify({
          userId: details?.userId,
          email: details?.email,
          twoFactorEnabled: !!details?.twoFactorEnabled,
        }));
        return { needs2FA: true, user: null };
      }
      const msg = err.response?.data?.error?.message || 'Erro ao fazer login';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('pending2FA');
    setUser(null);
  }, []);

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      sessionStorage.setItem('user', JSON.stringify(data.data));
      setUser(data.data);
    } catch {
      // token expired, will redirect via interceptor
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && !user) {
      fetchMe();
    }
  }, [isAuthenticated, user, fetchMe]);

  return { user, loading, error, isAuthenticated, login, logout };
}
