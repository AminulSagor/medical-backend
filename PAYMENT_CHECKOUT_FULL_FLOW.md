# Checkout Implementation Contract (Tested)

This is the frontend integration contract for full purchase flow with payment completion.

Test run status:
- Date: 2026-04-08
- Result: Product full buy flow passed, Workshop full buy flow passed
- Payment completion source: Stripe webhook to backend

Validated endpoints in live run:
- POST /public/orders/summary -> 201
- GET /public/orders/shipping-address -> 200
- PATCH /public/orders/shipping-address -> 200
- POST /payments/checkout-session (product) -> 201
- GET /payments/session-status/:sessionId (pending) -> 200
- POST /payments/webhooks/stripe -> 200
- GET /payments/session-status/:sessionId (paid) -> 200
- GET /admin/orders/:id -> 200
- POST /workshops/checkout/order-summary -> 201
- GET /workshops/checkout/order-summary/:id -> 200
- POST /payments/checkout-session (workshop) -> 201
- GET /payments/session-status/:sessionId (pending) -> 200
- POST /payments/webhooks/stripe -> 200
- GET /payments/session-status/:sessionId (paid) -> 200
- POST /workshops/reservations -> 201

Important:
- Frontend must NOT call the webhook endpoint.
- Stripe calls webhook endpoint after payment events.
- Production-grade product checkout should use persisted summary flow:
  1) `POST /payments/product/order-summary` (auth)
  2) `POST /payments/checkout-session` with `domainType=product` and `orderSummaryId`
  3) `GET /payments/session-status/:sessionId`

---

## Product

## Step 1: Build checkout summary
Endpoint: POST /public/orders/summary
Auth: No

Request body:
```json
{
  "items": [
    {
      "productId": "<product-uuid>",
      "quantity": 2
    }
  ]
}
```

Success response (201):
```json
{
  "message": "Order summary calculated successfully",
  "data": {
    "items": [
      {
        "productId": "<product-uuid>",
        "name": "Flow Product",
        "sku": "FLOW-SKU-123",
        "photo": "https://example.com/flow-product.jpg",
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

## Step 2: Read saved shipping address
Endpoint: GET /public/orders/shipping-address
Auth: Bearer token required

Success response (200):
```json
{
  "message": "Shipping address fetched successfully",
  "data": {
    "fullName": "Flow Buyer",
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

## Step 3: Save shipping address
Endpoint: PATCH /public/orders/shipping-address
Auth: Bearer token required

Request body:
```json
{
  "fullName": "Flow Buyer",
  "addressLine1": "100 Main Street",
  "city": "Houston",
  "state": "TX",
  "zipCode": "77001"
}
```

Success response (200):
```json
{
  "message": "Shipping address updated successfully",
  "data": {
    "fullName": "Flow Buyer",
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

## Step 4: Create payment session
Endpoint: POST /payments/checkout-session
Auth: Bearer token required

Request body:
```json
{
  "domainType": "product",
  "items": [
    {
      "productId": "<product-uuid>",
      "quantity": 2
    }
  ],
  "successUrl": "http://localhost:5173/checkout/success?session_id={CHECKOUT_SESSION_ID}",
  "cancelUrl": "http://localhost:5173/checkout/cancel"
}
```

Success response (201):
```json
{
  "message": "Checkout session created successfully",
  "data": {
    "paymentId": "<payment-uuid>",
    "domainType": "product",
    "sessionId": "cs_test_...",
    "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_...",
    "shippingAddress": {
      "fullName": "Flow Buyer",
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

Frontend action:
- Redirect user to data.checkoutUrl.

## Step 5: Stripe-hosted payment
- User pays on Stripe page.
- Stripe sends event to POST /payments/webhooks/stripe.
- Backend marks payment as paid and creates final order + timeline.

Webhook response (200):
```json
{
  "received": true,
  "eventType": "checkout.session.completed"
}
```

## Step 6: Poll payment result from frontend
Endpoint: GET /payments/session-status/:sessionId
Auth: Bearer token required

Pending response:
```json
{
  "message": "Payment session status fetched successfully",
  "data": {
    "paymentId": "<payment-uuid>",
    "domainType": "product",
    "status": "pending",
    "providerSessionId": "cs_test_...",
    "finalizedRefId": null
  }
}
```

Paid response:
```json
{
  "message": "Payment session status fetched successfully",
  "data": {
    "paymentId": "<payment-uuid>",
    "domainType": "product",
    "status": "paid",
    "providerSessionId": "cs_test_...",
    "finalizedRefId": "<order-uuid>",
    "paidAt": "2026-04-08T00:00:00.000Z"
  }
}
```

Meaning of finalizedRefId for product:
- This is the created order id.

---

## Workshop

## Step 1: Create workshop order summary (attendees + pricing)
Endpoint: POST /workshops/checkout/order-summary
Auth: Bearer token required

Request body:
```json
{
  "workshopId": "<workshop-uuid>",
  "attendees": [
    {
      "fullName": "Flow Attendee One",
      "professionalRole": "Nurse",
      "npiNumber": "1234567890",
      "email": "attendee1@example.com"
    },
    {
      "fullName": "Flow Attendee Two",
      "professionalRole": "Resident",
      "email": "attendee2@example.com"
    }
  ]
}
```

Success response (201):
```json
{
  "message": "Order summary created successfully",
  "data": {
    "orderSummaryId": "<order-summary-uuid>",
    "workshop": {
      "id": "<workshop-uuid>",
      "title": "Flow Workshop",
      "deliveryMode": "online",
      "coverImageUrl": null
    },
    "attendees": [
      {
        "id": "<attendee-uuid-1>",
        "index": 1,
        "fullName": "Flow Attendee One",
        "professionalRole": "Nurse",
        "npiNumber": "1234567890",
        "email": "attendee1@example.com"
      },
      {
        "id": "<attendee-uuid-2>",
        "index": 2,
        "fullName": "Flow Attendee Two",
        "professionalRole": "Resident",
        "email": "attendee2@example.com"
      }
    ],
    "numberOfAttendees": 2,
    "pricing": {
      "totalPrice": "300.00"
    },
    "status": "pending"
  }
}
```

Frontend requirement:
- Keep attendee ids from this response; they are needed later in reservation API.

## Step 2: Optional summary refresh
Endpoint: GET /workshops/checkout/order-summary/:id
Auth: Bearer token required

Success response (200):
```json
{
  "message": "Order summary fetched successfully",
  "data": {
    "orderSummaryId": "<order-summary-uuid>",
    "status": "pending"
  }
}
```

## Step 3: Create payment session
Endpoint: POST /payments/checkout-session
Auth: Bearer token required

Request body:
```json
{
  "domainType": "workshop",
  "orderSummaryId": "<order-summary-uuid>",
  "successUrl": "http://localhost:5173/workshops/checkout/success?session_id={CHECKOUT_SESSION_ID}",
  "cancelUrl": "http://localhost:5173/workshops/checkout/cancel"
}
```

Success response (201):
```json
{
  "message": "Checkout session created successfully",
  "data": {
    "paymentId": "<payment-uuid>",
    "domainType": "workshop",
    "sessionId": "cs_test_...",
    "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_...",
    "workshop": {
      "id": "<workshop-uuid>",
      "title": "Flow Workshop"
    },
    "orderSummaryId": "<order-summary-uuid>",
    "numberOfAttendees": 2,
    "totalPrice": "300.00"
  }
}
```

Frontend action:
- Redirect user to data.checkoutUrl.

## Step 4: Stripe-hosted payment
- User pays on Stripe page.
- Stripe calls POST /payments/webhooks/stripe.
- Backend marks workshop payment as paid and marks order summary as completed.

Webhook response (200):
```json
{
  "received": true,
  "eventType": "checkout.session.completed"
}
```

## Step 5: Poll payment result
Endpoint: GET /payments/session-status/:sessionId
Auth: Bearer token required

Pending response:
```json
{
  "message": "Payment session status fetched successfully",
  "data": {
    "domainType": "workshop",
    "status": "pending",
    "finalizedRefId": null
  }
}
```

Paid response:
```json
{
  "message": "Payment session status fetched successfully",
  "data": {
    "domainType": "workshop",
    "status": "paid",
    "finalizedRefId": "<order-summary-uuid>"
  }
}
```

Meaning of finalizedRefId for workshop:
- This is the paid order summary id.

## Step 6: Final reservation creation (actual booking)
Endpoint: POST /workshops/reservations
Auth: Bearer token required

Request body:
```json
{
  "workshopId": "<workshop-uuid>",
  "attendeeIds": [
    "<attendee-uuid-1>",
    "<attendee-uuid-2>"
  ]
}
```

Success response (201):
```json
{
  "message": "Workshop booked successfully",
  "data": {
    "reservationId": "<reservation-uuid>",
    "workshopId": "<workshop-uuid>",
    "numberOfSeats": 2,
    "pricePerSeat": "150",
    "totalPrice": "300",
    "status": "confirmed",
    "availableSeatsRemaining": 48
  }
}
```

---

## Frontend implementation rules (must follow)

1. Use POST /payments/checkout-session for both product and workshop.
2. Do not call webhook from frontend. Stripe calls webhook.
3. After redirect back from Stripe, always poll GET /payments/session-status/:sessionId until final state.
4. For workshop, do not call /workshops/reservations before payment status is paid.
5. Use attendeeIds returned by order-summary response only.

