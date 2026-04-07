# Workshop + Product + Order Management Flow

This document gives the full practical flow for:
- Workshop management and booking
- Product management and public catalog/checkout flow
- Product order management (admin operations)

It includes:
- API endpoints
- Request variants
- Success responses
- Error response patterns
- State transitions and operational flow

Payment and checkout specific full-flow documentation is available in:
- PAYMENT_CHECKOUT_FULL_FLOW.md

---

## 1) API Runtime Conventions

### Base URL
- Local default: `http://localhost:3000`
- No global API prefix is configured in `main.ts`.

### Authentication
- Public endpoints: no token required
- Protected endpoints: `Authorization: Bearer <accessToken>`
- Admin endpoints require JWT + role `admin`

### Checkout Environment (Stripe)
For public Stripe checkout endpoint to work, configure:
- `STRIPE_SECRET_KEY`
- `STRIPE_CHECKOUT_SUCCESS_URL`
- `STRIPE_CHECKOUT_CANCEL_URL`

Optional pricing controls:
- `CHECKOUT_ESTIMATED_SHIPPING`
- `CHECKOUT_FREE_SHIPPING_THRESHOLD`
- `CHECKOUT_ESTIMATED_TAX_RATE`

### Login (token acquisition)

#### POST /auth/login
Request:
```json
{
  "email": "admin@example.com",
  "password": "secret123"
}
```

Success 200:
```json
{
  "accessToken": "<jwt>",
  "user": {
    "id": "6f6d2be0-31c1-4b36-80a2-7784d2bd4d19",
    "fullLegalName": "Admin User",
    "medicalEmail": "admin@example.com",
    "professionalRole": "Administrator"
  }
}
```

Error 401:
```json
{
  "statusCode": 401,
  "path": "/auth/login",
  "message": "Invalid email or password"
}
```

### Standard error shape (global filter)
All exceptions return:
```json
{
  "statusCode": 400,
  "path": "/some/path",
  "message": "or array of validation messages"
}
```

Validation example (`forbidNonWhitelisted: true`):
```json
{
  "statusCode": 400,
  "path": "/admin/products",
  "message": [
    "property unknownField should not exist",
    "name must be shorter than or equal to 200 characters"
  ]
}
```

---

## 2) Full Workshop Flow

## 2.1 Business Flow (end-to-end)
1. Admin creates workshop in `draft` or `published`.
2. Admin optionally updates capacity, schedule, discount, faculty, and publish status.
3. Public sees only `published` workshops.
4. User logs in.
5. User creates checkout order-summary with attendee details.
6. User confirms reservation using attendee IDs from the summary.
7. Reservation is created as `confirmed`, and order-summary becomes `completed`.

### Important pricing behavior
- Group discount applies automatically when attendee count meets `minimumAttendees`.
- Lowest eligible `groupRatePerPerson` is applied.

### Important seat behavior
- Seat checks happen in both summary and reservation steps.
- Non-cancelled reservations count against capacity.

---

## 2.2 Workshop APIs

### A) Admin workshop management

#### POST /admin/workshops
Auth: Admin JWT

Purpose:
- Create a new workshop with schedule, pricing, discounts, and faculty assignments.

Request variant 1 (in-person full):
```json
{
  "deliveryMode": "in_person",
  "status": "draft",
  "title": "Advanced Airway Management",
  "shortBlurb": "Hands-on simulation workshop",
  "coverImageUrl": "https://cdn.example.com/workshops/airway.jpg",
  "learningObjectives": "1) Airway planning 2) Rescue algorithms",
  "offersCmeCredits": true,
  "facilityIds": [
    "ecb2bcec-dc83-4f75-a0e8-26dd5d32ca69"
  ],
  "capacity": 30,
  "alertAt": 5,
  "standardBaseRate": "399.00",
  "groupDiscountEnabled": true,
  "groupDiscounts": [
    {
      "minimumAttendees": 3,
      "groupRatePerPerson": "349.00"
    },
    {
      "minimumAttendees": 5,
      "groupRatePerPerson": "329.00"
    }
  ],
  "facultyIds": [
    "fb9decb0-2fd8-496d-a223-5f9f0f3765e8"
  ],
  "days": [
    {
      "date": "2026-06-20",
      "dayNumber": 1,
      "segments": [
        {
          "segmentNumber": 1,
          "courseTopic": "Airway Anatomy",
          "topicDetails": "Interactive clinical review",
          "startTime": "08:00 AM",
          "endTime": "10:00 AM"
        },
        {
          "segmentNumber": 2,
          "courseTopic": "Difficult Airway Algorithm",
          "startTime": "10:30 AM",
          "endTime": "12:30 PM"
        }
      ]
    }
  ]
}
```

Request variant 2 (online minimal valid):
```json
{
  "deliveryMode": "online",
  "title": "Virtual ECMO Primer",
  "offersCmeCredits": false,
  "facilityIds": [],
  "webinarPlatform": "Zoom",
  "meetingLink": "https://zoom.us/j/123456",
  "autoRecordSession": true,
  "capacity": 100,
  "alertAt": 10,
  "standardBaseRate": "149.00",
  "groupDiscountEnabled": false,
  "groupDiscounts": [],
  "days": [
    {
      "date": "2026-07-01",
      "dayNumber": 1,
      "segments": [
        {
          "segmentNumber": 1,
          "courseTopic": "ECMO Basics",
          "startTime": "09:00 AM",
          "endTime": "11:00 AM"
        }
      ]
    }
  ]
}
```

Success 201 (example):
```json
{
  "id": "9f6bc4f5-e8c2-4f9d-97f2-6e6a946b0f0d",
  "title": "Advanced Airway Management",
  "deliveryMode": "in_person",
  "status": "draft",
  "facilityIds": ["ecb2bcec-dc83-4f75-a0e8-26dd5d32ca69"],
  "capacity": 30,
  "alertAt": 5,
  "standardBaseRate": "399.00",
  "groupDiscountEnabled": true,
  "days": [
    {
      "id": "0bb2a5f5-9e5e-4be3-952e-8f0f2d5f1e6a",
      "dayNumber": 1,
      "date": "2026-06-20",
      "segments": [
        {
          "id": "f2d3aaaf-c218-4fe9-95f7-51c2ddad27e3",
          "segmentNumber": 1,
          "courseTopic": "Airway Anatomy",
          "startTime": "08:00:00",
          "endTime": "10:00:00"
        }
      ]
    }
  ],
  "createdAt": "2026-04-07T12:00:00.000Z",
  "updatedAt": "2026-04-07T12:00:00.000Z"
}
```

Common errors:
- 400 `standardBaseRate must be greater than 0`
- 400 `alertAt cannot be greater than capacity`
- 400 `At least one facilityId is required for in-person workshops`
- 400 `groupDiscounts required when groupDiscountEnabled = true`
- 400 `groupRatePerPerson must be less than standardBaseRate`
- 400 `Invalid time format: 8am. Use "08:00 AM"`
- 403 `Admin only`

---

#### PUT /admin/workshops/:id
Auth: Admin JWT

Purpose:
- Update workshop metadata, status, schedule, pricing, and faculty.

Request variant 1 (publish only):
```json
{
  "status": "published"
}
```

Request variant 2 (capacity + pricing + days update):
```json
{
  "capacity": 40,
  "alertAt": 8,
  "standardBaseRate": "450.00",
  "groupDiscountEnabled": true,
  "groupDiscounts": [
    {
      "minimumAttendees": 4,
      "groupRatePerPerson": "390.00"
    }
  ],
  "days": [
    {
      "date": "2026-06-21",
      "dayNumber": 1,
      "segments": [
        {
          "segmentNumber": 1,
          "courseTopic": "New Agenda",
          "startTime": "08:30 AM",
          "endTime": "10:30 AM"
        }
      ]
    }
  ]
}
```

Success 200:
```json
{
  "id": "9f6bc4f5-e8c2-4f9d-97f2-6e6a946b0f0d",
  "status": "published",
  "capacity": 40,
  "alertAt": 8,
  "updatedAt": "2026-04-07T12:15:00.000Z"
}
```

Common errors:
- 404 `Workshop with ID ... not found`
- 400 `Workshop title cannot be empty`
- 400 `groupDiscounts must be empty when groupDiscountEnabled = false`

---

#### GET /admin/workshops
Auth: Admin JWT

Purpose:
- Paginated and filterable workshop list for management.

Query params:
- `q` (title search)
- `facilityId`
- `facultyId` (uuid)
- `deliveryMode` = `in_person|online`
- `status` = `draft|published`
- `offersCmeCredits` = `true|false`
- `groupDiscountEnabled` = `true|false`
- `page` default 1
- `limit` default 10 max 50
- `sortBy` = `createdAt|title`
- `sortOrder` = `asc|desc`

Example:
`GET /admin/workshops?status=published&deliveryMode=online&page=1&limit=10&sortBy=createdAt&sortOrder=desc`

Success 200:
```json
{
  "message": "Workshops fetched successfully",
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 2,
    "totalPages": 1
  },
  "data": [
    {
      "id": "9f6bc4f5-e8c2-4f9d-97f2-6e6a946b0f0d",
      "title": "Virtual ECMO Primer",
      "deliveryMode": "online",
      "status": "published"
    }
  ]
}
```

---

#### GET /admin/workshops/:id
Auth: Admin JWT

Purpose:
- Full workshop record for admin details/edit.

Success 200:
```json
{
  "id": "9f6bc4f5-e8c2-4f9d-97f2-6e6a946b0f0d",
  "title": "Advanced Airway Management",
  "days": [
    {
      "dayNumber": 1,
      "segments": [
        {
          "segmentNumber": 1,
          "courseTopic": "Airway Anatomy"
        }
      ]
    }
  ],
  "groupDiscounts": [
    {
      "minimumAttendees": 3,
      "groupRatePerPerson": "349.00"
    }
  ]
}
```

Error 404:
```json
{
  "statusCode": 404,
  "path": "/admin/workshops/unknown-id",
  "message": "Workshop with ID unknown-id not found"
}
```

---

### B) Public workshop discovery + booking

#### GET /workshops
Auth: Public

Purpose:
- List only `published` workshops for end users.

Query params:
- `deliveryMode` = `in_person|online`
- `offersCmeCredits` = `true|false`
- `hasAvailableSeats` = `true|false`
- `page`, `limit` (defaults 1/10)
- `sortBy` = `date|price|title`
- `sortOrder` = `asc|desc`

Example:
`GET /workshops?deliveryMode=in_person&hasAvailableSeats=true&sortBy=date&sortOrder=asc`

Success 200:
```json
{
  "message": "Public workshops fetched successfully",
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  },
  "data": [
    {
      "id": "9f6bc4f5-e8c2-4f9d-97f2-6e6a946b0f0d",
      "date": "2026-06-20",
      "title": "Advanced Airway Management",
      "description": "Hands-on simulation workshop",
      "facility": "Houston Center",
      "deliveryMode": "in_person",
      "workshopPhoto": "https://cdn.example.com/workshops/airway.jpg",
      "totalHours": "4.0 hours",
      "cmeFredits": true,
      "availableSeats": 22,
      "totalCapacity": 30,
      "price": "399.00",
      "offerPrice": "349.00",
      "totalModules": 2
    }
  ]
}
```

---

#### GET /workshops/:id
Auth: Public

Purpose:
- Detailed workshop page with day/segment agenda, faculty, pricing, and seat stats.

Success 200:
```json
{
  "message": "Workshop details fetched successfully",
  "data": {
    "id": "9f6bc4f5-e8c2-4f9d-97f2-6e6a946b0f0d",
    "title": "Advanced Airway Management",
    "deliveryMode": "in_person",
    "status": "published",
    "startDate": "2026-06-20",
    "endDate": "2026-06-20",
    "numberOfDays": 1,
    "totalCapacity": 30,
    "reservedSeats": 8,
    "availableSeats": 22,
    "standardPrice": "399.00",
    "offerPrice": "349.00",
    "groupDiscountEnabled": true,
    "groupDiscounts": [
      {
        "minimumAttendees": 3,
        "pricePerPerson": "349.00",
        "savingsPerPerson": "50.00"
      }
    ],
    "days": [
      {
        "dayNumber": 1,
        "date": "2026-06-20",
        "segments": [
          {
            "segmentNumber": 1,
            "courseTopic": "Airway Anatomy",
            "startTime": "08:00:00",
            "endTime": "10:00:00",
            "durationMinutes": 120,
            "durationHours": "2.0"
          }
        ]
      }
    ]
  }
}
```

Error 404:
```json
{
  "statusCode": 404,
  "path": "/workshops/5d03f530-8cbb-4d2f-a3db-728388a0f6a0",
  "message": "Workshop not found or not available"
}
```

---

#### POST /workshops/checkout/order-summary
Auth: User JWT

Purpose:
- Pre-booking step. Validates attendees + seats, computes discount and totals.

Request:
```json
{
  "workshopId": "9f6bc4f5-e8c2-4f9d-97f2-6e6a946b0f0d",
  "attendees": [
    {
      "fullName": "Dr. Sarah Hall",
      "professionalRole": "Anesthesiologist",
      "npiNumber": "1234567890",
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

Success 201/200:
```json
{
  "message": "Order summary created successfully",
  "data": {
    "orderSummaryId": "7488ca14-6071-45b8-bd97-b4e78ff2776f",
    "workshop": {
      "id": "9f6bc4f5-e8c2-4f9d-97f2-6e6a946b0f0d",
      "title": "Advanced Airway Management",
      "deliveryMode": "in_person",
      "coverImageUrl": "https://cdn.example.com/workshops/airway.jpg"
    },
    "attendees": [
      {
        "id": "4828b03d-58be-4f18-9114-4b65e8df5b36",
        "index": 1,
        "fullName": "Dr. Sarah Hall",
        "professionalRole": "Anesthesiologist",
        "npiNumber": "1234567890",
        "email": "sarah@example.com"
      }
    ],
    "numberOfAttendees": 2,
    "availableSeats": 22,
    "pricing": {
      "standardPricePerSeat": "399.00",
      "appliedPricePerSeat": "399.00",
      "discountApplied": false,
      "discountInfo": null,
      "subtotal": "798.00",
      "tax": "0.00",
      "totalPrice": "798.00"
    },
    "createdAt": "2026-04-07T13:00:00.000Z"
  }
}
```

Common errors:
- 400 `At least one attendee is required`
- 400 `Only X seats available. You are trying to book Y seats.`
- 404 `Workshop not found or not available for booking`

---

#### GET /workshops/checkout/order-summary/:id
Auth: User JWT

Purpose:
- Retrieve previously created order summary for the same user.

Success 200:
```json
{
  "message": "Order summary fetched successfully",
  "data": {
    "orderSummaryId": "7488ca14-6071-45b8-bd97-b4e78ff2776f",
    "workshop": {
      "id": "9f6bc4f5-e8c2-4f9d-97f2-6e6a946b0f0d",
      "title": "Advanced Airway Management",
      "deliveryMode": "in_person",
      "coverImageUrl": "https://cdn.example.com/workshops/airway.jpg"
    },
    "attendees": [
      {
        "id": "4828b03d-58be-4f18-9114-4b65e8df5b36",
        "index": 1,
        "fullName": "Dr. Sarah Hall",
        "professionalRole": "Anesthesiologist",
        "email": "sarah@example.com"
      }
    ],
    "numberOfAttendees": 2,
    "pricing": {
      "pricePerSeat": "399.00",
      "discountApplied": false,
      "discountInfo": null,
      "totalPrice": "798.00"
    },
    "status": "pending"
  }
}
```

Error 404:
```json
{
  "statusCode": 404,
  "path": "/workshops/checkout/order-summary/7488ca14-6071-45b8-bd97-b4e78ff2776f",
  "message": "Order summary not found"
}
```

---

#### POST /workshops/reservations
Auth: User JWT

Purpose:
- Final booking confirmation using attendee IDs from order-summary.

Request:
```json
{
  "workshopId": "9f6bc4f5-e8c2-4f9d-97f2-6e6a946b0f0d",
  "attendeeIds": [
    "4828b03d-58be-4f18-9114-4b65e8df5b36",
    "b9f01395-6692-41d8-a347-5c7b2ef2dd2d"
  ]
}
```

Success 201/200:
```json
{
  "message": "Workshop booked successfully",
  "data": {
    "reservationId": "26e967d4-d449-4b46-b0f6-6187ed2ab66d",
    "workshopId": "9f6bc4f5-e8c2-4f9d-97f2-6e6a946b0f0d",
    "numberOfSeats": 2,
    "pricePerSeat": "399.00",
    "totalPrice": "798.00",
    "status": "confirmed",
    "attendees": [
      {
        "id": "ff5a57c5-16dc-4eca-97b1-ebf64be4dc8f",
        "fullName": "Dr. Sarah Hall",
        "email": "sarah@example.com"
      }
    ],
    "availableSeatsRemaining": 20,
    "createdAt": "2026-04-07T13:15:00.000Z"
  }
}
```

Common errors:
- 400 `At least one attendee ID is required`
- 400 `Invalid attendee IDs or attendees do not belong to your order summary`
- 400 `Only X seats available. You are trying to book Y seats.`
- 404 `Workshop not found or not available for booking`

---

## 3) Full Product Flow

## 3.1 Business Flow (end-to-end)
1. Admin creates product (clinical, technical, pricing, inventory, merchandising data).
2. Admin maintains product via list/search/get/update.
3. Public users fetch filters and browse products with pagination/filter/sort.
4. Public users open product details.
5. Public users request order summary from selected cart items.
6. If user clicks Proceed to Checkout, frontend checks authentication.
7. If unauthenticated, frontend redirects to login.
8. If authenticated, frontend gets/updates shipping address.
9. Frontend creates Stripe checkout session and redirects to Stripe URL.

### Pricing validation rules
- `offerPrice` must be less than `actualPrice` when `offerPrice > 0`.
- Every `bulkPriceTiers[].price` must be less than `actualPrice` and greater than 0.

### Stock-related notes
- Public list returns `inStock` from `stockQuantity > 0`.
- Cart calculation does not reject out-of-stock quantity by itself; it returns item stock flag.

### Checkout notes
- Public order summary endpoint returns: `subtotal`, `estimatedShipping`, `estimatedTax`, `orderTotal`.
- Stripe session endpoint currently creates payment session only; it does not persist a final `orders` row by itself.

---

## 3.2 Product APIs

### A) Admin product management

#### POST /admin/products
Auth: Admin JWT

Purpose:
- Create a product and related detail metadata.

Request variant 1 (full):
```json
{
  "name": "Portable Airway Trainer",
  "clinicalDescription": "Advanced trainer for difficult airway simulation",
  "brand": "TAI Clinical",
  "clinicalBenefits": [
    {
      "icon": "check-circle",
      "title": "Realistic anatomy",
      "description": "Improves confidence in airway interventions"
    }
  ],
  "technicalSpecifications": [
    {
      "name": "Material",
      "value": "Medical-grade silicone"
    }
  ],
  "images": [
    "https://cdn.example.com/products/airway-trainer-1.jpg"
  ],
  "categoryId": [
    "4a6d729c-df0e-46f2-b242-f9d8f7033ab6"
  ],
  "backorder": false,
  "frequentlyBoughtTogether": ["Suction Kit", "Tube Set"],
  "bundleUpsells": ["Airway Workshop Bundle"],
  "frontendBadges": ["professional-grade", "new-arrival"],
  "tags": ["airway", "simulation", "training"],
  "actualPrice": "999.00",
  "offerPrice": "899.00",
  "bulkPriceTiers": [
    {
      "minQty": 5,
      "price": "849.00"
    }
  ],
  "sku": "AT-9000",
  "barcode": "1234567890123",
  "stockQuantity": 50,
  "lowStockAlert": 5,
  "isActive": true
}
```

Request variant 2 (minimal required fields):
```json
{
  "name": "Starter Laryngoscope",
  "clinicalDescription": "Basic scope",
  "clinicalBenefits": [
    {
      "icon": "check",
      "title": "Benefit",
      "description": "Useful"
    }
  ],
  "technicalSpecifications": [
    {
      "name": "Spec",
      "value": "Value"
    }
  ],
  "categoryId": [
    "4a6d729c-df0e-46f2-b242-f9d8f7033ab6"
  ],
  "sku": "LS-100"
}
```

Success 201:
```json
{
  "id": "6872d2ba-7958-4de7-b9cb-4f2c0eb57d8b",
  "name": "Portable Airway Trainer",
  "sku": "AT-9000",
  "actualPrice": "999.00",
  "offerPrice": "899.00",
  "stockQuantity": 50,
  "isActive": true,
  "details": {
    "images": ["https://cdn.example.com/products/airway-trainer-1.jpg"],
    "frontendBadges": ["professional-grade"]
  },
  "createdAt": "2026-04-07T14:00:00.000Z"
}
```

Common errors:
- 400 `Invalid categoryId: ...`
- 400 `Offer price must be less than actual price`
- 400 `Bulk tier price must be less than actual price`
- 400 `SKU already exists`
- 403 `Admin only`

---

#### GET /admin/products/search?q=...
Auth: Admin JWT

Purpose:
- Lightweight search for product linking (frequently bought together/bundles).

Success 200:
```json
[
  {
    "id": "6872d2ba-7958-4de7-b9cb-4f2c0eb57d8b",
    "name": "Portable Airway Trainer",
    "sku": "AT-9000"
  }
]
```

---

#### GET /admin/products
Auth: Admin JWT

Purpose:
- Product list with pagination, filters, and tabs counters.

Query params:
- `page`, `limit`
- `search`
- `categoryNames[]`
- `tagNames[]`
- `tab` = `all|active|out_of_stock|low_stock`

Example:
`GET /admin/products?tab=low_stock&search=airway&page=1&limit=20`

Success 200:
```json
{
  "items": [
    {
      "id": "6872d2ba-7958-4de7-b9cb-4f2c0eb57d8b",
      "name": "Portable Airway Trainer",
      "sku": "AT-9000",
      "stockQuantity": 4,
      "lowStockAlert": 5,
      "isActive": true
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  },
  "tabsCount": {
    "all": 34,
    "active": 30,
    "out_of_stock": 2,
    "low_stock": 3
  }
}
```

---

#### GET /admin/products/:id
Auth: Admin JWT

Purpose:
- Full product payload for edit screen.

Success 200:
```json
{
  "id": "6872d2ba-7958-4de7-b9cb-4f2c0eb57d8b",
  "name": "Portable Airway Trainer",
  "categoryId": ["4a6d729c-df0e-46f2-b242-f9d8f7033ab6"],
  "categories": [
    {
      "id": "4a6d729c-df0e-46f2-b242-f9d8f7033ab6",
      "name": "Airway"
    }
  ],
  "clinicalBenefits": [
    {
      "icon": "check-circle",
      "title": "Realistic anatomy",
      "description": "Improves confidence"
    }
  ],
  "technicalSpecifications": [
    {
      "name": "Material",
      "value": "Medical-grade silicone"
    }
  ],
  "stockQuantity": 50
}
```

Error 404:
```json
{
  "statusCode": 404,
  "path": "/admin/products/unknown",
  "message": "Product not found"
}
```

---

#### PATCH /admin/products/:id
Auth: Admin JWT

Purpose:
- Partial update, with optional quick update mode.

Request variant 1 (standard patch):
```json
{
  "name": "Portable Airway Trainer V2",
  "offerPrice": "879.00",
  "stockQuantity": 40,
  "images": [
    "https://cdn.example.com/products/airway-trainer-v2.jpg"
  ],
  "frontendBadges": ["used-in-workshop"]
}
```

Request variant 2 (quick update only):
```json
{
  "quickUpdate": true,
  "stockQuantity": 25,
  "offerPrice": "859.00"
}
```

Success 200:
```json
{
  "id": "6872d2ba-7958-4de7-b9cb-4f2c0eb57d8b",
  "name": "Portable Airway Trainer V2",
  "offerPrice": "879.00",
  "stockQuantity": 40,
  "updatedAt": "2026-04-07T14:30:00.000Z"
}
```

Common errors:
- 400 `Quick update allows only stockQuantity and offerPrice. Invalid fields: ...`
- 400 `Quick update requires at least one of: stockQuantity, offerPrice`
- 400 `Offer price must be less than actual price`
- 404 `Product not found`

---

### B) Public product catalog + cart summary

#### GET /public/products/filters
Auth: Public

Purpose:
- Return category counts, available brands, and price range.

Success 200:
```json
{
  "categories": [
    {
      "name": "Airway",
      "productCount": 12
    }
  ],
  "brands": ["TAI Clinical", "MedCore"],
  "priceRange": {
    "min": 39,
    "max": 999
  }
}
```

---

#### GET /public/products/categories
Auth: Public

Purpose:
- Alias of `/public/products/filters` for backward compatibility.

Success shape: same as filters.

---

#### GET /public/products
Auth: Public

Purpose:
- Product list page with search/filter/sort.

Query params:
- `page`, `limit`
- `search`
- `categoryNames[]`
- `brands[]`
- `minPrice`, `maxPrice`
- `sortBy` = `price-asc|price-desc|name-asc|name-desc|newest`

Example:
`GET /public/products?categoryNames=Airway&brands=TAI%20Clinical&minPrice=100&maxPrice=900&sortBy=price-asc`

Success 200:
```json
{
  "items": [
    {
      "id": "6872d2ba-7958-4de7-b9cb-4f2c0eb57d8b",
      "photo": "https://cdn.example.com/products/airway-trainer-1.jpg",
      "category": "Airway",
      "title": "Portable Airway Trainer",
      "description": "Advanced trainer",
      "price": "999.00",
      "discountedPrice": "899.00",
      "brand": "TAI Clinical",
      "inStock": true,
      "badge": "PROFESSIONAL GRADE"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 12,
    "total": 1,
    "totalPages": 1
  }
}
```

---

#### GET /public/products/:id
Auth: Public

Purpose:
- Full public product detail payload.

Success 200:
```json
{
  "id": "6872d2ba-7958-4de7-b9cb-4f2c0eb57d8b",
  "name": "Portable Airway Trainer",
  "brand": "TAI Clinical",
  "sku": "AT-9000",
  "clinicalDescription": "Advanced trainer",
  "categories": [
    {
      "id": "4a6d729c-df0e-46f2-b242-f9d8f7033ab6",
      "name": "Airway"
    }
  ],
  "actualPrice": "999.00",
  "offerPrice": "899.00",
  "bulkPriceTiers": [
    {
      "minQty": 5,
      "price": "849.00"
    }
  ],
  "stockQuantity": 50,
  "inStock": true,
  "images": ["https://cdn.example.com/products/airway-trainer-1.jpg"],
  "rating": {
    "average": 4.8,
    "count": 12
  }
}
```

Error 404:
```json
{
  "statusCode": 404,
  "path": "/public/products/6872d2ba-7958-4de7-b9cb-4f2c0eb57d8b",
  "message": "Product not found"
}
```

---

#### POST /public/products/cart/calculate
Auth: Public

Purpose:
- Computes order summary from item IDs and quantities.
- Current tax rate in code: `10%`.

Request:
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
  ]
}
```

Success 200:
```json
{
  "items": [
    {
      "productId": "6872d2ba-7958-4de7-b9cb-4f2c0eb57d8b",
      "photo": "https://cdn.example.com/products/airway-trainer-1.jpg",
      "name": "Portable Airway Trainer",
      "sku": "AT-9000",
      "inStock": true,
      "price": "899.00",
      "quantity": 2,
      "itemTotal": "1798.00"
    }
  ],
  "orderSummary": {
    "subtotal": "1897.00",
    "estimatedTax": "189.70",
    "orderTotal": "2086.70"
  }
}
```

Error 400:
```json
{
  "statusCode": 400,
  "path": "/public/products/cart/calculate",
  "message": "Some products not found"
}
```

---

### C) Public product checkout flow (new)

#### POST /public/orders/summary
Auth: Public

Purpose:
- Calculate checkout-ready order summary from cart items.
- Returns `subtotal`, `estimatedShipping`, `estimatedTax`, and `orderTotal`.

Request:
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

Success 200:
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
- 400 `At least one cart item is required`
- 400 `Some products are invalid or inactive`

---

#### GET /public/orders/shipping-address
Auth: User JWT

Purpose:
- Fetch the authenticated user shipping address for checkout form prefill.

Success 200 (existing saved address):
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

Success 200 (no saved address yet):
```json
{
  "message": "Shipping address fetched successfully",
  "data": {
    "fullName": "Dr. Sarah Hall",
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

---

#### PATCH /public/orders/shipping-address
Auth: User JWT

Purpose:
- Save/update checkout shipping address before proceeding to Stripe.

Request:
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

Success 200:
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

---

#### POST /public/orders/checkout/stripe-session
Auth: User JWT

Purpose:
- Create Stripe checkout session after user is authenticated and shipping address is available.
- Returns Stripe `sessionId` and `checkoutUrl`.

Request variant 1 (use saved shipping address):
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

Request variant 2 (send shipping address inline):
```json
{
  "items": [
    {
      "productId": "6872d2ba-7958-4de7-b9cb-4f2c0eb57d8b",
      "quantity": 2
    }
  ],
  "shippingAddress": {
    "fullName": "Dr. Sarah Hall",
    "addressLine1": "100 Main St",
    "addressLine2": "Suite 201",
    "city": "Houston",
    "state": "TX",
    "zipCode": "77001",
    "country": "US"
  },
  "successUrl": "http://localhost:5173/checkout/success?session_id={CHECKOUT_SESSION_ID}",
  "cancelUrl": "http://localhost:5173/checkout/cancel"
}
```

Success 200:
```json
{
  "message": "Stripe checkout session created successfully",
  "data": {
    "sessionId": "cs_test_a1b2c3d4",
    "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4",
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
      "subtotal": "1798.00",
      "estimatedShipping": "0.00",
      "estimatedTax": "179.80",
      "orderTotal": "1977.80"
    }
  }
}
```

Common errors:
- 400 `Shipping address is required before checkout`
- 400 `Shipping address requires fullName, addressLine1, city, state, zipCode`
- 400 `STRIPE_SECRET_KEY is not configured`
- 400 `successUrl and cancelUrl are required (request body or env)`
- 401 Unauthorized (when user is not authenticated)

---

## 4) Product Order Management Flow (Admin)

## 4.1 Business Flow (as implemented)
1. Order records exist in `orders` table (type, payment, fulfillment, customer snapshot, items).
2. Admin monitors KPIs via summary.
3. Admin filters and opens order details.
4. Admin updates dispatch/tracking data.
5. Admin moves fulfillment status through valid transitions.
6. Admin can generate/print shipping label.
7. Admin can refund paid orders (sets payment to refunded and fulfillment to closed).

### Important implementation note
- Public checkout flow is available through:
  - `POST /public/orders/summary`
  - `GET/PATCH /public/orders/shipping-address`
  - `POST /public/orders/checkout/stripe-session`
- Admin order APIs still manage persisted `orders` records.
- Stripe payment success is not yet writing final order rows automatically unless a webhook/order-finalization layer is added.

---

## 4.2 Fulfillment state machine

Allowed transitions:
- `unfulfilled -> processing`
- `unfulfilled -> closed`
- `processing -> shipped`
- `processing -> closed`
- `shipped -> received`
- `shipped -> closed`
- `received -> closed`
- `closed -> (no next)`

If invalid transition is requested:
- 400 `Invalid status transition from X to Y`

Optional optimistic check:
- Provide `fromStatus`; if current status differs:
- 400 `Current status mismatch. Expected ... but found ...`

---

## 4.3 Order management APIs

### GET /admin/orders/summary
Auth: Admin JWT

Purpose:
- Dashboard cards.

Success 200:
```json
{
  "cards": {
    "thisMonthRevenue": 12450,
    "totalOrders": 126,
    "toBeShipped": 18,
    "avgOrderValue": 221.4
  }
}
```

---

### GET /admin/orders
Auth: Admin JWT

Purpose:
- Paginated order list with filters.

Query params:
- `page`, `limit`
- `search` (order number / customer name / email)
- `type` = `product|course`
- `paymentStatus` = `pending|paid|refunded|failed`
- `fulfillmentStatus` = `unfulfilled|processing|shipped|received|closed`

Success 200:
```json
{
  "items": [
    {
      "id": "5ff58a6f-aa35-45fd-80ec-d28a40d66846",
      "orderId": "ORD-100045",
      "date": "2026-04-07T15:00:00.000Z",
      "customer": {
        "name": "Dr. Sarah Hall",
        "email": "sarah@example.com",
        "avatar": null
      },
      "type": "product",
      "paymentStatus": "paid",
      "fulfillment": "processing",
      "total": "899.00"
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

---

### GET /admin/orders/:id
Auth: Admin JWT

Purpose:
- Full order detail for fulfillment UI.

Accepts:
- Internal `id` OR `orderNumber` in `:id`.

Success 200:
```json
{
  "id": "5ff58a6f-aa35-45fd-80ec-d28a40d66846",
  "orderId": "ORD-100045",
  "placedAt": "2026-04-07T15:00:00.000Z",
  "paymentStatus": "paid",
  "fulfillmentStatus": "processing",
  "customer": {
    "name": "Dr. Sarah Hall",
    "email": "sarah@example.com",
    "phone": "+1-555-1000",
    "avatar": null,
    "shippingAddress": {
      "company": "Memorial Hospital",
      "attention": "Receiving Desk",
      "addressLine1": "100 Main St",
      "addressLine2": null,
      "city": "Houston",
      "state": "TX",
      "postalCode": "77001",
      "country": "US"
    }
  },
  "items": [
    {
      "id": "aef53a5b-b9ed-4a64-8fb4-43bc92a7678d",
      "productId": "6872d2ba-7958-4de7-b9cb-4f2c0eb57d8b",
      "name": "Portable Airway Trainer",
      "sku": "AT-9000",
      "image": "https://cdn.example.com/products/airway-trainer-1.jpg",
      "price": "899.00",
      "quantity": 1,
      "total": "899.00"
    }
  ],
  "summary": {
    "subtotal": "899.00",
    "shipping": "0.00",
    "tax": "89.90",
    "grandTotal": "988.90"
  },
  "dispatch": {
    "carrier": "FedEx",
    "trackingNumber": "TRK-ORD100045",
    "estimatedDeliveryDate": "2026-04-10T00:00:00.000Z",
    "shippingNotes": "Handle with care"
  },
  "timeline": [
    {
      "id": "ca5ecf73-c7b3-4f62-998b-7cec3f3cfa45",
      "type": "processing_started",
      "title": "Order Processing Started",
      "description": null,
      "createdAt": "2026-04-07T15:15:00.000Z"
    }
  ]
}
```

Error 404:
```json
{
  "statusCode": 404,
  "path": "/admin/orders/unknown",
  "message": "Order not found"
}
```

---

### PATCH /admin/orders/:id/dispatch
Auth: Admin JWT

Purpose:
- Set carrier/tracking/eta/notes and optional fulfillment status.
- Adds timeline event when status is `shipped` or `received`.

Request variant 1 (dispatch details only):
```json
{
  "carrier": "FedEx",
  "trackingNumber": "TRK-ORD100045",
  "estimatedDeliveryDate": "2026-04-10",
  "shippingNotes": "Fragile"
}
```

Request variant 2 (mark shipped):
```json
{
  "carrier": "FedEx",
  "trackingNumber": "TRK-ORD100045",
  "fulfillmentStatus": "shipped"
}
```

Success 200:
- Returns the full order detail payload (`findOne` shape).

Common errors:
- 404 `Order not found`
- 400 validation errors on date/enum

---

### PATCH /admin/orders/:id/status
Auth: Admin JWT

Purpose:
- Enforce fulfillment transition rules.

Request variant 1 (with optimistic fromStatus):
```json
{
  "fromStatus": "processing",
  "toStatus": "shipped",
  "notifyCustomer": true,
  "note": "Packed and handed to courier"
}
```

Request variant 2 (direct close):
```json
{
  "toStatus": "closed"
}
```

Success 200:
```json
{
  "message": "Order status updated successfully",
  "order": {
    "id": "5ff58a6f-aa35-45fd-80ec-d28a40d66846",
    "orderId": "ORD-100045",
    "paymentStatus": "paid",
    "fulfillmentStatus": "shipped",
    "updatedAt": "2026-04-07T15:30:00.000Z"
  },
  "timelineEvent": {
    "type": "order_shipped",
    "title": "Order Shipped",
    "description": "Packed and handed to courier",
    "createdAt": "2026-04-07T15:30:00.000Z"
  }
}
```

Common errors:
- 400 `Current status mismatch...`
- 400 `Invalid status transition from X to Y`
- 404 `Order not found`

---

### POST /admin/orders/:id/refund
Auth: Admin JWT

Purpose:
- Refund a paid order.
- Sets `paymentStatus = refunded`, `fulfillmentStatus = closed`.
- Writes timeline event `order_refunded`.

Request:
```json
{
  "reason": "Duplicate charge"
}
```

Success 200:
- Returns full order detail (`findOne` shape) with refunded/closed values.

Common errors:
- 400 `Only paid orders can be refunded`
- 404 `Order not found`

---

### POST /admin/orders/:id/labels/print
Auth: Admin JWT

Purpose:
- Generate label metadata and return URLs for preview/download.

Request variant 1 (default options):
```json
{}
```

Request variant 2 (explicit options):
```json
{
  "labelFormat": "4x6",
  "orientation": "portrait",
  "includePackingSlip": false,
  "printInstructions": true
}
```

Success 200:
```json
{
  "message": "Shipping label generated successfully",
  "orderId": "ORD-100045",
  "label": {
    "downloadUrl": "/admin/orders/5ff58a6f-aa35-45fd-80ec-d28a40d66846/labels/print?download=1",
    "previewUrl": "/admin/orders/5ff58a6f-aa35-45fd-80ec-d28a40d66846/labels/print",
    "labelFormat": "4x6",
    "orientation": "portrait",
    "includePackingSlip": false,
    "printInstructions": true
  }
}
```

---

### GET /admin/orders/:id/labels/print
Auth: Admin JWT

Purpose:
- Returns generated shipping label PDF (`Content-Type: application/pdf`).

Behavior:
- `?download=1` sets `Content-Disposition: attachment`
- Without `download=1`, response is inline preview

Error 404:
```json
{
  "statusCode": 404,
  "path": "/admin/orders/5ff58a6f-aa35-45fd-80ec-d28a40d66846/labels/print",
  "message": "Order not found"
}
```

---

## 5) Practical Integration Sequences

## 5.1 Workshop booking integration
1. Admin creates workshop (`POST /admin/workshops`) and publishes (`PUT /admin/workshops/:id`).
2. Frontend fetches public list (`GET /workshops`) and detail (`GET /workshops/:id`).
3. User logs in (`POST /auth/login`).
4. Frontend submits attendees (`POST /workshops/checkout/order-summary`).
5. Frontend shows pricing/discount summary.
6. Frontend confirms booking (`POST /workshops/reservations`).

## 5.2 Product catalog integration
1. Admin seeds products (`POST /admin/products`) and maintains stock/price (`PATCH /admin/products/:id`).
2. Frontend loads filters (`GET /public/products/filters`).
3. Frontend lists products (`GET /public/products`) with search/filter/sort.
4. Frontend opens details (`GET /public/products/:id`).
5. Frontend calculates checkout summary (`POST /public/orders/summary`).
6. On Proceed to Checkout, frontend checks auth; if unauthenticated, redirect to login.
7. Frontend reads or updates address (`GET/PATCH /public/orders/shipping-address`).
8. Frontend creates Stripe session (`POST /public/orders/checkout/stripe-session`) and redirects to `checkoutUrl`.

## 5.3 Product order management integration
1. Ensure order-finalization source (for example Stripe webhook) writes records into `orders` table after successful payment.
2. Admin dashboard reads summary/list/detail (`GET /admin/orders/summary`, `GET /admin/orders`, `GET /admin/orders/:id`).
3. Warehouse updates dispatch (`PATCH /admin/orders/:id/dispatch`).
4. Operations progresses fulfillment state (`PATCH /admin/orders/:id/status`).
5. Finance refunds when needed (`POST /admin/orders/:id/refund`).
6. Shipping prints labels (`POST/GET /admin/orders/:id/labels/print`).

---

## 6) Quick Endpoint Index

Workshop:
- `POST /admin/workshops`
- `PUT /admin/workshops/:id`
- `GET /admin/workshops`
- `GET /admin/workshops/:id`
- `GET /workshops`
- `GET /workshops/:id`
- `POST /workshops/checkout/order-summary`
- `GET /workshops/checkout/order-summary/:id`
- `POST /workshops/reservations`

Products:
- `POST /admin/products`
- `GET /admin/products/search`
- `GET /admin/products`
- `GET /admin/products/:id`
- `PATCH /admin/products/:id`
- `GET /public/products/filters`
- `GET /public/products/categories`
- `GET /public/products`
- `GET /public/products/:id`
- `POST /public/products/cart/calculate`

Public checkout:
- `POST /public/orders/summary`
- `GET /public/orders/shipping-address`
- `PATCH /public/orders/shipping-address`
- `POST /public/orders/checkout/stripe-session`

Orders (admin management):
- `GET /admin/orders/summary`
- `GET /admin/orders`
- `GET /admin/orders/:id`
- `PATCH /admin/orders/:id/dispatch`
- `PATCH /admin/orders/:id/status`
- `POST /admin/orders/:id/refund`
- `POST /admin/orders/:id/labels/print`
- `GET /admin/orders/:id/labels/print`
