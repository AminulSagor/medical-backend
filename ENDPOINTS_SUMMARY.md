# Medical Backend API - Endpoints Summary

## Quick Reference

### Base URL
```
http://localhost:3000
```

### Authentication
- JWT Bearer token required for all admin endpoints
- Generate token via `/auth/login`
- Add to headers: `Authorization: Bearer {token}`

---

## Endpoint Structure

### 🔓 PUBLIC ENDPOINTS (No Auth Required)

#### Auth Module
| Method | Endpoint | Description | DTO Input |
|--------|----------|-------------|-----------|
| POST | `/auth/register` | Register new admin | RegisterDto |
| POST | `/auth/login` | Login and get JWT | LoginDto |
| POST | `/auth/send-otp` | Send password reset OTP | SendOtpDto |
| POST | `/auth/verify-otp` | Verify OTP code | VerifyOtpDto |
| PUT | `/auth/reset-password` | Reset password | ResetPasswordDto |

**Response Type:** JSON with message, statusCode, and data

---

### 🔐 PROTECTED ENDPOINTS (Admin Auth Required)

#### Users Module - `/admin/users`
| Method | Endpoint | Description | DTO Input |
|--------|----------|-------------|-----------|
| GET | `/admin/users` | List all users | - |
| PATCH | `/admin/users/adminProfile/settings/email` | Update admin email | UpdateAdminEmailDto |
| PATCH | `/admin/users/adminProfile/settings/password` | Change password | ChangeAdminPasswordDto |

#### User Self Profile Module - `/users/profile`
| Method | Endpoint | Description | DTO Input |
|--------|----------|-------------|-----------|
| GET | `/users/profile` | Get authenticated user's profile | - |
| PATCH | `/users/profile` | Update authenticated user's profile (email is read-only) | UpdateMyProfileDto |
| PATCH | `/users/password` | Change authenticated user's password | ChangePasswordDto |

**Self Profile Response Shape:**
```json
{
  "profilePicture": "string | null",
  "firstName": "string | null",
  "lastName": "string | null",
  "emailAddress": "string",
  "phoneNumber": "string | null",
  "title": "string | null",
  "role": "string",
  "institutionOrHospital": "string | null",
  "npiNumber": "string | null"
}
```

**Self Profile Update Body (PATCH /users/profile):**
```json
{
  "profilePicture": "https://example.com/profile.jpg",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+1-555-0123",
  "title": "MD",
  "role": "Cardiologist",
  "institutionOrHospital": "General Hospital",
  "npiNumber": "1234567890"
}
```

**Password Change Body (PATCH /users/password):**
```json
{
  "currentPassword": "SecurePass123",
  "newPassword": "NewSecurePass789"
}
```

#### Categories Module - `/admin/categories`
| Method | Endpoint | Description | DTO Input |
|--------|----------|-------------|-----------|
| POST | `/admin/categories` | Create category | CreateCategoryDto |
| GET | `/admin/categories` | List categories | - |

**Category Structure:**
```json
{
  "name": "string (max 120 chars)"
}
```

#### Products Module - `/admin/products`
| Method | Endpoint | Description | DTO Input |
|--------|----------|-------------|-----------|
| POST | `/admin/products` | Create product | CreateProductDto |
| GET | `/admin/products` | List products (paginated) | GetProductsQueryDto |
| PATCH | `/admin/products/:id` | Update product | UpdateProductDto |

**Product Structure:**
```json
{
  "name": "string (max 200)",
  "clinicalDescription": "string",
  "clinicalBenefits": [
    {
      "icon": "string",
      "title": "string",
      "description": "string"
    }
  ],
  "technicalSpecifications": [
    {
      "name": "string",
      "value": "string"
    }
  ],
  "categoryId": "UUID",
  "actualPrice": "string (numeric)",
  "offerPrice": "string (numeric)",
  "sku": "string (max 80)",
  "stockQuantity": "integer",
  "lowStockAlert": "integer",
  "isActive": "boolean",
  "tags": ["string array"],
  "images": ["string array"],
  "bulkPriceTiers": [
    {
      "minQty": "integer (min 1)",
      "price": "string (numeric)"
    }
  ]
}
```

**Query Parameters (GET /admin/products):**
- `page`: integer (default: 1)
- `limit`: integer (min 1, max 100, default: 10)
- `search`: string (search by name)
- `category`: string (filter by name or "All")
- `tab`: enum (all, active, out_of_stock, low_stock)

#### Faculty Module - `/admin/faculty`
| Method | Endpoint | Description | DTO Input |
|--------|----------|-------------|-----------|
| POST | `/admin/faculty` | Create faculty | CreateFacultyDto |
| GET | `/admin/faculty` | List faculty (paginated) | - |

**Faculty Structure:**
```json
{
  "firstName": "string",
  "lastName": "string",
  "phoneNumber": "string",
  "email": "string (email)",
  "npiNumber": "string (exactly 10 chars)",
  "assignedRole": "string",
  "imageUrl": "string (optional)",
  "primaryClinicalRole": "string (optional)",
  "medicalDesignation": "string (optional)",
  "institutionOrHospital": "string (optional)"
}
```

**Query Parameters (GET /admin/faculty):**
- `q`: string (search by name/email)
- `page`: integer (default: 1)
- `limit`: integer (default: 10)

#### Facilities Module - `/admin/facilities`
| Method | Endpoint | Description | DTO Input |
|--------|----------|-------------|-----------|
| POST | `/admin/facilities` | Create facility | CreateFacilityDto |
| GET | `/admin/facilities` | List facilities | - |

**Facility Structure:**
```json
{
  "name": "string (max 200)",
  "address": "string (max 400)"
}
```

#### Workshops Module - `/admin/workshops`
| Method | Endpoint | Description | DTO Input |
|--------|----------|-------------|-----------|
| POST | `/admin/workshops` | Create workshop | CreateWorkshopDto |
| PUT | `/admin/workshops/:id` | Update workshop | UpdateWorkshopDto |
| GET | `/admin/workshops/:id` | Get workshop details | - |
| GET | `/admin/workshops` | List workshops (paginated) | ListWorkshopsQueryDto |

**Workshop Structure:**
```json
{
  "deliveryMode": "in_person | online",
  "status": "draft | published (optional, default: draft)",
  "title": "string (max 220)",
  "shortBlurb": "string (optional)",
  "coverImageUrl": "string (optional)",
  "learningObjectives": "string (optional)",
  "facilityIds": ["UUID", "UUID"],
  "webinarPlatform": "string (optional, online workshops)",
  "meetingLink": "string (optional, online workshops)",
  "meetingPassword": "string (optional, online workshops)",
  "autoRecordSession": "boolean (optional)",
  "capacity": "integer (min 1)",
  "alertAt": "integer (min 0)",
  "standardBaseRate": "string (numeric)",
  "groupDiscountEnabled": "boolean",
  "offersCmeCredits": "boolean",
  "facultyIds": ["UUID"],
  "days": [
    {
      "date": "string (YYYY-MM-DD)",
      "dayNumber": "integer (min 1)",
      "segments": [
        {
          "segmentNumber": "integer (min 1)",
          "courseTopic": "string (max 220)",
          "topicDetails": "string",
          "startTime": "string (HH:MM AM/PM)",
          "endTime": "string (HH:MM AM/PM)"
        }
      ]
    }
  ],
  "groupDiscounts": [
    {
      "minimumAttendees": "integer (min 1)",
      "groupRatePerPerson": "string (numeric)"
    }
  ]
}
```

**Query Parameters (GET /admin/workshops):**
- `q`: string (search by title)
- `facilityId`: UUID
- `facultyId`: UUID
- `deliveryMode`: in_person | online
- `status`: draft | published
- `offersCmeCredits`: true | false
- `groupDiscountEnabled`: true | false
- `page`: integer (default: 1)
- `limit`: integer (max 50, default: 10)
- `sortBy`: createdAt | title (default: createdAt)
- `sortOrder`: asc | desc (default: desc)

#### Workshop Discovery & Booking Module - `/workshops`

This flow is used by authenticated users to select workshops, prepare attendee details, and complete booking.

| Method | Endpoint | Auth | Description | DTO Input |
|--------|----------|------|-------------|-----------|
| GET | `/workshops` | Public | List published workshops for users | PublicListWorkshopsQueryDto |
| GET | `/workshops/:id` | Public | Get public workshop details | - |
| POST | `/workshops/checkout/order-summary` | JWT | Create pricing + attendee summary before booking | CheckoutOrderSummaryDto |
| GET | `/workshops/checkout/order-summary/:id` | JWT | Read one order summary by ID | - |
| POST | `/workshops/reservations` | JWT | Confirm booking using attendee IDs from order summary | CreateReservationDto |

**Query Parameters (GET /workshops):**
- `deliveryMode`: in_person | online
- `offersCmeCredits`: true | false
- `hasAvailableSeats`: true | false
- `page`: integer (default: 1)
- `limit`: integer (max 50, default: 10)
- `sortBy`: date | price | title (default: date)
- `sortOrder`: asc | desc (default: asc)

**Checkout Body (POST /workshops/checkout/order-summary):**
```json
{
  "workshopId": "uuid",
  "attendees": [
    {
      "fullName": "Dr. John Smith",
      "professionalRole": "Cardiologist",
      "npiNumber": "1234567890",
      "email": "john.smith@hospital.com"
    }
  ]
}
```

**Reservation Body (POST /workshops/reservations):**
```json
{
  "workshopId": "uuid",
  "attendeeIds": ["order-attendee-uuid-1", "order-attendee-uuid-2"]
}
```

**Booking Lifecycle Statuses (Current Implementation):**
1. Workshop: `draft` -> `published`
2. Order summary: `pending` -> `completed` (or `expired`)
3. Reservation: created as `confirmed` (state enum also supports `pending`, `cancelled`)

#### Attendance Module - Current State and Recommended Contract

There is currently no dedicated attendance endpoint in this codebase.

Current roster source:
- Use reservation attendees returned by `POST /workshops/reservations`
- Attendees are persisted in `workshop_attendees` linked to each reservation

Recommended attendance endpoints (for future implementation):

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/admin/workshops/:workshopId/attendance/roster` | Admin JWT | View booking roster for attendance taking |
| PATCH | `/admin/workshops/:workshopId/attendance/attendees/:attendeeId` | Admin JWT | Mark one attendee (present/late/absent) |
| POST | `/admin/workshops/:workshopId/attendance/bulk` | Admin JWT | Bulk mark multiple attendees |
| GET | `/admin/workshops/:workshopId/attendance/summary` | Admin JWT | Attendance metrics and totals |

Recommended attendance statuses:
- `not_marked`
- `present`
- `late`
- `absent`
- `excused`

---

## DTOs at a Glance

### Auth DTOs
- **RegisterDto**: fullLegalName, medicalEmail, professionalRole, password, forgetPassword (false)
- **LoginDto**: email, password
- **SendOtpDto**: email
- **VerifyOtpDto**: email, otp
- **ResetPasswordDto**: email, password, forgetPassword (true)

### User DTOs
- **UpdateAdminEmailDto**: newEmail
- **ChangeAdminPasswordDto**: currentPassword, newPassword
- **UpdateMyProfileDto**: profilePicture, firstName, lastName, phoneNumber, title, role, institutionOrHospital, npiNumber
- **ChangePasswordDto**: currentPassword, newPassword

### Category DTOs
- **CreateCategoryDto**: name

### Product DTOs
- **CreateProductDto**: name, clinicalDescription, clinicalBenefits[], technicalSpecifications[], categoryId, + optional fields
- **UpdateProductDto**: all fields optional
- **GetProductsQueryDto**: page, limit, search, category, tab

### Faculty DTOs
- **CreateFacultyDto**: firstName, lastName, phoneNumber, email, npiNumber, assignedRole, + optional fields

### Facility DTOs
- **CreateFacilityDto**: name, address

### Workshop DTOs
- **CreateWorkshopDto**: deliveryMode, status (optional), title, offersCmeCredits, facilityIds[], capacity, alertAt, standardBaseRate, groupDiscountEnabled, days[], + optional fields (facultyIds, groupDiscounts, online settings)
- **UpdateWorkshopDto**: all workshop fields optional for update
- **ListWorkshopsQueryDto**: q, facilityId, facultyId, deliveryMode, offersCmeCredits, groupDiscountEnabled, page, limit, sortBy, sortOrder
- **PublicListWorkshopsQueryDto**: deliveryMode, offersCmeCredits, hasAvailableSeats, page, limit, sortBy, sortOrder
- **CheckoutOrderSummaryDto**: workshopId, attendees[]
- **AddAttendeeDto**: fullName, professionalRole, npiNumber (optional), email
- **CreateReservationDto**: workshopId, attendeeIds[]

---

## Validation Rules

### General Rules
- All emails must be valid email format
- All UUID fields must be valid UUIDs
- All numeric prices are stored as strings for precision
- All dates are ISO 8601 format or YYYY-MM-DD
- All timestamps are UTC timezone

### Specific Validations
| Field | Type | Rules |
|-------|------|-------|
| fullLegalName | string | Max 200 chars |
| medicalEmail | string | Valid email, max 320 chars |
| professionalRole | string | Max 150 chars |
| password | string | Min 6 chars, max 72 chars |
| Category name | string | Max 120 chars |
| Product name | string | Max 200 chars |
| Product SKU | string | Max 80 chars |
| Workshop title | string | Max 220 chars |
| Faculty NPI | string | Exactly 10 chars |
| OTP code | string | Exactly 6 chars |
| Facility name | string | Max 200 chars |
| Facility address | string | Max 400 chars |

---

## Response Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| 200 | OK | Successful GET/PATCH requests |
| 201 | Created | Successful POST requests |
| 400 | Bad Request | Invalid input data or validation failure |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | User lacks required role (not admin) |
| 404 | Not Found | Resource doesn't exist |
| 500 | Server Error | Unexpected server error |

---

## Error Handling

All errors follow this format:
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

---

## Common Workflows

### 1. Complete Admin Setup
1. POST `/auth/register` → Create admin account
2. POST `/auth/login` → Get JWT token
3. Save token to `accessToken` variable
4. Use token in all subsequent requests

### 2. Create Product Catalog
1. POST `/admin/categories` → Create categories
2. POST `/admin/products` → Create products (reference categories)
3. GET `/admin/products` → Verify products created
4. PATCH `/admin/products/:id` → Update as needed

### 3. Setup Workshop
1. POST `/admin/facilities` → Create facility
2. POST `/admin/faculty` → Create faculty members (optional)
3. POST `/admin/workshops` → Create workshop (reference facility)
4. GET `/admin/workshops` → List and verify

### 4. Workshop Booking to Attendance (Current Flow)
1. GET `/workshops` → User browses published workshops
2. GET `/workshops/:id` → User reviews workshop detail + seats/pricing
3. POST `/workshops/checkout/order-summary` → User submits attendee info
4. GET `/workshops/checkout/order-summary/:id` → User reviews order summary
5. POST `/workshops/reservations` → Confirm reservation from attendee IDs
6. Use returned reservation attendees as attendance roster (until attendance endpoints are added)

### 5. Account Management
1. PATCH `/admin/users/adminProfile/settings/email` → Update email
2. PATCH `/admin/users/adminProfile/settings/password` → Change password

### 6. User Self Profile
1. GET `/users/profile` → Get your profile details
2. PATCH `/users/profile` → Update your profile (email cannot be edited)
3. PATCH `/users/password` → Change your password

### 7. Password Reset Flow
1. POST `/auth/send-otp` → Request OTP
2. POST `/auth/verify-otp` → Verify code
3. PUT `/auth/reset-password` → Set new password

---

## File References

- **Collection JSON**: `Medical-Backend-API.postman_collection.json`
- **Documentation**: `POSTMAN_GUIDE.md` (this directory/)
- **User Self Profile Details**: `USER_PROFILE_DETAILS.md`
- **User Password Change Details**: `USER_PASSWORD_CHANGE_DETAILS.md`
- **Source Code**: `src/` (TypeScript source files)

---

## Testing Checklist

- [ ] Register new user
- [ ] Login and save token
- [ ] Create category
- [ ] Create product with category reference
- [ ] List products with filters
- [ ] Update product details
- [ ] Create facility
- [ ] Create faculty member
- [ ] Create workshop
- [ ] List workshops with different filters
- [ ] Get public workshops list (`/workshops`)
- [ ] Get one public workshop (`/workshops/:id`)
- [ ] Create order summary with attendees (`/workshops/checkout/order-summary`)
- [ ] Fetch order summary by ID (`/workshops/checkout/order-summary/:id`)
- [ ] Create reservation from attendee IDs (`/workshops/reservations`)
- [ ] Verify reservation attendees can be used as attendance roster
- [ ] Get self profile (`/users/profile`)
- [ ] Update self profile (`/users/profile`)
- [ ] Change user password (`/users/password`)
- [ ] Update admin email
- [ ] Change admin password
- [ ] Test pagination on list endpoints
- [ ] Test search/filter parameters
- [ ] Verify error handling with invalid data
- [ ] Test with expired/invalid JWT token

---

## Environment Variables

For `.env` configuration:
```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=medical_db
PORT=3000
NODE_ENV=development
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=7d
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_email_password
SMTP_FROM=your_email@gmail.com
```

---

**Last Updated:** April 6, 2026
**API Version:** 1.0.0
**Status:** ✅ Running Successfully

