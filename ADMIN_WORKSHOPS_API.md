# Admin Workshops API Documentation

## Base URL
```
{{baseUrl}}/admin/workshops
```

## Authentication
All endpoints require:
- **JWT Token** in Authorization header: `Bearer <token>`
- **Role**: `admin`

---

## Endpoints

### 1. List All Workshops (with Filters)
**GET** `{{baseUrl}}/admin/workshops`

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | No | Search by workshop title (case-insensitive) |
| `facilityId` | string | No | Filter by facility ID |
| `facultyId` | uuid | No | Filter by faculty ID (joins workshop_faculty table) |
| `deliveryMode` | enum | No | `in_person` or `online` |
| `status` | enum | No | `draft` or `published` |
| `offersCmeCredits` | string | No | `true` or `false` |
| `groupDiscountEnabled` | string | No | `true` or `false` |
| `upcoming` | string | No | `true` - workshops with dates in the future |
| `past` | string | No | `true` - workshops with all dates in the past |
| `hasRefundRequests` | string | No | `true` - workshops that have refund records |
| `page` | number | No | Page number (default: 1, min: 1) |
| `limit` | number | No | Items per page (default: 10, max: 50) |
| `sortBy` | enum | No | `createdAt` or `title` (default: `createdAt`) |
| `sortOrder` | enum | No | `asc` or `desc` (default: `desc`) |

#### Request Examples

**Example 1: Basic List**
```
GET {{baseUrl}}/admin/workshops?page=1&limit=10
```

**Example 2: Search with Title**
```
GET {{baseUrl}}/admin/workshops?q=leadership&page=1&limit=10
```

**Example 3: Filter by Upcoming Workshops**
```
GET {{baseUrl}}/admin/workshops?upcoming=true&page=1&limit=10
```

**Example 4: Filter by Past Workshops**
```
GET {{baseUrl}}/admin/workshops?past=true&page=1&limit=10
```

**Example 5: Filter by Refund Requests**
```
GET {{baseUrl}}/admin/workshops?hasRefundRequests=true&page=1&limit=10
```

**Example 6: Complex Filter - Published Online Workshops with Refund Requests**
```
GET {{baseUrl}}/admin/workshops?status=published&deliveryMode=online&hasRefundRequests=true&sortBy=title&sortOrder=asc&page=1&limit=20
```

**Example 7: Upcoming CME Credit Workshops at Specific Facility**
```
GET {{baseUrl}}/admin/workshops?upcoming=true&offersCmeCredits=true&facilityId=facility-123&page=1&limit=10
```

#### Success Response (200 OK)
```json
{
  "message": "Workshops fetched successfully",
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 45,
    "totalPages": 5
  },
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Advanced Leadership Skills",
      "shortBlurb": "Learn effective leadership strategies",
      "coverImageUrl": "https://...",
      "status": "published",
      "deliveryMode": "in_person",
      "facilityIds": ["fac-001", "fac-002"],
      "standardBaseRate": "299.99",
      "capacity": 50,
      "offersCmeCredits": true,
      "groupDiscountEnabled": true,
      "learningObjectives": "...",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-20T14:45:00Z",
      "days": [
        {
          "id": "day-001",
          "date": "2026-05-15",
          "dayNumber": 1,
          "segments": [
            {
              "id": "seg-001",
              "courseTopic": "Introduction to Leadership",
              "startTime": "08:00:00",
              "endTime": "10:00:00"
            }
          ]
        }
      ],
      "groupDiscounts": [
        {
          "id": "gd-001",
          "minimumAttendees": 5,
          "groupRatePerPerson": "249.99"
        }
      ]
    }
  ]
}
```

#### Error Responses

**401 Unauthorized**
```json
{
  "message": "Unauthorized",
  "statusCode": 401
}
```

**403 Forbidden (Non-Admin User)**
```json
{
  "message": "Forbidden resource",
  "statusCode": 403
}
```

**400 Bad Request (Invalid Query Parameter)**
```json
{
  "message": "Validation failed",
  "error": "limit must not be greater than 50",
  "statusCode": 400
}
```

---

### 2. Get Single Workshop Details
**GET** `{{baseUrl}}/admin/workshops/:id`

#### URL Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | uuid | Yes | Workshop ID |

#### Request Example
```
GET {{baseUrl}}/admin/workshops/550e8400-e29b-41d4-a716-446655440000
```

#### Success Response (200 OK)
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Advanced Leadership Skills",
  "shortBlurb": "Learn effective leadership strategies",
  "coverImageUrl": "https://...",
  "status": "published",
  "deliveryMode": "in_person",
  "facilityIds": ["fac-001"],
  "standardBaseRate": "299.99",
  "capacity": 50,
  "alertAt": 10,
  "offersCmeCredits": true,
  "groupDiscountEnabled": true,
  "learningObjectives": "Participants will learn...",
  "days": [...],
  "groupDiscounts": [...],
  "faculty": [...],
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-20T14:45:00Z"
}
```

#### Error Responses

**404 Not Found**
```json
{
  "message": "Workshop not found",
  "statusCode": 404
}
```

---

### 3. Create Workshop
**POST** `{{baseUrl}}/admin/workshops`

#### Request Body
```json
{
  "title": "Advanced Leadership Skills",
  "shortBlurb": "Learn effective leadership strategies",
  "coverImageUrl": "https://example.com/image.jpg",
  "status": "published",
  "deliveryMode": "in_person",
  "facilityIds": ["fac-001", "fac-002"],
  "standardBaseRate": "299.99",
  "capacity": 50,
  "alertAt": 10,
  "offersCmeCredits": true,
  "groupDiscountEnabled": true,
  "learningObjectives": "Participants will learn...",
  "webinarPlatform": null,
  "meetingLink": null,
  "meetingPassword": null,
  "autoRecordSession": false,
  "days": [
    {
      "date": "2026-05-15",
      "dayNumber": 1,
      "segments": [
        {
          "courseTopic": "Introduction",
          "startTime": "08:00 AM",
          "endTime": "10:00 AM"
        }
      ]
    }
  ],
  "groupDiscounts": [
    {
      "minimumAttendees": 5,
      "groupRatePerPerson": "249.99"
    }
  ]
}
```

#### Success Response (201 Created)
Returns the created workshop object with ID.

---

### 4. Update Workshop
**PUT** `{{baseUrl}}/admin/workshops/:id`

#### URL Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | uuid | Yes | Workshop ID |

#### Request Body
Same structure as Create Workshop (all fields optional for update).

#### Success Response (200 OK)
Returns the updated workshop object.

---

### 5. List Workshop Enrollees
**GET** `{{baseUrl}}/admin/workshops/:workshopId/enrollees`

#### URL Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workshopId` | uuid | Yes | Workshop ID |

#### Query Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by enrollee status |
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 10, max: 50) |

#### Request Example
```
GET {{baseUrl}}/admin/workshops/550e8400-e29b-41d4-a716-446655440000/enrollees?page=1&limit=20
```

#### Success Response (200 OK)
```json
{
  "message": "Enrollees fetched successfully",
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  },
  "data": [
    {
      "id": "enrollee-001",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "status": "completed",
      "reservationId": "res-001",
      "cmeCreditsAwarded": 6
    }
  ]
}
```

---

### 6. Get Refund Preview
**GET** `{{baseUrl}}/admin/workshops/:workshopId/enrollees/:reservationId/refund-preview`

#### URL Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workshopId` | uuid | Yes | Workshop ID |
| `reservationId` | uuid | Yes | Reservation ID |

#### Request Example
```
GET {{baseUrl}}/admin/workshops/550e8400-e29b-41d4-a716-446655440000/enrollees/res-001/refund-preview
```

#### Success Response (200 OK)
```json
{
  "reservationId": "res-001",
  "originalAmount": "299.99",
  "refundableAmount": "249.99",
  "refundPercentage": 83.33,
  "reason": "Schedule conflict",
  "cancellationDeadline": "2026-05-10T23:59:59Z"
}
```

---

### 7. Confirm Refund
**POST** `{{baseUrl}}/admin/workshops/:workshopId/refunds/confirm`

#### URL Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workshopId` | uuid | Yes | Workshop ID |

#### Request Body
```json
{
  "reservationId": "res-001",
  "refundType": "FULL",
  "refundAmount": "299.99",
  "adjustmentNote": "Full refund approved",
  "paymentGateway": "stripe",
  "transactionId": "txn_123456789"
}
```

#### Success Response (200 OK)
```json
{
  "message": "Refund processed successfully",
  "refundId": "ref-001",
  "workshopId": "550e8400-e29b-41d4-a716-446655440000",
  "reservationId": "res-001",
  "refundAmount": "299.99",
  "status": "PROCESSED",
  "processedAt": "2024-01-21T10:30:00Z"
}
```

---

### 8. Delete Workshop
**DELETE** `{{baseUrl}}/admin/workshops/:id`

#### URL Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | uuid | Yes | Workshop ID |

#### Request Example
```
DELETE {{baseUrl}}/admin/workshops/550e8400-e29b-41d4-a716-446655440000
```

#### Success Response (200 OK)
```json
{
  "message": "Workshop deleted successfully"
}
```

#### Error Response (404)
```json
{
  "message": "Workshop not found",
  "statusCode": 404
}
```

---

## Filter Combinations

### Use Case 1: Find Upcoming Workshops with CME Credits
```
GET {{baseUrl}}/admin/workshops?upcoming=true&offersCmeCredits=true&sortBy=createdAt&sortOrder=desc
```

### Use Case 2: Find Past Workshops with Refunds
```
GET {{baseUrl}}/admin/workshops?past=true&hasRefundRequests=true&page=1&limit=20
```

### Use Case 3: Find Published Upcoming Workshops at Specific Facility
```
GET {{baseUrl}}/admin/workshops?status=published&upcoming=true&facilityId=fac-001&limit=15
```

### Use Case 4: Search and Filter
```
GET {{baseUrl}}/admin/workshops?q=leadership&deliveryMode=online&upcoming=true&page=1&limit=10
```

---

## Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Missing JWT token | Include valid JWT token in Authorization header |
| 403 Forbidden | User is not admin | Ensure user has 'admin' role |
| 400 Bad Request | Invalid enum value | Check deliveryMode, status values |
| 400 Bad Request | Limit > 50 | Reduce limit to maximum 50 |
| 404 Not Found | Workshop doesn't exist | Verify workshop ID |

---

## Notes

- **Date Filters**: `upcoming` and `past` filters use `CURRENT_DATE` (no time component)
- **Refund Filter**: `hasRefundRequests=true` returns workshops with any refund records
- **Pagination**: Always include `page` and `limit` for consistency
- **Search**: Query parameter `q` is case-insensitive
- **Sorting**: Default sort is by `createdAt` in descending order
