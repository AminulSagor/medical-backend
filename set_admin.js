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

  const result = await client.query(
    `UPDATE users SET role = 'admin' WHERE "medicalEmail" = 'admin@gmail.com' RETURNING id, "medicalEmail", role`
  );

  console.log('Updated:', result.rows);
  await client.end();
}

main().catch(console.error);
