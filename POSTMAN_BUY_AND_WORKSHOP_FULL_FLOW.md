# Postman Full Testing Guide: Product Buy + Course/Workshop Reservation

This guide is a complete, practical API runbook for testing:

1. Product buying full flow
2. Course/Workshop reservation full flow

Test target: Postman
Backend style: NestJS + JWT + Stripe checkout

## 0) Important Clarification

In this backend, "course purchase" is implemented as workshop checkout + reservation flow.
Use workshop endpoints for course/workshop buying.

Production recommendation for product checkout:
- Use `POST /payments/product/order-summary` to create a persisted `orderSummaryId`.
- Then call `POST /payments/checkout-session` with `domainType=product` and that `orderSummaryId`.
- `POST /public/orders/summary` remains useful as a public preview calculator.

## 1) Prerequisites

## 1.1 Server and DB
- Backend is running (example: `http://localhost:3000`)
- PostgreSQL is connected and migrated (this project uses `synchronize: true` in dev)

## 1.2 Required environment values
Make sure these are configured in your backend `.env`:

- `JWT_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_CHECKOUT_SUCCESS_URL` (optional if passed per-request)
- `STRIPE_CHECKOUT_CANCEL_URL` (optional if passed per-request)

For easier OTP testing in local/dev:
- `BYPASS_EMAIL_OTP=true`
- `DEFAULT_OTP_CODE=123456`

## 1.3 Stripe webhook note
Product final order creation depends on webhook completion.
Workshop payment status also becomes paid through webhook path.

If your webhook is not publicly reachable, use Stripe CLI forwarding:

```bash
stripe listen --forward-to http://localhost:3000/payments/webhooks/stripe
```

Keep this terminal open while paying on Stripe checkout page.

## 2) Postman Environment Setup

Create a Postman environment with these variables:

- `baseUrl` = `http://localhost:3000`
- `email`
- `password`
- `accessToken`
- `productId`
- `workshopId`
- `orderSummaryId`
- `sessionId`
- `paymentId`
- `finalizedRefId`
- `attendeeId1`
- `attendeeId2`

For authenticated requests, set header:

- `Authorization: Bearer {{accessToken}}`

## 3) Auth Flow (Required Before Checkout)

## 3.1 Register

- Method: `POST`
- URL: `{{baseUrl}}/auth/register`
- Body:

```json
{
  "fullLegalName": "Flow Student",
  "medicalEmail": "flow.student@example.com",
  "professionalRole": "Medical Student",
  "password": "SecurePass123",
  "forgetPassword": false
}
```

Success response example (`201`):

```json
{
  "message": "Account created successfully",
  "user": {
    "id": "6e8a62bf-8326-4f7d-a8f3-6a52e366fcf4",
    "fullLegalName": "Flow Student",
    "medicalEmail": "flow.student@example.com",
    "professionalRole": "Medical Student"
  }
}
```

Common error example (`400`):

```json
{
  "statusCode": 400,
  "path": "/auth/register",
  "message": "Medical email already exists"
}
```

## 3.2 Send OTP

- Method: `POST`
- URL: `{{baseUrl}}/auth/send-otp`
- Body:

```json
{
  "email": "flow.student@example.com"
}
```

Success example (`201`):

```json
{
  "message": "OTP bypassed - check console logs or use DEFAULT_OTP_CODE",
  "expiresInSeconds": 300,
  "debugOtp": "123456"
}
```

## 3.3 Verify OTP

- Method: `POST`
- URL: `{{baseUrl}}/auth/verify-otp`
- Body:

```json
{
  "email": "flow.student@example.com",
  "otp": "123456"
}
```

Success example (`201`):

```json
{
  "message": "OTP verified successfully",
  "email": "flow.student@example.com"
}
```

## 3.4 Login

- Method: `POST`
- URL: `{{baseUrl}}/auth/login`
- Body:

```json
{
  "email": "flow.student@example.com",
  "password": "SecurePass123"
}
```

Success example (`201`):

```json
{
  "accessToken": "<jwt>",
  "user": {
    "id": "6e8a62bf-8326-4f7d-a8f3-6a52e366fcf4",
    "fullLegalName": "Flow Student",
    "medicalEmail": "flow.student@example.com",
    "professionalRole": "Medical Student"
  }
}
```

Postman Tests script (save token):

```javascript
const res = pm.response.json();
pm.environment.set("accessToken", res.accessToken);
```

Common error (`401`):

```json
{
  "statusCode": 401,
  "path": "/auth/login",
  "message": "Account is not verified"
}
```

## 4) Get Test Product + Workshop IDs

## 4.1 Product ID from public products

- Method: `GET`
- URL: `{{baseUrl}}/public/products?page=1&limit=10`

Success example (`200`):

```json
{
  "data": [
    {
      "id": "25535f1a-916e-4694-a0f8-41cc4cb95a8e",
      "name": "Fiberoptic Intubation Kit"
    }
  ]
}
```

Postman Tests script:

```javascript
const body = pm.response.json();
const first = body?.data?.[0];
if (first?.id) pm.environment.set("productId", first.id);
```

## 4.2 Workshop ID from public workshops

- Method: `GET`
- URL: `{{baseUrl}}/workshops?page=1&limit=10`

Pick a `published` workshop id.

Postman Tests script:

```javascript
const body = pm.response.json();
const first = body?.data?.[0];
if (first?.id) pm.environment.set("workshopId", first.id);
```

If you have no data, ask admin to create products/workshops first.

## 5) Product Buying Full Flow (Postman)

## 5.1 Build product order summary

- Method: `POST`
- URL: `{{baseUrl}}/public/orders/summary`
- Body:

```json
{
  "items": [
    {
      "productId": "{{productId}}",
      "quantity": 2
    }
  ]
}
```

Success (`201`):

```json
{
  "message": "Order summary calculated successfully",
  "data": {
    "items": [
      {
        "productId": "25535f1a-916e-4694-a0f8-41cc4cb95a8e",
        "name": "Fiberoptic Intubation Kit",
        "sku": "KIT-001",
        "photo": "https://cdn.example.com/p1.jpg",
        "quantity": 2,
        "unitPrice": "99.00",
        "lineTotal": "198.00"
      }
    ],
    "subtotal": "198.00",
    "estimatedShipping": "15.00",
    "estimatedTax": "19.80",
    "orderTotal": "232.80"
  }
}
```

Common error (`400`):

```json
{
  "statusCode": 400,
  "path": "/public/orders/summary",
  "message": "Some products are invalid or inactive"
}
```

## 5.2 Get shipping address

- Method: `GET`
- URL: `{{baseUrl}}/public/orders/shipping-address`
- Auth: Bearer required

Success (`200`):

```json
{
  "message": "Shipping address fetched successfully",
  "data": {
    "fullName": "Flow Student",
    "addressLine1": "",
    "addressLine2": "",
    "city": "",
    "state": "",
    "zipCode": "",
    "country": "US",
    "isComplete": false
  }
}
```

## 5.3 Save shipping address

- Method: `PATCH`
- URL: `{{baseUrl}}/public/orders/shipping-address`
- Auth: Bearer required
- Body:

```json
{
  "fullName": "Flow Student",
  "addressLine1": "100 Main Street",
  "addressLine2": "Suite 10",
  "city": "Houston",
  "state": "TX",
  "zipCode": "77001",
  "country": "US"
}
```

Success (`200`):

```json
{
  "message": "Shipping address updated successfully",
  "data": {
    "fullName": "Flow Student",
    "addressLine1": "100 Main Street",
    "addressLine2": "Suite 10",
    "city": "Houston",
    "state": "TX",
    "zipCode": "77001",
    "country": "US",
    "isComplete": true
  }
}
```

## 5.4 Create persisted product order summary (production)

- Method: `POST`
- URL: `{{baseUrl}}/payments/product/order-summary`
- Auth: Bearer required
- Body:

```json
{
  "items": [
    {
      "productId": "{{productId}}",
      "quantity": 2
    }
  ]
}
```

Success (`201`):

```json
{
  "message": "Product order summary created successfully",
  "data": {
    "orderSummaryId": "e0a05eb0-31a5-4f0f-8963-64fef8c66980",
    "status": "pending",
    "expiresAt": "2026-04-09T12:00:00.000Z",
    "items": [
      {
        "productId": "25535f1a-916e-4694-a0f8-41cc4cb95a8e",
        "name": "Fiberoptic Intubation Kit",
        "sku": "KIT-001",
        "photo": "https://cdn.example.com/p1.jpg",
        "quantity": 2,
        "unitPrice": "99.00",
        "lineTotal": "198.00"
      }
    ],
    "subtotal": "198.00",
    "estimatedShipping": "15.00",
    "estimatedTax": "19.80",
    "orderTotal": "232.80"
  }
}
```

Postman Tests script:

```javascript
const body = pm.response.json();
pm.environment.set("orderSummaryId", body.data.orderSummaryId);
```

## 5.5 Create checkout session (product) using orderSummaryId

- Method: `POST`
- URL: `{{baseUrl}}/payments/checkout-session`
- Auth: Bearer required
- Body:

```json
{
  "domainType": "product",
  "orderSummaryId": "{{orderSummaryId}}",
  "successUrl": "http://localhost:5173/checkout/success?session_id={CHECKOUT_SESSION_ID}",
  "cancelUrl": "http://localhost:5173/checkout/cancel"
}
```

Success (`201`):

```json
{
  "message": "Checkout session created successfully",
  "data": {
    "paymentId": "22898739-8388-4c0b-a3c7-d84588d0c26f",
    "domainType": "product",
    "sessionId": "cs_test_a1b2",
    "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_a1b2",
    "orderSummaryId": "e0a05eb0-31a5-4f0f-8963-64fef8c66980",
    "shippingAddress": {
      "fullName": "Flow Student",
      "addressLine1": "100 Main Street",
      "addressLine2": "Suite 10",
      "city": "Houston",
      "state": "TX",
      "zipCode": "77001",
      "country": "US"
    },
    "orderSummary": {
      "subtotal": "198.00",
      "estimatedShipping": "15.00",
      "estimatedTax": "19.80",
      "orderTotal": "232.80"
    }
  }
}
```

Postman Tests script:

```javascript
const body = pm.response.json();
pm.environment.set("paymentId", body.data.paymentId);
pm.environment.set("sessionId", body.data.sessionId);
pm.environment.set("checkoutUrl", body.data.checkoutUrl);
```

Common error (`400`):

```json
{
  "statusCode": 400,
  "path": "/payments/checkout-session",
  "message": "Shipping address is required before checkout"
}
```

Common error (`400`) if summary is expired:

```json
{
  "statusCode": 400,
  "path": "/payments/checkout-session",
  "message": "Order summary expired, create a new one"
}
```

## 5.6 Complete payment on Stripe page

Open `checkoutUrl` from previous response in your browser and pay with Stripe test card.

After payment, webhook must reach backend.

## 5.7 Check payment status

- Method: `GET`
- URL: `{{baseUrl}}/payments/session-status/{{sessionId}}`
- Auth: Bearer required

Pending example (`200`):

```json
{
  "message": "Payment session status fetched successfully",
  "data": {
    "paymentId": "22898739-8388-4c0b-a3c7-d84588d0c26f",
    "domainType": "product",
    "domainRefId": "e0a05eb0-31a5-4f0f-8963-64fef8c66980",
    "status": "pending",
    "providerSessionId": "cs_test_a1b2",
    "finalizedRefId": null
  }
}
```

Paid example (`200`):

```json
{
  "message": "Payment session status fetched successfully",
  "data": {
    "paymentId": "22898739-8388-4c0b-a3c7-d84588d0c26f",
    "domainType": "product",
    "domainRefId": "e0a05eb0-31a5-4f0f-8963-64fef8c66980",
    "status": "paid",
    "providerSessionId": "cs_test_a1b2",
    "finalizedRefId": "3e42c95e-fccf-4f76-81ac-c3fa4f2dbf18",
    "paidAt": "2026-04-09T10:20:30.000Z"
  }
}
```

`finalizedRefId` for product = created order UUID.

Postman Tests script:

```javascript
const body = pm.response.json();
if (body?.data?.finalizedRefId) {
  pm.environment.set("finalizedRefId", body.data.finalizedRefId);
}
```

## 5.8 Verify student recent order endpoint

- Method: `GET`
- URL: `{{baseUrl}}/public/orders/student/recent-product-order`
- Auth: Bearer required

Success (`200`):

```json
{
  "message": "Recent product order fetched successfully",
  "data": {
    "orderId": "ORD-8824",
    "orderedAt": "2026-04-09T10:20:30.000Z",
    "orderedAtFullDate": "2026-04-09T10:20:30.000Z",
    "price": "232.80",
    "shippingStatus": "processing",
    "fulfillmentStatus": "unfulfilled",
    "paymentStatus": "paid",
    "productName": "Fiberoptic Intubation Kit",
    "productImage": "https://cdn.example.com/p1.jpg",
    "products": [
      {
        "productId": "25535f1a-916e-4694-a0f8-41cc4cb95a8e",
        "productName": "Fiberoptic Intubation Kit",
        "productImage": "https://cdn.example.com/p1.jpg",
        "quantity": 2,
        "unitPrice": "99.00",
        "lineTotal": "198.00"
      }
    ]
  }
}
```

No data case (`200`):

```json
{
  "message": "No recent product order found",
  "data": null
}
```

## 6) Course/Workshop Reservation Full Flow (Postman)

## 6.1 Create workshop order summary

- Method: `POST`
- URL: `{{baseUrl}}/workshops/checkout/order-summary`
- Auth: Bearer required
- Body:

```json
{
  "workshopId": "{{workshopId}}",
  "attendees": [
    {
      "fullName": "Attendee One",
      "professionalRole": "Nurse",
      "npiNumber": "1234567890",
      "email": "attendee1@example.com"
    },
    {
      "fullName": "Attendee Two",
      "professionalRole": "Resident",
      "email": "attendee2@example.com"
    }
  ]
}
```

Success (`201`):

```json
{
  "message": "Order summary created successfully",
  "data": {
    "orderSummaryId": "11b1f4a8-8143-49e3-98fe-39a0c70fb8cb",
    "workshop": {
      "id": "4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d",
      "title": "Advanced Airway Management",
      "deliveryMode": "online",
      "coverImageUrl": "https://cdn.example.com/w1.jpg"
    },
    "attendees": [
      {
        "id": "6f42d03f-7f63-4ca7-94aa-953ff644f34f",
        "index": 1,
        "fullName": "Attendee One",
        "professionalRole": "Nurse",
        "npiNumber": "1234567890",
        "email": "attendee1@example.com"
      },
      {
        "id": "3bf31c80-4145-4d1f-bf0f-58c8c5c7908a",
        "index": 2,
        "fullName": "Attendee Two",
        "professionalRole": "Resident",
        "npiNumber": null,
        "email": "attendee2@example.com"
      }
    ],
    "numberOfAttendees": 2,
    "availableSeats": 40,
    "pricing": {
      "standardPricePerSeat": "150.00",
      "appliedPricePerSeat": "150.00",
      "discountApplied": false,
      "discountInfo": null,
      "subtotal": "300.00",
      "tax": "0.00",
      "totalPrice": "300.00"
    },
    "createdAt": "2026-04-09T10:35:00.000Z"
  }
}
```

Postman Tests script:

```javascript
const body = pm.response.json();
pm.environment.set("orderSummaryId", body.data.orderSummaryId);
pm.environment.set("attendeeId1", body.data.attendees[0].id);
pm.environment.set("attendeeId2", body.data.attendees[1].id);
```

Common error (`400`):

```json
{
  "statusCode": 400,
  "path": "/workshops/checkout/order-summary",
  "message": "At least one attendee is required"
}
```

## 6.2 Optional: Get summary by id

- Method: `GET`
- URL: `{{baseUrl}}/workshops/checkout/order-summary/{{orderSummaryId}}`
- Auth: Bearer required

Success (`200`):

```json
{
  "message": "Order summary fetched successfully",
  "data": {
    "orderSummaryId": "11b1f4a8-8143-49e3-98fe-39a0c70fb8cb",
    "status": "pending"
  }
}
```

## 6.3 Create checkout session (workshop)

- Method: `POST`
- URL: `{{baseUrl}}/payments/checkout-session`
- Auth: Bearer required
- Body:

```json
{
  "domainType": "workshop",
  "orderSummaryId": "{{orderSummaryId}}",
  "successUrl": "http://localhost:5173/workshops/checkout/success?session_id={CHECKOUT_SESSION_ID}",
  "cancelUrl": "http://localhost:5173/workshops/checkout/cancel"
}
```

Success (`201`):

```json
{
  "message": "Checkout session created successfully",
  "data": {
    "paymentId": "c0e30fa0-36bc-4f3c-b191-45d3c63eb21a",
    "domainType": "workshop",
    "sessionId": "cs_test_w1x2",
    "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_w1x2",
    "workshop": {
      "id": "4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d",
      "title": "Advanced Airway Management"
    },
    "orderSummaryId": "11b1f4a8-8143-49e3-98fe-39a0c70fb8cb",
    "numberOfAttendees": 2,
    "totalPrice": "300.00"
  }
}
```

Postman Tests script:

```javascript
const body = pm.response.json();
pm.environment.set("paymentId", body.data.paymentId);
pm.environment.set("sessionId", body.data.sessionId);
pm.environment.set("checkoutUrl", body.data.checkoutUrl);
```

## 6.4 Complete payment on Stripe page

Open `checkoutUrl` and complete payment using Stripe test card.

## 6.5 Check payment status

- Method: `GET`
- URL: `{{baseUrl}}/payments/session-status/{{sessionId}}`
- Auth: Bearer required

Paid status example (`200`):

```json
{
  "message": "Payment session status fetched successfully",
  "data": {
    "domainType": "workshop",
    "status": "paid",
    "finalizedRefId": "11b1f4a8-8143-49e3-98fe-39a0c70fb8cb"
  }
}
```

`finalizedRefId` for workshop = paid order summary id.

## 6.6 Create workshop reservation (final booking)

Call this only after payment is `paid`.

- Method: `POST`
- URL: `{{baseUrl}}/workshops/reservations`
- Auth: Bearer required
- Body:

```json
{
  "workshopId": "{{workshopId}}",
  "attendeeIds": [
    "{{attendeeId1}}",
    "{{attendeeId2}}"
  ]
}
```

Success (`201`):

```json
{
  "message": "Workshop booked successfully",
  "data": {
    "reservationId": "9f9c6db4-a0c2-4306-a9f2-9f45f034952a",
    "workshopId": "4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d",
    "numberOfSeats": 2,
    "pricePerSeat": "150",
    "totalPrice": "300",
    "status": "confirmed",
    "attendees": [
      {
        "id": "2f83f7bc-7836-46de-928d-ec071e39696f",
        "fullName": "Attendee One",
        "professionalRole": "Nurse",
        "npiNumber": "1234567890",
        "email": "attendee1@example.com"
      }
    ],
    "availableSeatsRemaining": 38,
    "createdAt": "2026-04-09T10:45:00.000Z"
  }
}
```

Common error when payment not completed (`400`):

```json
{
  "statusCode": 400,
  "path": "/workshops/reservations",
  "message": "Invalid attendee IDs, payment not verified, or attendees do not belong to your paid order summary"
}
```

## 6.7 Verify student enrolled workshops

- Method: `GET`
- URL: `{{baseUrl}}/workshops/student/enrolled-workshops`
- Auth: Bearer required

Success (`200`):

```json
{
  "message": "Enrolled workshops fetched successfully",
  "data": [
    {
      "workshopId": "4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d",
      "title": "Advanced Airway Management",
      "deliveryMode": "online",
      "workshopPhoto": "https://cdn.example.com/w1.jpg",
      "isEnrolled": true,
      "enrollmentSource": "reservation",
      "enrolledAt": "2026-04-09T10:45:00.000Z",
      "reservation": {
        "reservationId": "9f9c6db4-a0c2-4306-a9f2-9f45f034952a",
        "status": "confirmed",
        "numberOfSeats": 2,
        "pricePerSeat": "150",
        "totalPrice": "300"
      },
      "startDate": "2026-04-20T00:00:00.000Z",
      "endDate": "2026-04-22T00:00:00.000Z"
    }
  ]
}
```

## 7) Workshop Fallback (If Webhook Is Delayed)

For workshop only, you can verify payment directly after paying using legacy endpoint:

- Method: `POST`
- URL: `{{baseUrl}}/workshops/checkout/payment-verify`
- Auth: Bearer required
- Body:

```json
{
  "orderSummaryId": "{{orderSummaryId}}",
  "sessionId": "{{sessionId}}"
}
```

Success (`201`):

```json
{
  "message": "Workshop payment verified successfully",
  "data": {
    "orderSummaryId": "11b1f4a8-8143-49e3-98fe-39a0c70fb8cb",
    "status": "completed",
    "paymentStatus": "paid"
  }
}
```

Then call `/workshops/reservations`.

## 8) Common Error Cases

## 8.1 Missing auth token

```json
{
  "statusCode": 401,
  "path": "/public/orders/shipping-address",
  "message": "Unauthorized"
}
```

## 8.2 Invalid workshop or product ID

```json
{
  "statusCode": 400,
  "path": "/public/orders/summary",
  "message": "Some products are invalid or inactive"
}
```

## 8.3 Trying to reserve before payment

```json
{
  "statusCode": 400,
  "path": "/workshops/reservations",
  "message": "Invalid attendee IDs, payment not verified, or attendees do not belong to your paid order summary"
}
```

## 8.4 Stripe config missing

```json
{
  "statusCode": 400,
  "path": "/payments/checkout-session",
  "message": "STRIPE_SECRET_KEY is not configured"
}
```

## 8.5 Session stays pending and recent order is empty

If `GET /payments/session-status/{{sessionId}}` returns `status: pending` and
`GET /public/orders/student/recent-product-order` returns no data, payment finalization did not run yet.

This backend finalizes product orders only after Stripe webhook event
`checkout.session.completed` is received and verified on:

`POST /payments/webhooks/stripe`

Checklist:

1. Open the returned `checkoutUrl` and complete payment on Stripe Checkout.
2. Verify Stripe event delivery for `checkout.session.completed` shows HTTP 200 for your webhook endpoint.
3. Ensure webhook endpoint URL is exactly `/payments/webhooks/stripe`.
4. Ensure backend uses matching mode secrets:
   - Test mode: `sk_test...` and matching test `whsec...`
   - Live mode: `sk_live...` and matching live `whsec...`
5. Ensure backend was restarted after env updates.
6. For local development (`localhost`), forward events using Stripe CLI:

```bash
stripe listen --forward-to http://localhost:3000/payments/webhooks/stripe
```

Important:
- Sending generic test events from Stripe dashboard may not finalize your payment record,
  because this backend links checkout completion by `paymentId` metadata from the real created session.

Expected after successful webhook:
- `GET /payments/session-status/{{sessionId}}` -> `status: paid` and `finalizedRefId` not null.
- `GET /public/orders/student/recent-product-order` -> latest order appears.

## 9) Recommended Postman Request Order

1. Register
2. Send OTP
3. Verify OTP
4. Login (save token)
5. List products (save `productId`)
6. List workshops (save `workshopId`)
7. Product summary preview (optional)
8. Shipping GET
9. Shipping PATCH
10. Product order summary create (save `orderSummaryId`)
11. Product checkout session by `orderSummaryId` (save `sessionId`)
12. Pay on Stripe checkout page
13. Session status until `paid`
14. Student recent product order
15. Workshop order summary (save `orderSummaryId`, attendee ids)
16. Workshop checkout session (save `sessionId`)
17. Pay on Stripe checkout page
18. Session status until `paid`
19. Workshop reservation
20. Student enrolled workshops

You now have a complete Postman API flow for both product buying and course/workshop reservation.
