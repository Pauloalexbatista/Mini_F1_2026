import fetch from 'node-fetch';

async function run() {
    console.log("Registering temp user...");
    const regReq = await fetch('http://localhost:5173/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: "test_bot_500", password: "123", pilot_name: "Bot" })
    });
    const regRes: any = await regReq.json();
    console.log("Token:", regRes.token);
    
    console.log("Calling /api/me...");
    const meReq = await fetch('http://localhost:5173/api/me', {
         headers: { Authorization: `Bearer ${regRes.token}` }
    });
    
    if (!meReq.ok) {
         console.error("FAIL!", meReq.status);
         const text = await meReq.text();
         console.error("Details:", text);
    } else {
         const data = await meReq.json();
         console.log("Success:", data);
    }
}
run();
