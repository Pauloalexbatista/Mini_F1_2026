async function testLogin() {
  try {
    const res = await fetch('http://localhost:3001/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'pauloalexbatista@gmail.com', password: 'password' })
    });
    
    console.log('STATUS:', res.status);
    console.log('HEADERS:', Object.fromEntries(res.headers.entries()));
    const text = await res.text();
    console.log('BODY:', text);
  } catch (e) {
    console.error('FETCH ERROR:', e.message);
  }
}

testLogin();
