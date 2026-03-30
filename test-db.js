const { Client } = require('pg');

async function test() {
  try {
    const client = new Client({
      user: 'postgres',
      host: 'localhost',
      database: 'medical',
      password: 'postgres',
      port: 5432,
    });
    await client.connect();
    
    const res = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'`);
    console.log(res.rows.map(r => r.tablename));
    await client.end();
  } catch (err) {
    console.error(err);
  }
}
test();
