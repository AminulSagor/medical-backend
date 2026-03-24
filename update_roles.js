const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'medical_db',
  });

  await client.connect();

  // Update all admin* emails to admin role
  const updateResult = await client.query(
    `UPDATE users SET role = 'admin' WHERE "medicalEmail" LIKE 'admin%'`
  );
  console.log('Updated admin rows:', updateResult.rowCount);

  // Also update user.sifathossain to admin
  const updateResult2 = await client.query(
    `UPDATE users SET role = 'admin' WHERE "medicalEmail" = 'user.sifathossain@gmail.com'`
  );
  console.log('Updated sifat rows:', updateResult2.rowCount);

  // List all users
  const result = await client.query(
    `SELECT id, "fullLegalName", "medicalEmail", role, "isVerified" FROM users ORDER BY "createdAt" DESC`
  );
  console.log('\nAll users:');
  console.log(JSON.stringify(result.rows, null, 2));

  await client.end();
}

main().catch(console.error);
