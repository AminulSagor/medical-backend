const { Client } = require('pg');
const email = process.argv[2];
const role = process.argv[3];
if (!email || !role) { console.error('Usage: node set_role.js <email> <role>'); process.exit(1); }
(async () => {
  const c = new Client({ host: 'localhost', port: 5432, user: 'postgres', password: 'postgres', database: 'medical_db' });
  await c.connect();
  const r = await c.query('UPDATE users SET role=$1 WHERE "medicalEmail"=$2', [role, email]);
  console.log(`Updated ${r.rowCount} rows: ${email} -> ${role}`);
  await c.end();
})();
