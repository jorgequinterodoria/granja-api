const fetch = require('node-fetch');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImIwMjNkNGYyLWNmNTYtNDEyOC1hZDYxLTdkOWZhZjAxZjZkNCIsImZhcm1JZCI6Ijk1OGJkMTc4LTkyYWUtNDRhZi04Yzk5LWM5NmFjZWNjMWM0MCIsInJvbGVJZCI6MSwicGxhbiI6IlBybyIsInBlcm1pc3Npb25zIjpbInBpZy5jcmVhdGUiLCJwaWcudmlldyIsInBpZy5lZGl0IiwicGlnLmRlbGV0ZSIsImZpbmFuY2UudmlldyIsImZpbmFuY2UubWFuYWdlIiwiaGVhbHRoLm1hbmFnZSIsImFkbWluLm1hbmFnZSJdLCJpYXQiOjE3Njg1MjQ5NzIsImV4cCI6MTc3MTExNjk3Mn0.abBbF9q2TBljNbi3FRYg03Vd9X1fVc1KsQaxVYVgRG0';

async function testSync() {
  try {
    const response = await fetch('http://localhost:3000/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        changes: {
          sections: [{
            id: "11039b34-400e-4f73-82b6-20e3f90027ec",
            name: "Test Section",
            syncStatus: "pending"
          }],
          pens: [],
          pigs: [],
          health_records: [],
          weight_logs: [],
          breeding_events: [],
          feed_inventory: [],
          feed_usage: [],
          access_logs: [],
          user_points: []
        },
        lastPulledAt: null
      })
    });

    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testSync();
