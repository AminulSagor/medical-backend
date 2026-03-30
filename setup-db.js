const { Client } = require('pg');
const bcrypt = require('bcrypt');

async function setup() {
  try {
    const client = new Client({
      user: 'postgres',
      host: 'localhost',
      database: 'medical',
      password: 'postgres',
      port: 5432,
    });
    await client.connect();
    const hash = await bcrypt.hash('123456', 10);
    
    // Check if user exists
    const res = await client.query(`SELECT id FROM "users" WHERE "medicalEmail" = 'admin@test.com'`);
    if (res.rowCount === 0) {
        await client.query(`INSERT INTO "users" ("medicalEmail", "password", "role", "fullLegalName", "isVerified", "professionalRole") VALUES ('admin@test.com', $1, 'admin', 'Test Admin', true, 'Admin')`, [hash]);
        console.log('Created new admin user: admin@test.com');
    } else {
        await client.query(`UPDATE "users" SET password = $1, role = 'admin', "isVerified" = true WHERE "medicalEmail" = 'admin@test.com'`, [hash]);
        console.log('Updated existing user admin@test.com to admin role with new password.');
    }
    
    // Also create a test student user for testing user search
    const hash2 = await bcrypt.hash('123456', 10);
    const res2 = await client.query(`SELECT id FROM "users" WHERE "medicalEmail" = 'sifatstudent@test.com'`);
    if (res2.rowCount === 0) {
        await client.query(`INSERT INTO "users" ("medicalEmail", "password", "role", "fullLegalName", "isVerified", "professionalRole") VALUES ('sifatstudent@test.com', $1, 'user', 'Sifat Student', true, 'Student')`, [hash2]);
    }
    
    await client.end();
  } catch (err) {
    console.error(err);
  }
}
setup();
