# Frontend Checkout Implementation Guide

This document is for frontend handoff.
It describes exactly what to build for product purchase and workshop reservation using the current backend APIs.

Updated: 2026-04-09

## 1. Scope

Frontend must implement two complete payment journeys:

1. Product checkout
2. Workshop (course) checkout and reservation

Both journeys use Stripe Checkout and backend webhook finalization.

## 2. Architecture Rules

1. Frontend never calls Stripe webhook endpoint.
2. Frontend always starts checkout by calling backend, then redirects to backend-provided `checkoutUrl`.
3. Payment is considered successful only when backend session status becomes `paid`.
4. For product flow, use persisted product order summary (`/payments/product/order-summary`) before checkout session.
5. For workshop flow, use workshop order summary (`/workshops/checkout/order-summary`) before checkout session.

## 3. Required Frontend Config

Use these frontend environment values:

- `VITE_API_BASE_URL` (or equivalent)
- Product success route: `/checkout/success`
- Product cancel route: `/checkout/cancel`
- Workshop success route: `/workshops/checkout/success`
- Workshop cancel route: `/workshops/checkout/cancel`

When calling backend checkout session, pass:

- Product success URL:
  `https://<frontend-domain>/checkout/success?session_id={CHECKOUT_SESSION_ID}`
- Product cancel URL:
  `https://<frontend-domain>/checkout/cancel`
- Workshop success URL:
  `https://<frontend-domain>/workshops/checkout/success?session_id={CHECKOUT_SESSION_ID}`
- Workshop cancel URL:
  `https://<frontend-domain>/workshops/checkout/cancel`

## 4. Auth

All checkout-related private endpoints require bearer token.

Header:

`Authorization: Bearer <accessToken>`

## 5. Product Checkout Flow (Production Grade)

## 5.1 Optional preview summary (public estimate)

Endpoint:
`POST /public/orders/summary`

Use for cart UI preview only.
Do not treat this as final payment source.

## 5.2 Load and save shipping address

- `GET /public/orders/shipping-address`
- `PATCH /public/orders/shipping-address`

Checkout will fail if shipping address is incomplete.

## 5.3 Create persisted product summary

Endpoint:
`POST /payments/product/order-summary`

Request:

```json
{
  "items": [
    { "productId": "<uuid>", "quantity": 2 }
  ]
}
```

Save from response:

- `data.orderSummaryId`
- optional `data.expiresAt`

## 5.4 Create checkout session using orderSummaryId

Endpoint:
`POST /payments/checkout-session`

Request:

```json
{
  "domainType": "product",
  "orderSummaryId": "<order-summary-id>",
  "successUrl": "https://<frontend-domain>/checkout/success?session_id={CHECKOUT_SESSION_ID}",
  "cancelUrl": "https://<frontend-domain>/checkout/cancel"
}
```

Save from response:

- `data.sessionId`
- `data.checkoutUrl`
- `data.paymentId`

Redirect browser to `data.checkoutUrl`.

## 5.5 On success page, poll payment status

From URL query param read `session_id`.

Endpoint:
`GET /payments/session-status/:sessionId`

Polling recommendation:

1. Poll every 2 seconds
2. Stop when `data.status === "paid"`
3. Timeout after 120 seconds and show "Payment processing" message with retry button

When status becomes `paid`, call:

`GET /public/orders/student/recent-product-order`

Render order summary from response.

## 5.6 Product flow failure handling

- `status === pending`: show loader / processing state
- `status === expired`: show "Session expired", allow restart checkout
- `400 Shipping address is required before checkout`: redirect user to shipping form
- `400 Order summary expired, create a new one`: regenerate summary then create session again

## 6. Workshop Checkout + Reservation Flow

## 6.1 Create workshop order summary

Endpoint:
`POST /workshops/checkout/order-summary`

Request:

```json
{
  "workshopId": "<workshop-id>",
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

Save from response:

- `data.orderSummaryId`
- each attendee `id` (store attendeeIds for reservation step)

## 6.2 Create workshop checkout session

Endpoint:
`POST /payments/checkout-session`

Request:

```json
{
  "domainType": "workshop",
  "orderSummaryId": "<workshop-order-summary-id>",
  "successUrl": "https://<frontend-domain>/workshops/checkout/success?session_id={CHECKOUT_SESSION_ID}",
  "cancelUrl": "https://<frontend-domain>/workshops/checkout/cancel"
}
```

Save:

- `data.sessionId`
- `data.checkoutUrl`

Redirect to Stripe `checkoutUrl`.

## 6.3 Poll session status on workshop success page

Endpoint:
`GET /payments/session-status/:sessionId`

Wait until `status === "paid"`.

## 6.4 Create final reservation (required)

After payment becomes paid, call:

`POST /workshops/reservations`

Request:

```json
{
  "workshopId": "<workshop-id>",
  "attendeeIds": ["<attendee-id-1>", "<attendee-id-2>"]
}
```

Success response contains `reservationId`.

## 6.5 Verify enrolled workshops screen

Endpoint:
`GET /workshops/student/enrolled-workshops`

Use this endpoint for student dashboard list.

## 7. Frontend State Contract

Recommended state per checkout attempt:

```ts
type CheckoutState = {
  domainType: 'product' | 'workshop';
  orderSummaryId: string;
  sessionId: string;
  paymentId?: string;
  status: 'idle' | 'creating' | 'redirected' | 'pending' | 'paid' | 'expired' | 'failed';
  createdAt: string;
};
```

Persist this in local storage/session storage so refresh on success page does not lose context.

## 8. Minimal Frontend Pseudocode

```ts
async function startProductCheckout(items) {
  await ensureShippingAddress();

  const summary = await api.post('/payments/product/order-summary', { items });
  const orderSummaryId = summary.data.orderSummaryId;

  const session = await api.post('/payments/checkout-session', {
    domainType: 'product',
    orderSummaryId,
    successUrl: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/checkout/cancel`,
  });

  window.location.href = session.data.checkoutUrl;
}

async function handleSuccessPage(sessionId) {
  const result = await pollSessionStatus(sessionId);
  if (result.status !== 'paid') return showPendingUi();
  const order = await api.get('/public/orders/student/recent-product-order');
  renderOrder(order.data);
}
```

## 9. Webhook Dependency (Important for FE)

If webhook is not configured/running:

- session status remains `pending`
- recent order remains empty
- workshop reservation cannot proceed

So FE must surface clear pending message:

"Payment completed on Stripe. Waiting for confirmation from payment gateway."

Include manual retry button for session-status polling.

## 10. Endpoint Quick List for Frontend Team

Product:

1. `POST /public/orders/summary` (optional preview)
2. `GET /public/orders/shipping-address`
3. `PATCH /public/orders/shipping-address`
4. `POST /payments/product/order-summary`
5. `POST /payments/checkout-session` (`domainType=product`)
6. `GET /payments/session-status/:sessionId`
7. `GET /public/orders/student/recent-product-order`

Workshop:

1. `POST /workshops/checkout/order-summary`
2. `GET /workshops/checkout/order-summary/:id` (optional)
3. `POST /payments/checkout-session` (`domainType=workshop`)
4. `GET /payments/session-status/:sessionId`
5. `POST /workshops/reservations`
6. `GET /workshops/student/enrolled-workshops`

## 11. Legacy Endpoints Notice

These exist but should not be used in new frontend implementation:

- `POST /public/orders/checkout/stripe-session` (legacy product checkout style)
- `POST /workshops/checkout/payment-verify` (workshop fallback when webhook delayed)

New implementation should use unified `/payments/checkout-session` with `domainType`.

## 12. QA Checklist for Frontend UAT

1. Product checkout creates paid order and appears in recent product order API.
2. Workshop checkout creates paid payment status and reservation succeeds.
3. Cancel page works without backend side effects.
4. Refreshing success page still resolves by `session_id` polling.
5. Pending state UI appears if webhook confirmation is delayed.
6. Expired session and expired summary recover by restarting checkout flow.
