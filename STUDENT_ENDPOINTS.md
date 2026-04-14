# Logged IN View
# Module 1 , 2[ Dashboard , Order History ]
# Module 3 My Course

This document defines the student-facing endpoints added for:
- enrolled workshops
- recent product order summary
- order history summary cards
- past orders listing
- past order full details
- order breakdown by order number
- my course dashboard summary
- my course filtered listing (active/confirmed/completed/browse)

Updated on: 2026-04-14

## Base URL
- Local: `http://localhost:3000`
- Production: use your deployed API host

## Authentication
Both endpoints require JWT bearer auth.

Header:
```
Authorization: Bearer <access_token>
```

If auth is missing or invalid, API returns `401`.

Global error shape used by backend:
```json
{
  "statusCode": 401,
  "path": "/requested/path",
  "message": "Unauthorized"
}
```

---

## Course Lifecycle (Current Backend Flow)

This section documents the actual course/workshop flow as currently implemented.

### A) Purchase and registration flow
1. Student creates workshop order summary:
  - `POST /workshops/checkout/order-summary`
  - creates/updates a `pending` workshop order summary with attendees and pricing.
2. Student creates checkout session:
  - `POST /payments/checkout-session` with `domainType=workshop` and `orderSummaryId`.
3. Stripe completes payment and triggers webhook:
  - `POST /payments/webhooks/stripe` (called by Stripe, not frontend).
  - backend marks payment transaction as `paid`.
  - backend marks workshop order summary status as `completed`.
4. Student finalizes reservation:
  - `POST /workshops/reservations`
  - creates reservation with status `confirmed`.
  - consumed paid summary is then moved to `expired` to prevent duplicate reuse.

### B) Course progress states
Course progress for frontend uses only two statuses:
- `confirmed`: The course is registered and not all days are completed (shown as "Registration Confirmed").
- `completed`: All scheduled days are completed (shown as "Completed").

Status label mapping in course list/start responses:
- `confirmed` → `Registration Confirmed`
- `completed` → `Completed`

**Note:**
- Only `confirmed` and `completed` are ever returned as course statuses. There is no `in_progress` or similar status exposed externally.
- "Registration Confirmed" is the default user-facing label until the course completes.
- Course progression auto-flows by schedule date; calling the start endpoint is optional and not required for status progression.

### C) Day status logic (current)
Day statuses returned in `days.data[].status` are currently:
- `current`: day date equals today.
- `completed`: day date is before today.
- `upcoming`: day date is after today.

Important:
- Segment/session level in detailed endpoint still includes `isCurrent` where applicable.

### D) Course completion rule
Course becomes `completed` when either:
- total completed days reach total scheduled days, or
- tracking status is already marked completed.

In date terms:
- a day is counted as completed only after it has passed (before today).
- when all days have passed, course becomes `completed`.

When completed:
- `completedAt` is saved if not already present.
- CME awarded flags are updated when workshop offers CME.

---

## Frontend Contract: Full Course Flow (Do Not Skip Steps)

This is the complete flow the frontend should implement for workshop/course purchase to completion tracking.

### Step 1: Create workshop order summary

- Method: `POST`
- Path: `/workshops/checkout/order-summary`
- Auth: Required

Request body:
```json
{
  "workshopId": "4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d",
  "attendees": [
    {
      "fullName": "Alex Carter",
      "professionalRole": "Nurse",
      "npiNumber": "1234567890",
      "email": "alex@example.com"
    },
    {
      "fullName": "Maya Lin",
      "professionalRole": "Resident",
      "email": "maya@example.com"
    }
  ]
}
```

Success response (201):
```json
{
  "message": "Order summary created successfully",
  "data": {
    "orderSummaryId": "7f6e4c71-b89f-4bd7-a8e4-96a0f4470f5f",
    "workshop": {
      "id": "4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d",
      "title": "Advanced Airway Management",
      "deliveryMode": "online",
      "coverImageUrl": "https://cdn.example.com/workshops/airway.jpg"
    },
    "attendees": [
      {
        "id": "2e29f848-7d2f-4354-8a5e-82f5f9c8c6fd",
        "index": 1,
        "fullName": "Alex Carter",
        "professionalRole": "Nurse",
        "npiNumber": "1234567890",
        "email": "alex@example.com"
      },
      {
        "id": "f337483b-6dfa-4a8f-b788-65a9de7b8a15",
        "index": 2,
        "fullName": "Maya Lin",
        "professionalRole": "Resident",
        "npiNumber": null,
        "email": "maya@example.com"
      }
    ],
    "numberOfAttendees": 2,
    "availableSeats": 18,
    "pricing": {
      "standardPricePerSeat": "149.00",
      "appliedPricePerSeat": "149.00",
      "discountApplied": false,
      "discountInfo": null,
      "subtotal": "298.00",
      "tax": "0.00",
      "totalPrice": "298.00"
    },
    "createdAt": "2026-04-14T10:00:00.000Z"
  }
}
```

Note:
- If user already has a pending summary for the same workshop, backend may return `Order summary updated successfully` with the same response shape.

Common error responses:
```json
{
  "statusCode": 400,
  "path": "/workshops/checkout/order-summary",
  "message": "At least one attendee is required"
}
```
```json
{
  "statusCode": 404,
  "path": "/workshops/checkout/order-summary",
  "message": "Workshop not found or not available for booking"
}
```

### Step 2: Create payment checkout session

- Method: `POST`
- Path: `/payments/checkout-session`
- Auth: Required

Request body:
```json
{
  "domainType": "workshop",
  "orderSummaryId": "7f6e4c71-b89f-4bd7-a8e4-96a0f4470f5f",
  "successUrl": "http://localhost:5173/checkout/success?session_id={CHECKOUT_SESSION_ID}",
  "cancelUrl": "http://localhost:5173/checkout/cancel"
}
```

Success response (201):
```json
{
  "message": "Checkout session created successfully",
  "data": {
    "paymentId": "0bd5f2dc-c842-4c31-9261-7f6a7ce39d21",
    "domainType": "workshop",
    "sessionId": "cs_test_a1b2c3d4",
    "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4",
    "workshop": {
      "id": "4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d",
      "title": "Advanced Airway Management"
    },
    "orderSummaryId": "7f6e4c71-b89f-4bd7-a8e4-96a0f4470f5f",
    "numberOfAttendees": 2,
    "totalPrice": "298.00"
  }
}
```

Common error responses:
```json
{
  "statusCode": 400,
  "path": "/payments/checkout-session",
  "message": "orderSummaryId is required for workshop checkout sessions"
}
```
```json
{
  "statusCode": 404,
  "path": "/payments/checkout-session",
  "message": "Order summary not found"
}
```

Frontend action:
- Redirect user to `data.checkoutUrl`.

### Step 3: Poll payment status after redirect

- Method: `GET`
- Path: `/payments/session-status/:sessionId`
- Auth: Required

Pending response (200):
```json
{
  "message": "Payment session status fetched successfully",
  "data": {
    "paymentId": "0bd5f2dc-c842-4c31-9261-7f6a7ce39d21",
    "domainType": "workshop",
    "domainRefId": "7f6e4c71-b89f-4bd7-a8e4-96a0f4470f5f",
    "status": "pending",
    "amount": "298.00",
    "currency": "usd",
    "providerSessionId": "cs_test_a1b2c3d4",
    "finalizedRefId": null,
    "paidAt": null,
    "updatedAt": "2026-04-14T10:02:00.000Z"
  }
}
```

Paid response (200):
```json
{
  "message": "Payment session status fetched successfully",
  "data": {
    "paymentId": "0bd5f2dc-c842-4c31-9261-7f6a7ce39d21",
    "domainType": "workshop",
    "domainRefId": "7f6e4c71-b89f-4bd7-a8e4-96a0f4470f5f",
    "status": "paid",
    "amount": "298.00",
    "currency": "usd",
    "providerSessionId": "cs_test_a1b2c3d4",
    "finalizedRefId": "7f6e4c71-b89f-4bd7-a8e4-96a0f4470f5f",
    "paidAt": "2026-04-14T10:05:00.000Z",
    "updatedAt": "2026-04-14T10:05:00.000Z"
  }
}
```

Common error response:
```json
{
  "statusCode": 404,
  "path": "/payments/session-status/cs_test_invalid",
  "message": "Payment session not found"
}
```

Important:
- Frontend must not call webhook endpoint directly.
- Stripe calls `/payments/webhooks/stripe`.

### Step 4: Create reservation (final enrollment)

- Method: `POST`
- Path: `/workshops/reservations`
- Auth: Required

Request body:
```json
{
  "workshopId": "4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d",
  "attendeeIds": [
    "2e29f848-7d2f-4354-8a5e-82f5f9c8c6fd",
    "f337483b-6dfa-4a8f-b788-65a9de7b8a15"
  ]
}
```

Success response (201):
```json
{
  "message": "Workshop booked successfully",
  "data": {
    "reservationId": "9f9c6db4-a0c2-4306-a9f2-9f45f034952a",
    "workshopId": "4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d",
    "numberOfSeats": 2,
    "pricePerSeat": "149.00",
    "totalPrice": "298.00",
    "status": "confirmed",
    "attendees": [
      {
        "id": "91f52b0e-6439-4f57-9e95-7d5f9b98ed2a",
        "fullName": "Alex Carter",
        "professionalRole": "Nurse",
        "npiNumber": "1234567890",
        "email": "alex@example.com"
      },
      {
        "id": "8a88a89a-3fba-4a6c-bef2-c68d2b9d07e6",
        "fullName": "Maya Lin",
        "professionalRole": "Resident",
        "npiNumber": null,
        "email": "maya@example.com"
      }
    ],
    "availableSeatsRemaining": 16,
    "createdAt": "2026-04-14T10:06:30.000Z"
  }
}
```

Common error responses:
```json
{
  "statusCode": 400,
  "path": "/workshops/reservations",
  "message": "Invalid attendee IDs, payment not verified, or attendees do not belong to your paid order summary"
}
```
```json
{
  "statusCode": 400,
  "path": "/workshops/reservations",
  "message": "Only 0 seats available. You are trying to book 2 seats."
}
```

### Step 5: Read course progress from student endpoints

Use these endpoints after booking:
- `GET /workshops/student/my-courses`
- `GET /workshops/private/my-courses/:courseId`

Response wrapper note:
- `/workshops/student/my-courses` returns `{ message, data, meta }`.
- `/workshops/private/my-courses/:courseId` returns the details object directly (no `message` wrapper).

Status/label/day rules for frontend rendering:
- `status` values: `confirmed`, `completed`
- `statusLabel`: `Registration Confirmed` for `confirmed`, `Completed` for `completed`
- `days.data[].status`: `current`, `completed`, `upcoming`
- when all days are completed -> course status becomes `completed`

---


## 1) Get Student Enrolled Workshops

### Endpoint
- Method: `GET`
- Path: `/workshops/student/enrolled-workshops`
- Auth: Required
- Request body: None

### Request variants

#### Variant A: Valid token (student has enrolled workshops)
```bash
curl --location 'http://localhost:3000/workshops/student/enrolled-workshops' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant B: Valid token (student has no enrolled workshops)
```bash
curl --location 'http://localhost:3000/workshops/student/enrolled-workshops' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant C: Missing token
```bash
curl --location 'http://localhost:3000/workshops/student/enrolled-workshops'
```

### Success response (200) - with data
```json
{
  "message": "Enrolled workshops fetched successfully",
  "data": [
    {
      "workshopId": "4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d",
      "title": "Advanced Airway Management",
      "deliveryMode": "online",
      "workshopPhoto": "https://cdn.example.com/workshops/airway.jpg",
      "isEnrolled": true,
      "enrollmentSource": "reservation",
      "enrolledAt": "2026-04-08T06:20:32.115Z",
      "reservation": {
        "reservationId": "9f9c6db4-a0c2-4306-a9f2-9f45f034952a",
        "status": "confirmed",
        "numberOfSeats": 2,
        "pricePerSeat": "149.00",
        "totalPrice": "298.00"
      },
      "startDate": "2026-04-20T00:00:00.000Z",
      "endDate": "2026-04-22T00:00:00.000Z"
    },
    {
      "workshopId": "ae636f95-5f00-4c3b-a5a4-6df729fe1a26",
      "title": "Critical Care Simulation Bootcamp",
      "deliveryMode": "in_person",
      "workshopPhoto": null,
      "isEnrolled": true,
      "enrollmentSource": "enrollment",
      "enrolledAt": "2026-04-07T14:11:59.217Z",
      "reservation": null,
      "startDate": "2026-05-01T00:00:00.000Z",
      "endDate": "2026-05-03T00:00:00.000Z"
    }
  ]
}
```

### Success response (200) - no data
```json
{
  "message": "Enrolled workshops fetched successfully",
  "data": []
}
```

### Error response (401) - unauthorized
```json
{
  "statusCode": 401,
  "path": "/workshops/student/enrolled-workshops",
  "message": "Unauthorized"
}
```

---

## 2) Get Student Recent Product Order

### Endpoint
- Method: `GET`
- Path: `/public/orders/student/recent-product-order`
- Auth: Required
- Request body: None

### Request variants

#### Variant A: Valid token (student has recent product order)
```bash
curl --location 'http://localhost:3000/public/orders/student/recent-product-order' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant B: Valid token (student has no product order yet)
```bash
curl --location 'http://localhost:3000/public/orders/student/recent-product-order' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant C: Missing token
```bash
curl --location 'http://localhost:3000/public/orders/student/recent-product-order'
```

### Success response (200) - with data
```json
{
  "message": "Recent product order fetched successfully",
  "data": {
    "orderId": "ORD-8824",
    "orderedAt": "2026-04-08T10:05:40.000Z",
    "orderedAtFullDate": "2026-04-08T10:05:40.000Z",
    "price": "232.80",
    "shippingStatus": "processing",
    "fulfillmentStatus": "unfulfilled",
    "paymentStatus": "paid",
    "productName": "Fiberoptic Intubation Kit",
    "productImage": "https://cdn.example.com/products/fiberoptic-kit.jpg",
    "products": [
      {
        "productId": "25535f1a-916e-4694-a0f8-41cc4cb95a8e",
        "productName": "Fiberoptic Intubation Kit",
        "productImage": "https://cdn.example.com/products/fiberoptic-kit.jpg",
        "quantity": 1,
        "unitPrice": "199.00",
        "lineTotal": "199.00"
      },
      {
        "productId": "7dbe7f4d-f898-44ca-a558-b5a98d50f4d7",
        "productName": "Video Laryngoscope Blade Set",
        "productImage": "https://cdn.example.com/products/blade-set.jpg",
        "quantity": 1,
        "unitPrice": "33.80",
        "lineTotal": "33.80"
      }
    ]
  }
}
```

### Success response (200) - no data
```json
{
  "message": "No recent product order found",
  "data": null
}
```

### Error response (401) - unauthorized
```json
{
  "statusCode": 401,
  "path": "/public/orders/student/recent-product-order",
  "message": "Unauthorized"
}
```

### Error response (404) - user not found
```json
{
  "statusCode": 404,
  "path": "/public/orders/student/recent-product-order",
  "message": "User not found"
}
```

---

## Shipping Status Mapping

For frontend label rendering, backend normalizes shipping status as:

- `unfulfilled` -> `processing`
- `processing` -> `processing`
- `shipped` -> `shipped`
- `received` -> `delivered`
- `closed` -> `delivered`

Use `shippingStatus` for UI badges and `fulfillmentStatus` for detailed logic.

---

## 3) Get Order History Summary Cards

### Endpoint
- Method: `GET`
- Path: `/public/orders/history/summary`
- Auth: Required
- Request body: None

### Request variants

#### Variant A: Valid token (student has order history)
```bash
curl --location 'http://localhost:3000/public/orders/history/summary' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant B: Valid token (student has no product order yet)
```bash
curl --location 'http://localhost:3000/public/orders/history/summary' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant C: Missing token
```bash
curl --location 'http://localhost:3000/public/orders/history/summary'
```

### Success response (200) - with order data
```json
{
  "message": "Order history summary fetched successfully",
  "data": {
    "activeDeliveries": 2,
    "orderedThisMonth": 4,
    "orderedValueThisMonth": 684.35,
    "totalMoney": 3942.8,
    "totalOrderedValueThisYear": 2138.5,
    "comparisonMetrics": {
      "orderedThisMonthVsLastMonth": {
        "current": 4,
        "previous": 3,
        "changePercentage": 33.33,
        "trend": "increase",
        "comparisonText": "increase 33.33% vs last month"
      },
      "orderedValueThisMonthVsLastMonth": {
        "current": 684.35,
        "previous": 611.02,
        "changePercentage": 12,
        "trend": "increase",
        "comparisonText": "increase 12% vs last month"
      },
      "totalOrderedValueThisYearVsLastYear": {
        "current": 2138.5,
        "previous": 2416.52,
        "changePercentage": -11.51,
        "trend": "decrease",
        "comparisonText": "decrease 11.51% vs last year"
      }
    }
  }
}
```

### Success response (200) - no order data
```json
{
  "message": "Order history summary fetched successfully",
  "data": {
    "activeDeliveries": 0,
    "orderedThisMonth": 0,
    "orderedValueThisMonth": 0,
    "totalMoney": 0,
    "totalOrderedValueThisYear": 0,
    "comparisonMetrics": {
      "orderedThisMonthVsLastMonth": {
        "current": 0,
        "previous": 0,
        "changePercentage": 0,
        "trend": "no_change",
        "comparisonText": "no change vs last month"
      },
      "orderedValueThisMonthVsLastMonth": {
        "current": 0,
        "previous": 0,
        "changePercentage": 0,
        "trend": "no_change",
        "comparisonText": "no change vs last month"
      },
      "totalOrderedValueThisYearVsLastYear": {
        "current": 0,
        "previous": 0,
        "changePercentage": 0,
        "trend": "no_change",
        "comparisonText": "no change vs last year"
      }
    }
  }
}
```

### Comparison metrics notes
- `orderedThisMonthVsLastMonth`: compares monthly order count to previous month.
- `orderedValueThisMonthVsLastMonth`: compares monthly order value to previous month.
- `totalOrderedValueThisYearVsLastYear`: compares this year order value to previous year.
- `trend` values: `increase`, `decrease`, `no_change`.
- `comparisonText` is a UI-ready label such as "increase 12% vs last month".

### Error response (401) - unauthorized
```json
{
  "statusCode": 401,
  "path": "/public/orders/history/summary",
  "message": "Unauthorized"
}
```

### Error response (404) - user not found
```json
{
  "statusCode": 404,
  "path": "/public/orders/history/summary",
  "message": "User not found"
}
```

---

## 4) Get Past Orders List (Filter + Search)

### Endpoint
- Method: `GET`
- Path: `/public/orders/history`
- Auth: Required
- Request body: None

### Query params
- `page` (optional, number, default `1`, min `1`)
- `limit` (optional, number, default `10`, min `1`, max `100`)
- `monthsBack` (optional, number, min `1`, max `60`)
  - Example: `monthsBack=6` -> only orders from the last 6 months.
- `fulfillmentStatus` (optional, enum)
  - Allowed: `unfulfilled`, `processing`, `shipped`, `received`, `closed`
- `paymentStatus` (optional, enum)
  - Allowed: `pending`, `paid`, `refunded`, `failed`
- `search` (optional, string)
  - Searches by `orderNumber`, item `productName`, item `sku`.

### Request variants

#### Variant A: Valid token (all past orders, paginated)
```bash
curl --location 'http://localhost:3000/public/orders/history?page=1&limit=10' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant B: Valid token (filter by past months + rider/order status)
```bash
curl --location 'http://localhost:3000/public/orders/history?monthsBack=3&fulfillmentStatus=shipped&paymentStatus=paid&page=1&limit=20' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant C: Valid token (search by name / sku / order number)
```bash
curl --location 'http://localhost:3000/public/orders/history?search=laryngoscope' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant D: Missing token
```bash
curl --location 'http://localhost:3000/public/orders/history?page=1&limit=10'
```

#### Variant E: Invalid query enum
```bash
curl --location 'http://localhost:3000/public/orders/history?fulfillmentStatus=delivering' \
  --header 'Authorization: Bearer <access_token>'
```

### Success response (200) - with data
```json
{
  "message": "Past orders fetched successfully",
  "data": {
    "items": [
      {
        "id": "7bb4d5fc-c412-465f-bb59-17ef8ba8498d",
        "orderId": "ORD-1024",
        "orderedDate": "2026-04-09T07:12:44.000Z",
        "status": {
          "paymentStatus": "paid",
          "fulfillmentStatus": "shipped"
        },
        "quantity": 3,
        "totals": {
          "subtotal": 245.5,
          "shipping": 15,
          "tax": 24.55,
          "grandTotal": 285.05
        },
        "itemDetails": [
          {
            "id": "3fbb5da8-f6fe-4f8d-b378-f3ad8abfbe5f",
            "productId": "25535f1a-916e-4694-a0f8-41cc4cb95a8e",
            "name": "Fiberoptic Intubation Kit",
            "sku": "FLOW-SKU-123",
            "image": "https://cdn.example.com/products/fiberoptic-kit.jpg",
            "quantity": 1,
            "unitPrice": 199,
            "lineTotal": 199
          },
          {
            "id": "f161f75e-5534-4a30-9a31-87b07f7c2bf7",
            "productId": "7dbe7f4d-f898-44ca-a558-b5a98d50f4d7",
            "name": "Video Laryngoscope Blade Set",
            "sku": "VLS-BLADE-02",
            "image": "https://cdn.example.com/products/blade-set.jpg",
            "quantity": 2,
            "unitPrice": 23.25,
            "lineTotal": 46.5
          }
        ]
      }
    ],
    "meta": {
      "page": 1,
      "limit": 10,
      "total": 17,
      "totalPages": 2
    }
  }
}
```

### Success response (200) - empty list
```json
{
  "message": "Past orders fetched successfully",
  "data": {
    "items": [],
    "meta": {
      "page": 1,
      "limit": 10,
      "total": 0,
      "totalPages": 0
    }
  }
}
```

### Error response (400) - invalid query
```json
{
  "statusCode": 400,
  "path": "/public/orders/history?fulfillmentStatus=delivering",
  "message": [
    "fulfillmentStatus must be one of the following values: unfulfilled, processing, shipped, received, closed"
  ]
}
```

### Error response (401) - unauthorized
```json
{
  "statusCode": 401,
  "path": "/public/orders/history",
  "message": "Unauthorized"
}
```

### Error response (404) - user not found
```json
{
  "statusCode": 404,
  "path": "/public/orders/history",
  "message": "User not found"
}
```

---

## 5) Get One Past Order Full Details

### Endpoint
- Method: `GET`
- Path: `/public/orders/history/:id`
- Auth: Required
- Request body: None

`id` can be either:
- internal order UUID, or
- public order number (example: `ORD-1024`)

### Request variants

#### Variant A: Valid token + valid UUID
```bash
curl --location 'http://localhost:3000/public/orders/history/7bb4d5fc-c412-465f-bb59-17ef8ba8498d' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant B: Valid token + order number
```bash
curl --location 'http://localhost:3000/public/orders/history/ORD-1024' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant C: Missing token
```bash
curl --location 'http://localhost:3000/public/orders/history/ORD-1024'
```

#### Variant D: Order not found (or not owned by token user)
```bash
curl --location 'http://localhost:3000/public/orders/history/ORD-DOES-NOT-EXIST' \
  --header 'Authorization: Bearer <access_token>'
```

### Success response (200)
```json
{
  "message": "Order details fetched successfully",
  "data": {
    "id": "7bb4d5fc-c412-465f-bb59-17ef8ba8498d",
    "orderId": "ORD-1024",
    "orderedDate": "2026-04-09T07:12:44.000Z",
    "status": {
      "paymentStatus": "paid",
      "fulfillmentStatus": "shipped"
    },
    "quantity": 3,
    "totals": {
      "subtotal": 245.5,
      "shipping": 15,
      "tax": 24.55,
      "grandTotal": 285.05
    },
    "itemDetails": [
      {
        "id": "3fbb5da8-f6fe-4f8d-b378-f3ad8abfbe5f",
        "productId": "25535f1a-916e-4694-a0f8-41cc4cb95a8e",
        "name": "Fiberoptic Intubation Kit",
        "sku": "FLOW-SKU-123",
        "image": "https://cdn.example.com/products/fiberoptic-kit.jpg",
        "quantity": 1,
        "unitPrice": 199,
        "lineTotal": 199
      }
    ],
    "shippingAddress": {
      "company": null,
      "attention": "Dr. Alex Adams",
      "addressLine1": "1200 Medical Center Blvd",
      "addressLine2": "Suite 301",
      "city": "Houston",
      "state": "TX",
      "postalCode": "77030",
      "country": "US"
    },
    "dispatch": {
      "carrier": "FedEx",
      "trackingNumber": "TRK1024US",
      "estimatedDeliveryDate": "2026-04-12T00:00:00.000Z",
      "shippingNotes": "Leave at front desk"
    },
    "timeline": [
      {
        "id": "2a2f5758-2d3c-4e89-a76f-19a5e71f8021",
        "type": "order_shipped",
        "title": "Order Shipped",
        "description": "Tracking number: TRK1024US",
        "createdAt": "2026-04-10T08:10:00.000Z"
      },
      {
        "id": "bdf87f4a-336a-4891-a37f-6c95ad25fa6a",
        "type": "processing_started",
        "title": "Order Processing Started",
        "description": null,
        "createdAt": "2026-04-09T09:00:00.000Z"
      }
    ]
  }
}
```

### Error response (401) - unauthorized
```json
{
  "statusCode": 401,
  "path": "/public/orders/history/ORD-1024",
  "message": "Unauthorized"
}
```

### Error response (404) - order not found
```json
{
  "statusCode": 404,
  "path": "/public/orders/history/ORD-DOES-NOT-EXIST",
  "message": "Order not found"
}
```

### Error response (404) - user not found
```json
{
  "statusCode": 404,
  "path": "/public/orders/history/ORD-1024",
  "message": "User not found"
}
```

---

## 6) Get Order Breakdown By Order Number

### Endpoint
- Method: `GET`
- Path: `/public/orders/history/breakdown/:orderNumber`
- Auth: Required
- Request body: None

This endpoint is designed for order tracking/breakdown card screens.

### Order number format notes
- Preferred path param format: `ORD-8829`
- Also supported: encoded hash format `%23ORD-8829` (equivalent to `#ORD-8829`)
- Raw `#ORD-8829` should not be used directly in URL because `#` is treated as fragment by browsers.

### Request variants

#### Variant A: Valid token + plain order number
```bash
curl --location 'http://localhost:3000/public/orders/history/breakdown/ORD-8829' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant B: Valid token + hash order number (URL-encoded)
```bash
curl --location 'http://localhost:3000/public/orders/history/breakdown/%23ORD-8829' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant C: Missing token
```bash
curl --location 'http://localhost:3000/public/orders/history/breakdown/ORD-8829'
```

#### Variant D: Order not found (or not owned by token user)
```bash
curl --location 'http://localhost:3000/public/orders/history/breakdown/ORD-DOES-NOT-EXIST' \
  --header 'Authorization: Bearer <access_token>'
```

### Success response (200)
```json
{
  "message": "Order breakdown fetched successfully",
  "data": {
    "orderId": "#ORD-8829",
    "orderedDate": "2026-04-09T10:05:40.000Z",
    "status": {
      "paymentStatus": "paid",
      "fulfillmentStatus": "processing",
      "currentStep": {
        "status": "processing",
        "label": "Processing"
      },
      "nextStep": {
        "status": "shipped",
        "label": "Shipped"
      },
      "nextSteps": [
        {
          "status": "shipped",
          "label": "Shipped"
        },
        {
          "status": "received",
          "label": "Delivered"
        }
      ],
      "allSteps": [
        {
          "status": "unfulfilled",
          "label": "Order Placed",
          "state": "completed"
        },
        {
          "status": "processing",
          "label": "Processing",
          "state": "current"
        },
        {
          "status": "shipped",
          "label": "Shipped",
          "state": "upcoming"
        },
        {
          "status": "received",
          "label": "Delivered",
          "state": "upcoming"
        }
      ]
    },
    "totals": {
      "totalItems": 2,
      "totalQuantity": 3,
      "subtotal": 232.8,
      "shipping": 15,
      "tax": 23.28,
      "grandTotal": 271.08
    },
    "itemDetails": [
      {
        "id": "3fbb5da8-f6fe-4f8d-b378-f3ad8abfbe5f",
        "productId": "25535f1a-916e-4694-a0f8-41cc4cb95a8e",
        "name": "Fiberoptic Intubation Kit",
        "sku": "FLOW-SKU-123",
        "image": "https://cdn.example.com/products/fiberoptic-kit.jpg",
        "quantity": 1,
        "unitPrice": 199,
        "lineTotal": 199
      },
      {
        "id": "f161f75e-5534-4a30-9a31-87b07f7c2bf7",
        "productId": "7dbe7f4d-f898-44ca-a558-b5a98d50f4d7",
        "name": "Video Laryngoscope Blade Set",
        "sku": "VLS-BLADE-02",
        "image": "https://cdn.example.com/products/blade-set.jpg",
        "quantity": 2,
        "unitPrice": 16.9,
        "lineTotal": 33.8
      }
    ],
    "shippingTo": {
      "fullName": "Dr. Alex Adams",
      "company": null,
      "addressLine1": "1200 Medical Center Blvd",
      "addressLine2": "Suite 301",
      "city": "Houston",
      "state": "TX",
      "postalCode": "77030",
      "country": "US",
      "phone": "+1-555-111-2222"
    }
  }
}
```

### Error response (401) - unauthorized
```json
{
  "statusCode": 401,
  "path": "/public/orders/history/breakdown/ORD-8829",
  "message": "Unauthorized"
}
```

### Error response (404) - order not found
```json
{
  "statusCode": 404,
  "path": "/public/orders/history/breakdown/ORD-DOES-NOT-EXIST",
  "message": "Order not found"
}
```

### Error response (404) - user not found
```json
{
  "statusCode": 404,
  "path": "/public/orders/history/breakdown/ORD-8829",
  "message": "User not found"
}
```

---

## 7) Module 3 My Course - Dashboard Summary

### Endpoint
- Method: `GET`
- Path: `/workshops/student/my-courses/summary`
- Auth: Required
- Request body: None

### Purpose
Returns Module 3 dashboard metrics for the logged-in student:
- `totalCmeCredits`
- `totalInProgressCourses`
- `nextLiveSession` date and time

Progress is auto-resolved by schedule date and tracking status:
- `confirmed`: course is registered and not all days are completed.
- `completed`: all scheduled days are completed.

### Request variants

#### Variant A: Valid token (student has enrolled workshops)
```bash
curl --location 'http://localhost:3000/workshops/student/my-courses/summary' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant B: Valid token (student has no enrolled workshops)
```bash
curl --location 'http://localhost:3000/workshops/student/my-courses/summary' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant C: Missing token
```bash
curl --location 'http://localhost:3000/workshops/student/my-courses/summary'
```

### Success response (200) - with data
```json
{
  "message": "My course summary fetched successfully",
  "data": {
    "totalCmeCredits": 12.5,
    "totalInProgressCourses": 2,
    "nextLiveSession": {
      "workshopId": "4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d",
      "title": "Advanced Airway Management",
      "date": "2026-04-20",
      "time": "09:00:00",
      "dateTime": "2026-04-20T09:00:00.000Z"
    }
  }
}
```

### Success response (200) - no enrolled workshops
```json
{
  "message": "My course summary fetched successfully",
  "data": {
    "totalCmeCredits": 0,
    "totalInProgressCourses": 0,
    "nextLiveSession": null
  }
}
```

### Error response (401) - unauthorized
```json
{
  "statusCode": 401,
  "path": "/workshops/student/my-courses/summary",
  "message": "Unauthorized"
}
```

---

## 8) Module 3 My Course - Course List By Filter

### Endpoint
- Method: `GET`
- Path: `/workshops/student/my-courses`
- Auth: Required
- Request body: None

### Query params
- `status` (optional, default `active`)
  - Allowed: `active`, `confirmed`, `completed`, `browse`
  - `browse` returns all published workshops that the student is not enrolled in.
- `search` (optional, string)
  - Searches by course name (`title`).
- `courseType` (optional, enum)
  - Allowed: `in_person`, `online`
- `sortBy` (optional, default `startDate`)
  - Allowed: `startDate`, `endDate`, `completedDate`, `createdAt`, `title`
- `sortOrder` (optional, default `asc`)
  - Allowed: `asc`, `desc`
- `page` (optional, number, default `1`, min `1`)
- `limit` (optional, number, default `10`, min `1`, max `100`)

### Filter behavior explained (current)

#### 1) `status` filter
- `active`: returns all enrolled non-completed courses (these are always `confirmed` status; there is no `in_progress`).
- `confirmed`: returns only enrolled confirmed courses.
- `completed`: returns only enrolled courses with `completed`.
- `browse`: returns published courses that the user is not enrolled in.

**Note:**
- The only valid course statuses returned by the API are `confirmed` and `completed`. Any legacy or internal status like `in_progress` is not used or exposed.

#### 2) `search` filter
- Case-insensitive `title` contains match.
- Applied after status selection.

#### 3) `courseType` filter
- Allowed values: `online`, `in_person`.
- Matches response field `courseType`.

#### 4) `sortBy` and `sortOrder`
- `sortBy=startDate`: sorts by course start date.
- `sortBy=endDate`: sorts by course end date.
- `sortBy=completedDate`: sorts by `completedOn`.
- `sortBy=createdAt`: sorts by workshop creation timestamp.
- `sortBy=title`: alphabetical sort by course title.
- `sortOrder=asc|desc`: ascending or descending.

#### 5) Pagination
- `page` and `limit` are applied after filtering and sorting.
- Response `meta.total` and `meta.totalPages` are based on filtered result set.

#### 6) Browse-specific behavior
- `status=browse` always sets item status fields as:
  - `status: "browse"`
  - `statusLabel: "Browse"`
  - `isEnrolled: false`
  - day statuses follow date-based lifecycle (`current`/`completed`/`upcoming`).

### Request variants

#### Variant A: Valid token (default active list)
```bash
curl --location 'http://localhost:3000/workshops/student/my-courses' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant B: Valid token (in-progress only)
```bash
curl --location 'http://localhost:3000/workshops/student/my-courses?status=confirmed&page=1&limit=10' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant B2: Valid token (all active non-completed)
```bash
curl --location 'http://localhost:3000/workshops/student/my-courses?status=active&page=1&limit=10' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant C: Valid token (completed courses, sorted by completed date desc)
```bash
curl --location 'http://localhost:3000/workshops/student/my-courses?status=completed&sortBy=completedDate&sortOrder=desc' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant D: Valid token (browse unenrolled online courses, search by title)
```bash
curl --location 'http://localhost:3000/workshops/student/my-courses?status=browse&courseType=online&search=airway' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant E: Missing token
```bash
curl --location 'http://localhost:3000/workshops/student/my-courses?status=active'
```

#### Variant F: Invalid status
```bash
curl --location 'http://localhost:3000/workshops/student/my-courses?status=archived' \
  --header 'Authorization: Bearer <access_token>'
```

### Success response (200) - completed courses
```json
{
  "message": "My courses fetched successfully",
  "data": [
    {
      "workshopId": "4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d",
      "title": "Advanced Airway Management",
      "courseType": "online",
      "workshopPhoto": "https://cdn.example.com/workshops/airway.jpg",
      "status": "completed",
      "statusLabel": "Completed",
      "isEnrolled": true,
      "enrolledAt": "2026-04-01T10:10:00.000Z",
      "startDate": "2026-04-02T00:00:00.000Z",
      "endDate": "2026-04-03T23:59:59.999Z",
      "completedOn": "2026-04-03T23:59:59.999Z",
      "totalHours": 6.5,
      "cmeCredits": 6.5,
      "earnedCmeCredits": 6.5,
      "offersCmeCredits": true,
      "days": {
        "summary": {
          "totalDays": 2,
          "completedDays": 2,
          "remainingDays": 0
        },
        "data": [
          {
            "dayNumber": 1,
            "date": "2026-04-02",
            "status": "completed"
          },
          {
            "dayNumber": 2,
            "date": "2026-04-03",
            "status": "completed"
          }
        ]
      },
      "reservation": {
        "reservationId": "9f9c6db4-a0c2-4306-a9f2-9f45f034952a",
        "status": "confirmed",
        "numberOfSeats": 1,
        "pricePerSeat": "149.00",
        "totalPrice": "149.00"
      },
      "createdAt": "2026-03-10T11:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```




### Success response (200) - browse courses (unenrolled)
```json
{
  "message": "My courses fetched successfully",
  "data": [
    {
      "workshopId": "ae636f95-5f00-4c3b-a5a4-6df729fe1a26",
      "title": "Critical Care Simulation Bootcamp",
      "courseType": "in_person",
      "workshopPhoto": null,
      "status": "browse",
      "statusLabel": "Browse",
      "isEnrolled": false,
      "enrolledAt": null,
      "startDate": "2026-05-01T00:00:00.000Z",
      "endDate": "2026-05-03T23:59:59.999Z",
      "completedOn": null,
      "totalHours": 9,
      "cmeCredits": 0,
      "earnedCmeCredits": 0,
      "offersCmeCredits": false,
      "totalDays": 3,
      "completedDays": 0,
      "remainingDays": 3,
      "days": {
        "summary": {
          "totalDays": 3,
          "completedDays": 0,
          "remainingDays": 3
        },
        "data": [
          {
            "dayNumber": 1,
            "date": "2026-05-01",
            "status": "upcoming"
          },
          {
            "dayNumber": 2,
            "date": "2026-05-02",
            "status": "upcoming"
          },
          {
            "dayNumber": 3,
            "date": "2026-05-03",
            "status": "upcoming"
          }
        ]
      },
      "reservation": null,
      "createdAt": "2026-03-15T09:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 4,
    "totalPages": 1
  }
}
```

### Success response (200) - empty list
```json
{
  "message": "My courses fetched successfully",
  "data": [],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 0,
    "totalPages": 0
  }
}
```

### Error response (400) - invalid query
```json
{
  "statusCode": 400,
  "path": "/workshops/student/my-courses?status=archived",
  "message": [
    "status must be one of the following values: active, confirmed, completed, browse"
  ]
}
```

### Error response (401) - unauthorized
```json
{
  "statusCode": 401,
  "path": "/workshops/student/my-courses",
  "message": "Unauthorized"
}
```

---

## 9) Module 3 My Course - Full Course Details (Private)

### Endpoint
- Method: `GET`
- Path: `/workshops/private/my-courses/:courseId`
- Auth: Required
- Request body: None

### Purpose
Returns full workshop/course details for a single enrolled course, including:
- banner details
- booking/payment block
- progress block
- full day/session schedule
- sidebar blocks (certificate/online/in-person)

Course progress now auto-flows by workshop schedule dates.
No manual start call is required to move from `confirmed` to `completed`.

### Request variants

#### Variant A: Valid token + valid enrolled courseId
```bash
curl --location 'http://localhost:3000/workshops/private/my-courses/4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant B: Missing token
```bash
curl --location 'http://localhost:3000/workshops/private/my-courses/4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d'
```

#### Variant C: Course not found or not enrolled
```bash
curl --location 'http://localhost:3000/workshops/private/my-courses/00000000-0000-0000-0000-000000000000' \
  --header 'Authorization: Bearer <access_token>'
```

### Success response (200) - full details (shape example)
```json
{
  "courseId": "4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d",
  "workshop": {
    "id": "4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d",
    "title": "Advanced Airway Management",
    "shortBlurb": "Hands-on advanced airway sessions",
    "deliveryMode": "online",
    "status": "published",
    "coverImageUrl": "https://cdn.example.com/workshops/airway.jpg",
    "learningObjectives": "<p>Airway, ventilation, emergency response</p>",
    "offersCmeCredits": true,
    "facilityIds": ["online"],
    "webinarPlatform": "Zoom",
    "meetingLink": "https://zoom.us/j/123456789",
    "meetingPassword": "ABC123",
    "autoRecordSession": true,
    "capacity": 20,
    "alertAt": 5,
    "standardBaseRate": "149.00",
    "groupDiscountEnabled": false,
    "groupDiscounts": [],
    "faculty": [
      {
        "id": "6a17ff8f-f6e5-4226-8fcb-bfba2748d55b",
        "fullName": "Dr. Jane Smith",
        "title": "MD",
        "role": "Instructor",
        "expertise": "Airway Management",
        "profilePhotoUrl": "https://cdn.example.com/faculty/jane.jpg"
      }
    ],
    "days": [
      {
        "id": "f352c57f-d8d6-4833-a017-e7189ce927f2",
        "date": "2026-04-20",
        "dayNumber": 1,
        "segments": [
          {
            "id": "c8cd9e70-f9ce-47f3-86cb-1a563fef570f",
            "segmentNumber": 1,
            "courseTopic": "Airway Anatomy",
            "topicDetails": "Hands-on and simulation",
            "startTime": "09:00:00",
            "endTime": "11:00:00"
          }
        ]
      }
    ],
    "createdAt": "2026-03-10T11:00:00.000Z",
    "updatedAt": "2026-04-14T09:45:00.000Z"
  },
  "heroImage": "https://cdn.example.com/workshops/airway.jpg",
  "breadcrumb": [
    "My Courses",
    "Advanced Airway Management"
  ],
  "banner": {
    "badgePrimary": "ONLINE REGISTRATION CONFIRMED",
    "badgeSecondary": "12.0 CME CREDITS",
    "title": "Advanced Airway Management",
    "description": "Hands-on advanced airway sessions",
    "dateBox": {
      "dateRange": "APR 20 - 22",
      "locationOrPlatform": "Zoom",
      "time": "9:00 AM - 5:00 PM"
    }
  },
  "bookingDetails": {
    "status": "Booked for: 1 Attendee(s)",
    "totalPayment": "$149.00",
    "paymentBadge": "PAID",
    "refundNote": "Refunds available up to 48h before start."
  },
  "progress": {
    "status": "confirmed",
    "statusLabel": "Registration Confirmed",
    "totalDays": 3,
    "completedDays": 1,
    "remainingDays": 2,
    "startedAt": "2026-04-20T00:00:00.000Z",
    "completedAt": null
  },
  "scheduleHeader": {
    "title": "COURSE SCHEDULE",
    "badge": "UPCOMING SESSIONS"
  },
  "schedule": [
    {
      "title": "DAY 1",
      "date": "MONDAY, APR 20",
      "status": "COMPLETED",
      "sessions": []
    }
  ],
  "sidebar": {
    "certificateBox": null,
    "onlineDetails": {
      "technicalRequirements": [],
      "registrationReference": "#AB12CD34-AC",
      "prepMaterials": []
    },
    "inPersonDetails": null
  }
}
```

### Error response (401) - unauthorized
```json
{
  "statusCode": 401,
  "path": "/workshops/private/my-courses/4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d",
  "message": "Unauthorized"
}
```

### Error response (404) - course not found/not enrolled
```json
{
  "statusCode": 404,
  "path": "/workshops/private/my-courses/00000000-0000-0000-0000-000000000000",
  "message": "Course details not found."
}
```

---

## 10) Module 3 My Course - Start Course (Optional / Backward Compatible)

### Endpoint
- Method: `POST`
- Path: `/workshops/student/my-courses/:courseId/start`
- Auth: Required
- Request body: None

### Purpose
Manual start trigger for backward compatibility.

Current behavior note:
- Course progression auto-flows by schedule date even if this endpoint is not called.
- This endpoint can still be called safely to stamp/confirm `startedAt` explicitly.

### Request variants

#### Variant A: Valid token (start not-started course)
```bash
curl --location --request POST 'http://localhost:3000/workshops/student/my-courses/4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d/start' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant B: Valid token (already started course)
```bash
curl --location --request POST 'http://localhost:3000/workshops/student/my-courses/4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d/start' \
  --header 'Authorization: Bearer <access_token>'
```

#### Variant C: Missing token
```bash
curl --location --request POST 'http://localhost:3000/workshops/student/my-courses/4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d/start'
```

### Success response (200)
```json
{
  "message": "Course started successfully",
  "data": {
    "courseId": "4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d",
    "source": "reservation",
    "status": "confirmed",
    "statusLabel": "Registration Confirmed",
    "startedAt": "2026-04-14T10:12:00.000Z",
    "completedAt": null,
    "totalDays": 3,
    "completedDays": 0,
    "remainingDays": 3,
    "days": {
      "summary": {
        "totalDays": 3,
        "completedDays": 0,
        "remainingDays": 3
      },
      "data": [
        {
          "dayNumber": 1,
          "date": "2026-04-14",
          "status": "current"
        },
        {
          "dayNumber": 2,
          "date": "2026-04-15",
          "status": "upcoming"
        },
        {
          "dayNumber": 3,
          "date": "2026-04-16",
          "status": "upcoming"
        }
      ]
    }
  }
}
```

### Error response (401) - unauthorized
```json
{
  "statusCode": 401,
  "path": "/workshops/student/my-courses/4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d/start",
  "message": "Unauthorized"
}
```

### Error response (404) - course not found/not enrolled
```json
{
  "statusCode": 404,
  "path": "/workshops/student/my-courses/4ef6c01b-8e57-4e59-9d76-b4d0d90b5f0d/start",
  "message": "Course not found."
}
```
