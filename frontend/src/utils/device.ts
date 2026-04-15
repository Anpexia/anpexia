const KEY = 'anpexia_device_id';

export function getDeviceId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = (crypto && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function getDeviceName(): string {
  const ua = navigator.userAgent;
  // Very rough detection, good enough for a friendly label
  let os = 'Desktop';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS/i.test(ua)) os = 'Mac';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad/i.test(ua)) os = 'iOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Navegador';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  return `${os} — ${browser}`;
}
