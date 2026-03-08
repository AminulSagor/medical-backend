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

  // Set student role for student user
  await client.query(
    `UPDATE users SET role = 'student' WHERE "medicalEmail" LIKE 'student%'`
  );
  console.log('Set student roles');

  // Set instructor role for one user
  await client.query(
    `UPDATE users SET role = 'instructor' WHERE "medicalEmail" = 'john.smith2@hospital.com'`
  );
  console.log('Set instructor role');

  // Verify user.sifathossain@gmail.com
  await client.query(
    `UPDATE users SET "isVerified" = true WHERE "medicalEmail" = 'user.sifathossain@gmail.com'`
  );
  console.log('Verified sifat user');

  // List all users
  const result = await client.query(
    `SELECT id, "fullLegalName", "medicalEmail", role, "isVerified", status FROM users ORDER BY "createdAt" DESC`
  );
  console.log('\nAll users:');
  result.rows.forEach(u => {
    console.log(`  ${u.role.padEnd(12)} | ${u.isVerified ? 'V' : 'X'} | ${u.medicalEmail}`);
  });

  await client.end();
}

main().catch(console.error);
