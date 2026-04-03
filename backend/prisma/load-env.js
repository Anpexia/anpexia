// Runner para o Prisma CLI com .env da raiz do monorepo (apenas local)
// Em produção (Railway, Render), DATABASE_URL já está no ambiente.
// Uso: node prisma/load-env.js <comando prisma>
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { execSync } = require('child_process');

// Só carrega .env se não estiver em produção e DATABASE_URL não existir
if (!process.env.DATABASE_URL) {
  let dir = __dirname;
  let found = false;
  while (!found) {
    const envPath = path.join(dir, '.env');
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      found = true;
    } else {
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  if (!found) {
    console.warn('Aviso: .env nao encontrado, usando variaveis do ambiente');
  }
}

const args = process.argv.slice(2).join(' ');
if (!args) {
  console.error('Uso: node prisma/load-env.js <comando prisma>');
  console.error('Ex:  node prisma/load-env.js migrate dev');
  process.exit(1);
}

try {
  execSync(`npx prisma ${args}`, { stdio: 'inherit', env: process.env });
} catch (e) {
  process.exit(e.status || 1);
}
