import jwt from 'jsonwebtoken';
import axios from 'axios';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const secret = process.env.JWT_SECRET;
if (!secret) { console.log('JWT_SECRET not found'); process.exit(1); }

// Test against LOCAL server
const BASE = 'http://localhost:3000/api/v1';

async function test() {
  const token = jwt.sign({
    userId: 'cmo36bzm2000nqk01af8lk08m',
    tenantId: null,
    role: 'ADMIN',
    email: 'angelolarocca10@gmail.com'
  }, secret!, { expiresIn: '5m' });

  console.log('=== GET /admin/usuarios (LOCAL) with ADMIN token (tenantId=null) ===');
  try {
    const resp = await axios.get(`${BASE}/admin/usuarios`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Status:', resp.status);
    console.log('Items:', JSON.stringify(resp.data.data?.items?.map((u: any) => ({ email: u.email, role: u.role }))));
  } catch (e: any) {
    console.log('Error:', e.response?.status, JSON.stringify(e.response?.data));
    if (e.code === 'ECONNREFUSED') console.log('Server not running locally');
  }
}
test();
