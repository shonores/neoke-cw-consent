// test_api.cjs
async function run() {
  const baseUrl = 'https://b2b-poc.id-node.neoke.com';
  const apiKey = 'dk_Uz4O7Vty17NZot4hdu5RIegRJnQUkeF3nmjNnXGbSOE';

  try {
    const authRes = await fetch(`${baseUrl}/:/auth/authn`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `ApiKey ${apiKey}`
      }
    });
    const authData = await authRes.json();
    if (!authData.token) {
      console.error('Failed to get token:', authData);
      return;
    }
    const token = authData.token;
    console.log('Got token:', token.substring(0, 20) + '...');

    // Now fetch stored credentials
    const credsRes = await fetch(`${baseUrl}/:/credentials/stored`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!credsRes.ok) {
        console.error('Failed to fetch credentials, status:', credsRes.status);
        console.error(await credsRes.text());
        return;
    }
    const credsData = await credsRes.json();
    console.log('Stored Credentials Response:');
    console.log(JSON.stringify(credsData, null, 2));
    
  } catch (err) {
    console.error('Error:', err);
  }
}
run();
