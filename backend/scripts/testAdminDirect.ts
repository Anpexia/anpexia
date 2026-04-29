import jwt from 'jsonwebtoken';
import axios from 'axios';

// Read JWT secret from env
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const secret = process.env.JWT_SECRET;
if (!secret) { console.log('JWT_SECRET not found'); process.exit(1); }

const BASE = 'https://backend-production-e9a8.up.railway.app/api/v1';

async function test() {
  // Generate token for Angelo (ADMIN, tenantId null)
  const tokenAdmin = jwt.sign({
    userId: 'cmo36bzm2000nqk01af8lk08m',
    tenantId: null,
    role: 'ADMIN',
    email: 'angelolarocca10@gmail.com'
  }, secret!, { expiresIn: '5m' });

  console.log('=== TEST 1: GET /admin/usuarios with ADMIN token (tenantId=null) ===');
  try {
    const resp = await axios.get(`${BASE}/admin/usuarios`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` }
    });
    console.log('Status:', resp.status);
    console.log('Items count:', resp.data.data?.items?.length);
    console.log('Items:', JSON.stringify(resp.data.data?.items?.map((u: any) => ({ email: u.email, role: u.role })), null, 2));
  } catch (e: any) {
    console.log('Error:', e.response?.status, JSON.stringify(e.response?.data));
  }

  // Generate token for SUPER_ADMIN
  const tokenSuper = jwt.sign({
    userId: 'cmnjhr7uk0002n6qcq82ohz7q',
    tenantId: 'cmnjhqv8u0000n6g8kdwqgvb1',
    role: 'SUPER_ADMIN',
    email: 'anpexia@hotmail.com'
  }, secret!, { expiresIn: '5m' });

  console.log('\n=== TEST 2: GET /admin/usuarios with SUPER_ADMIN token ===');
  try {
    const resp = await axios.get(`${BASE}/admin/usuarios`, {
      headers: { Authorization: `Bearer ${tokenSuper}` }
    });
    console.log('Status:', resp.status);
    console.log('Items count:', resp.data.data?.items?.length);
    console.log('Items:', JSON.stringify(resp.data.data?.items?.map((u: any) => ({ email: u.email, role: u.role })), null, 2));
  } catch (e: any) {
    console.log('Error:', e.response?.status, JSON.stringify(e.response?.data));
  }
}
test();
