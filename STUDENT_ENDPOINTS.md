# Student Endpoints API Contract

This document defines the student-facing endpoints added for:
- enrolled workshops
- recent product order summary

Updated on: 2026-04-08

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
