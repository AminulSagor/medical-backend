# Payment + Checkout Full Flow (Workshop and Product)

This document answers:
- Where payment is currently implemented
- What is still missing for full payment completion
- Full API flow for workshop and product from order to successful purchase

## 1) Current Payment Implementation Status

## Product payment
Implemented now:
- Public summary calculation: POST /public/orders/summary
- Shipping address get/update: GET/PATCH /public/orders/shipping-address
- Stripe checkout session creation: POST /public/orders/checkout/stripe-session

Code locations:
- src/orders/public-orders.controller.ts
- src/orders/orders.service.ts

Missing for true "successfully bought" completion:
- Stripe webhook endpoint to confirm payment and persist final order row
- Public success endpoint to fetch final purchased order details by session/order id

## Workshop payment
Implemented now:
- Workshop order summary (pricing/attendees): POST /workshops/checkout/order-summary
- Get summary by id: GET /workshops/checkout/order-summary/:id
- Reservation confirmation: POST /workshops/reservations

Code locations:
- src/workshops/public-workshops.controller.ts
- src/workshops/workshops.service.ts

Missing for full payment flow:
- Workshop Stripe checkout session endpoint
- Workshop payment verification/finalization endpoint (usually webhook-driven)
- Reservation should be finalized after successful payment, not before

---

## 2) Product Full Flow (Order -> Checkout -> Payment -> Purchased)

## Step 1: Build cart summary (public)
Endpoint: POST /public/orders/summary
Auth: No

Request body:
```json
{
  "items": [
    {
      "productId": "6872d2ba-7958-4de7-b9cb-4f2c0eb57d8b",
      "quantity": 2
    },
    {
      "productId": "f2454d92-0589-42e5-95e6-7a321be8e65f",
      "quantity": 1
    }
  ],
  "currency": "usd"
}
```

Success response:
```json
{
  "message": "Order summary calculated successfully",
  "data": {
    "items": [
      {
        "productId": "6872d2ba-7958-4de7-b9cb-4f2c0eb57d8b",
        "name": "Portable Airway Trainer",
        "sku": "AT-9000",
        "photo": "https://cdn.example.com/products/airway-trainer-1.jpg",
        "quantity": 2,
        "unitPrice": "899.00",
        "lineTotal": "1798.00"
      }
    ],
    "subtotal": "1897.00",
    "estimatedShipping": "15.00",
    "estimatedTax": "189.70",
    "orderTotal": "2101.70"
  }
}
```

Common errors:
- 400 At least one cart item is required
- 400 Some products are invalid or inactive

## Step 2: Check authentication before checkout
Frontend behavior:
- If user has no JWT: redirect to login
- If user has JWT: continue to shipping step

## Step 3: Get saved shipping address
Endpoint: GET /public/orders/shipping-address
Auth: JWT required

Success response:
```json
{
  "message": "Shipping address fetched successfully",
  "data": {
    "fullName": "Dr. Sarah Hall",
    "addressLine1": "100 Main St",
    "addressLine2": "Suite 201",
    "city": "Houston",
    "state": "TX",
    "zipCode": "77001",
    "country": "US",
    "isComplete": true
  }
}
```

## Step 4: Update shipping address (if needed)
Endpoint: PATCH /public/orders/shipping-address
Auth: JWT required

Request body:
```json
{
  "fullName": "Dr. Sarah Hall",
  "addressLine1": "100 Main St",
  "addressLine2": "Suite 201",
  "city": "Houston",
  "state": "TX",
  "zipCode": "77001",
  "country": "US"
}
```

Success response:
```json
{
  "message": "Shipping address updated successfully",
  "data": {
    "fullName": "Dr. Sarah Hall",
    "addressLine1": "100 Main St",
    "addressLine2": "Suite 201",
    "city": "Houston",
    "state": "TX",
    "zipCode": "77001",
    "country": "US",
    "isComplete": true
  }
}
```

## Step 5: Create Stripe checkout session
Endpoint: POST /public/orders/checkout/stripe-session
Auth: JWT required

Request body (saved shipping):
```json
{
  "items": [
    {
      "productId": "6872d2ba-7958-4de7-b9cb-4f2c0eb57d8b",
      "quantity": 2
    }
  ],
  "successUrl": "http://localhost:5173/checkout/success?session_id={CHECKOUT_SESSION_ID}",
  "cancelUrl": "http://localhost:5173/checkout/cancel"
}
```

Success response:
```json
{
  "message": "Stripe checkout session created successfully",
  "data": {
    "sessionId": "cs_test_xxx",
    "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_xxx",
    "shippingAddress": {
      "fullName": "Dr. Sarah Hall",
      "addressLine1": "100 Main St",
      "addressLine2": "Suite 201",
      "city": "Houston",
      "state": "TX",
      "zipCode": "77001",
      "country": "US"
    },
    "orderSummary": {
      "subtotal": "1798.00",
      "estimatedShipping": "0.00",
      "estimatedTax": "179.80",
      "orderTotal": "1977.80"
    }
  }
}
```

Frontend behavior:
- Redirect browser to data.checkoutUrl

## Step 6: Payment success finalization (required for complete purchase)
This part is not implemented yet in current code and is required for "successfully bought".

Recommended endpoint:
- POST /payments/stripe/webhook

Recommended webhook logic:
1. Verify Stripe signature using endpoint secret
2. Handle checkout.session.completed event
3. Create orders row with:
   - type = product
   - paymentStatus = paid
   - fulfillmentStatus = unfulfilled
   - customer + shipping snapshot
   - order items + totals
4. Create timeline events:
   - order_placed
   - payment_authorized
5. Save mapping between stripe session id and created order id

Recommended webhook success response:
```json
{
  "received": true
}
```

## Step 7: Checkout success page fetch
Recommended endpoint:
- GET /public/orders/checkout/success?sessionId=cs_test_xxx

Recommended success response:
```json
{
  "message": "Purchase completed successfully",
  "data": {
    "orderId": "ORD-100045",
    "paymentStatus": "paid",
    "fulfillmentStatus": "unfulfilled",
    "grandTotal": "1977.80"
  }
}
```

---

## 3) Workshop Full Flow (Order -> Checkout -> Payment -> Booked)

## Step 1: Create workshop order summary
Endpoint: POST /workshops/checkout/order-summary
Auth: JWT required

Request body:
```json
{
  "workshopId": "9f6bc4f5-e8c2-4f9d-97f2-6e6a946b0f0d",
  "attendees": [
    {
      "fullName": "Dr. Sarah Hall",
      "professionalRole": "Anesthesiologist",
      "email": "sarah@example.com"
    },
    {
      "fullName": "Dr. Omar Nabil",
      "professionalRole": "Pulmonologist",
      "email": "omar@example.com"
    }
  ]
}
```

Success response:
```json
{
  "message": "Order summary created successfully",
  "data": {
    "orderSummaryId": "7488ca14-6071-45b8-bd97-b4e78ff2776f",
    "numberOfAttendees": 2,
    "pricing": {
      "standardPricePerSeat": "399.00",
      "appliedPricePerSeat": "399.00",
      "discountApplied": false,
      "totalPrice": "798.00"
    }
  }
}
```

## Step 2: (Recommended) Create workshop Stripe checkout session
Not implemented yet and required for full payment flow.

Recommended endpoint:
- POST /workshops/checkout/payment-session

Recommended request body:
```json
{
  "orderSummaryId": "7488ca14-6071-45b8-bd97-b4e78ff2776f",
  "successUrl": "http://localhost:5173/workshops/checkout/success?session_id={CHECKOUT_SESSION_ID}",
  "cancelUrl": "http://localhost:5173/workshops/checkout/cancel"
}
```

Recommended success response:
```json
{
  "message": "Workshop checkout session created successfully",
  "data": {
    "sessionId": "cs_test_workshop_xxx",
    "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_workshop_xxx",
    "orderSummaryId": "7488ca14-6071-45b8-bd97-b4e78ff2776f",
    "totalAmount": "798.00"
  }
}
```

## Step 3: Stripe payment success finalization (required)
Recommended webhook:
- POST /payments/stripe/webhook

Recommended workshop webhook logic:
1. Verify event signature
2. For workshop session completed:
   - mark workshop order summary as completed/paid
   - create reservation with status confirmed
   - lock attendee seats
3. Save mapping stripe session id <-> reservation id

## Step 4: Booking success fetch
Recommended endpoint:
- GET /workshops/checkout/success?sessionId=cs_test_workshop_xxx

Recommended success response:
```json
{
  "message": "Workshop booked and paid successfully",
  "data": {
    "reservationId": "26e967d4-d449-4b46-b0f6-6187ed2ab66d",
    "workshopId": "9f6bc4f5-e8c2-4f9d-97f2-6e6a946b0f0d",
    "paymentStatus": "paid",
    "reservationStatus": "confirmed",
    "totalPrice": "798.00"
  }
}
```

---

## 4) API Matrix (Implemented vs Needed)

Product checkout:
- Implemented: POST /public/orders/summary
- Implemented: GET /public/orders/shipping-address
- Implemented: PATCH /public/orders/shipping-address
- Implemented: POST /public/orders/checkout/stripe-session
- Needed: POST /payments/stripe/webhook
- Needed: GET /public/orders/checkout/success

Workshop checkout:
- Implemented: POST /workshops/checkout/order-summary
- Implemented: GET /workshops/checkout/order-summary/:id
- Implemented: POST /workshops/reservations
- Needed: POST /workshops/checkout/payment-session
- Needed: POST /payments/stripe/webhook (workshop branch)
- Needed: GET /workshops/checkout/success

---

## 5) Recommended State Transitions

Product order:
- pending_payment -> paid -> unfulfilled -> processing -> shipped -> received -> closed

Workshop order/booking:
- summary_pending -> payment_initiated -> paid -> reservation_confirmed

---

## 6) What to implement next (priority)

1. Add Stripe webhook endpoint with signature verification.
2. Persist successful product payment into orders + order_items + timeline.
3. Add public success endpoint for product checkout confirmation.
4. Add workshop payment-session endpoint from workshop orderSummary.
5. Finalize workshop reservation only after successful payment event.
6. Add workshop checkout success endpoint returning final reservation + payment status.
