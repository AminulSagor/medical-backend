const baseUrl = 'http://localhost:3000';

async function test() {
  try {
    // 1. Login
    console.log('Logging in...');
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: '123456' })
    });
    const loginData = await loginRes.json();
    if (!loginData.accessToken) {
       console.error('Login failed:', loginData);
       return;
    }
    const token = loginData.accessToken;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-type': 'application/json'
    };
    
    console.log('Login successful! Testing endpoints...');

    // 2. Bulk Create Categories
    console.log('\n--- Bulk Create Category ---');
    const bulkCatRes = await fetch(`${baseUrl}/admin/categories/bulk`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        categories: [
          { name: 'Test Surgery ' + Date.now() },
          { name: 'Test Pediatrics ' + Date.now() }
        ]
      })
    });
    console.log(await bulkCatRes.json());

    // 3. Search Category
    console.log('\n--- Search Categories (q=Test Sur) ---');
    const searchCatRes = await fetch(`${baseUrl}/admin/categories?q=Test Sur`, { headers });
    console.log(await searchCatRes.json());

    // 4. Search Tags
    console.log('\n--- Search Tags (q=test) ---');
    const searchTagsRes = await fetch(`${baseUrl}/admin/tags?q=test`, { headers });
    console.log(await searchTagsRes.json());

    // 5. Search Users
    console.log('\n--- Search Users by Name (q=sifat) ---');
    const searchUsersRes = await fetch(`${baseUrl}/admin/users?tab=all&q=sifat`, { headers });
    const usersData = await searchUsersRes.json();
    if (usersData.data) {
        console.log(`Found ${usersData.data.length} users matching 'sifat'`);
        console.log(usersData.data.map(u => ({ id: u.id, name: u.name, email: u.email })));
    } else {
        console.log(usersData);
    }
    
  } catch (err) {
    console.error('Test error:', err);
  }
}
test();
