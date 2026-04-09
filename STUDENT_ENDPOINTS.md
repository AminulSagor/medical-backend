# Student Endpoints API Contract

This document defines the student-facing endpoints added for:
- enrolled workshops
- recent product order summary
- order history summary cards
- past orders listing
- past order full details

Updated on: 2026-04-09

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
    "totalOrderedValueThisYear": 2138.5
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
    "totalOrderedValueThisYear": 0
  }
}
```

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
