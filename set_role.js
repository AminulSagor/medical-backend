const { Client } = require('pg');
require('dotenv').config();

const email = process.argv[2];
const role = process.argv[3];
if (!email || !role) { console.error('Usage: node set_role.js <email> <role>'); process.exit(1); }
(async () => {
  const c = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'medical',
  });
  await c.connect();
  const r = await c.query('UPDATE users SET role=$1 WHERE "medicalEmail"=$2', [role, email]);
  console.log(`Updated ${r.rowCount} rows: ${email} -> ${role}`);
  await c.end();
})();
