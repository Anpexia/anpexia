import axios from 'axios';
const BASE = 'https://backend-production-e9a8.up.railway.app/api/v1';

async function test() {
  // Step 1: Login
  console.log('=== STEP 1: Login ===');
  let loginResp;
  try {
    loginResp = await axios.post(`${BASE}/auth/admin/login`, {
      email: 'angelolarocca10@gmail.com',
      password: 'Telef0ne!',
      deviceId: 'test-device-123'
    });
    console.log('Login OK:', loginResp.status);
  } catch (e: any) {
    console.log('Login error:', e.response?.status, e.response?.data?.error?.code);
    // If 2FA required, we can't continue without the code
    if (e.response?.data?.error?.code === 'DEVICE_NOT_TRUSTED') {
      console.log('2FA required - testing with anpexia@hotmail.com instead');
      try {
        loginResp = await axios.post(`${BASE}/auth/admin/login`, {
          email: 'anpexia@hotmail.com',
          password: '4nP3x1a0321@!',
          deviceId: 'test-device-123'
        });
        console.log('Login OK:', loginResp.status);
      } catch (e2: any) {
        console.log('Login error:', e2.response?.status, e2.response?.data?.error?.code);
        if (e2.response?.data?.error?.code === 'DEVICE_NOT_TRUSTED') {
          console.log('Both accounts need 2FA - cannot test automatically');
          return;
        }
      }
    }
  }

  if (!loginResp?.data?.data?.accessToken) {
    console.log('No token obtained');
    return;
  }

  const token = loginResp.data.data.accessToken;
  const user = loginResp.data.data.user;
  console.log('Logged in as:', user.email, 'role:', user.role, 'tenantId:', user.tenant?.id || 'null');

  // Step 2: Call /admin/usuarios
  console.log('\n=== STEP 2: GET /admin/usuarios ===');
  try {
    const resp = await axios.get(`${BASE}/admin/usuarios`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Status:', resp.status);
    console.log('Items:', JSON.stringify(resp.data.data?.items, null, 2));
  } catch (e: any) {
    console.log('Error:', e.response?.status, JSON.stringify(e.response?.data));
  }
}
test();
