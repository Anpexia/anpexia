import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../services/api';

const IDLE_MS = 2 * 60 * 60 * 1000;       // 2h total
const WARN_MS = 1 * 60 * 60 * 1000 + 55 * 60 * 1000; // 1h55m

export function useInactivityLogout() {
  const [showWarning, setShowWarning] = useState(false);
  const lastActivity = useRef<number>(Date.now());
  const warnTimer = useRef<number | null>(null);
  const logoutTimer = useRef<number | null>(null);

  const doLogout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    sessionStorage.clear();
    window.location.href = '/login';
  }, []);

  const resetTimers = useCallback(() => {
    lastActivity.current = Date.now();
    setShowWarning(false);
    if (warnTimer.current) window.clearTimeout(warnTimer.current);
    if (logoutTimer.current) window.clearTimeout(logoutTimer.current);
    warnTimer.current = window.setTimeout(() => setShowWarning(true), WARN_MS);
    logoutTimer.current = window.setTimeout(() => { void doLogout(); }, IDLE_MS);
  }, [doLogout]);

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    const handler = () => resetTimers();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    resetTimers();
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (warnTimer.current) window.clearTimeout(warnTimer.current);
      if (logoutTimer.current) window.clearTimeout(logoutTimer.current);
    };
  }, [resetTimers]);

  return { showWarning, dismissWarning: resetTimers };
}
