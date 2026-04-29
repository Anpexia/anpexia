import axios from 'axios';
async function test() {
  try {
    const login = await axios.post('https://backend-production-e9a8.up.railway.app/api/v1/auth/admin/login', {
      email: 'angelolarocca10@gmail.com',
      password: 'Telef0ne!',
      deviceId: 'test-device-123'
    });
    console.log('Login status:', login.status);
    console.log('User:', JSON.stringify(login.data.data?.user));
    const token = login.data.data?.accessToken;
    if (!token) { console.log('SEM TOKEN - resposta completa:', JSON.stringify(login.data)); return; }

    const usuarios = await axios.get('https://backend-production-e9a8.up.railway.app/api/v1/admin/usuarios', {
      headers: { Authorization: 'Bearer ' + token }
    });
    console.log('Usuarios status:', usuarios.status);
    console.log('Usuarios data:', JSON.stringify(usuarios.data));
  } catch(e: any) {
    console.error('Erro:', e.response?.status, JSON.stringify(e.response?.data));
  }
}
test();
