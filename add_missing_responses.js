// add_missing_responses.js - Add the remaining 2 endpoint responses to Postman
const fs = require('fs');
const path = require('path');

const collectionPath = path.join(__dirname, 'Medical-Backend-API.postman_collection.json');
const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));

const refreshUrlResponse = {
  "message":"Read URL refreshed successfully",
  "readUrl":"https://ibass-collection.s3.ap-south-1.amazonaws.com/test/test-image.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIATSMCXTUQADGW7DIC%2F20260307%2Fap-south-1%2Fs3%2Faws4_request&X-Amz-Date=20260307T201557Z&X-Amz-Expires=604800&X-Amz-Signature=redacted&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject",
  "fileKey":"test/test-image.jpg",
  "expiresIn":"7 days"
};

const reservationResponse = {
  "message":"Workshop booked successfully",
  "data":{
    "reservationId":"b0d01741-2587-44f6-9315-956576cbd73a",
    "workshopId":"e1942740-176c-48e3-9dbf-ca63c1a21685",
    "numberOfSeats":2,
    "pricePerSeat":"1500",
    "totalPrice":"3000",
    "status":"confirmed",
    "attendees":[
      {"id":"a4bd68f3-863c-4e8a-a84d-80cc5fb2e344","reservationId":"b0d01741-2587-44f6-9315-956576cbd73a","fullName":"Bob Regular","professionalRole":"Registered Nurse","npiNumber":"1234567890","email":"bob.test@example.com","createdAt":"2026-03-07T20:16:35.662Z","updatedAt":"2026-03-07T20:16:35.662Z"},
      {"id":"e2c74ec9-6be6-45e8-8fdb-d9864aa5b0f3","reservationId":"b0d01741-2587-44f6-9315-956576cbd73a","fullName":"Alice Student","professionalRole":"Medical Student","npiNumber":"0987654321","email":"alice.test@example.com","createdAt":"2026-03-07T20:16:35.662Z","updatedAt":"2026-03-07T20:16:35.662Z"}
    ],
    "availableSeatsRemaining":28,
    "createdAt":"2026-03-07T20:16:35.662Z"
  }
};

function createResp(name, code, body, request) {
  return {
    name,
    originalRequest: request ? JSON.parse(JSON.stringify(request)) : undefined,
    status: code < 300 ? 'OK' : 'Error',
    code,
    _postman_previewlanguage: 'json',
    header: [{ key: 'Content-Type', value: 'application/json' }],
    body: JSON.stringify(body, null, 2)
  };
}

function processItems(items) {
  let updated = 0;
  for (const item of items) {
    if (item.item) { updated += processItems(item.item); continue; }
    if (!item.request) continue;
    
    const name = item.name.replace(/[^\x20-\x7E]/g, '').trim();
    
    if (name.includes('Refresh File') || name.includes('Refresh Read') || name === 'Refresh File  Url') {
      if (!item.response) item.response = [];
      item.response.push(createResp('200 - Refresh Read URL', 200, refreshUrlResponse, item.request));
      updated++;
      console.log(`Added response to: ${item.name}`);
    }
    
    if (name === 'Order Reservation') {
      if (!item.response) item.response = [];
      item.response.push(createResp('201 - Create Reservation', 201, reservationResponse, item.request));
      updated++;
      console.log(`Added response to: ${item.name}`);
    }
  }
  return updated;
}

const count = processItems(collection.item);
console.log(`Added ${count} missing responses`);

fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2), 'utf8');
console.log('Postman collection saved');
