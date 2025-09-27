const BASE_URL = 'http://localhost:3000/api/auth';

async function testAPI(method, endpoint, data = null, cookies = '') {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookies
    }
  };
  
  if (data) {
    options.body = JSON.stringify(data);
  }
  
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const result = await response.json();
    
    console.log(`\n${method} ${endpoint}`);
    console.log(`Status: ${response.status}`);
    console.log('Response:', result);
    
    // Extract session cookie if present
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const sessionCookie = setCookie.split(';')[0];
      console.log('Session Cookie:', sessionCookie);
      return { result, cookie: sessionCookie };
    }
    
    return { result };
  } catch (error) {
    console.error(`Error testing ${method} ${endpoint}:`, error.message);
    return { error: error.message };
  }
}

async function runTests() {
  console.log('🚀 เริ่มทดสอบ API...\n');
  
  // Test 1: Register
  const registerResult = await testAPI('POST', '/register', {
    phone: '0812345678',
    password: '123456',
    name: 'ทดสอบ ผู้ใช้',
    role: 'CUSTOMER'
  });
  
  // Test 2: Login
  const loginResult = await testAPI('POST', '/login', {
    phone: '0812345678',
    password: '123456'
  });
  
  const sessionCookie = loginResult.cookie || '';
  
  // Test 3: Check authentication
  await testAPI('GET', '/check', null, sessionCookie);
  
  // Test 4: Get user info
  await testAPI('GET', '/me', null, sessionCookie);
  
  // Test 5: Change password
  await testAPI('POST', '/change-password', {
    oldPassword: '123456',
    newPassword: '654321'
  }, sessionCookie);
  
  // Test 6: Logout
  await testAPI('POST', '/logout', null, sessionCookie);
  
  console.log('\n✅ ทดสอบเสร็จสิ้น');
}

runTests().catch(console.error);