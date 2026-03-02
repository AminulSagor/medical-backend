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
| GET | `/admin/workshops` | List workshops (paginated) | ListWorkshopsQueryDto |

**Workshop Structure:**
```json
{
  "deliveryMode": "in_person | online",
  "title": "string (max 220)",
  "facilityId": "UUID",
  "capacity": "integer (min 1)",
  "alertAt": "integer (min 0)",
  "registrationDeadline": "string (YYYY-MM-DD)",
  "offersCmeCredits": "boolean",
  "shortBlurb": "string (optional)",
  "coverImageUrl": "string (optional)",
  "learningObjectives": "string (optional)",
  "cmeCreditsInfo": "string (optional)",
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
- `offersCmeCredits`: true | false
- `groupDiscountEnabled`: true | false
- `page`: integer (default: 1)
- `limit`: integer (max 50, default: 10)
- `sortBy`: createdAt | title (default: createdAt)
- `sortOrder`: asc | desc (default: desc)

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
- **CreateWorkshopDto**: deliveryMode, title, facilityId, capacity, alertAt, registrationDeadline, offersCmeCredits, + optional nested objects
- **ListWorkshopsQueryDto**: q, facilityId, facultyId, deliveryMode, offersCmeCredits, groupDiscountEnabled, page, limit, sortBy, sortOrder

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

### 4. Account Management
1. PATCH `/admin/users/adminProfile/settings/email` → Update email
2. PATCH `/admin/users/adminProfile/settings/password` → Change password

### 5. Password Reset Flow
1. POST `/auth/send-otp` → Request OTP
2. POST `/auth/verify-otp` → Verify code
3. PUT `/auth/reset-password` → Set new password

---

## File References

- **Collection JSON**: `Medical-Backend-API.postman_collection.json`
- **Documentation**: `POSTMAN_GUIDE.md` (this directory/)
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

**Last Updated:** March 1, 2026
**API Version:** 1.0.0
**Status:** ✅ Running Successfully

