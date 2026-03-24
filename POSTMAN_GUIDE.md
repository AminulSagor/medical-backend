# Medical Backend API - Postman Collection Guide

## Overview
This Postman collection contains all endpoints for the Medical Backend API. The collection includes:
- **5 Auth Endpoints** - Register, Login, OTP management, Password reset
- **3 User/Admin Endpoints** - List users, Update email, Change password
- **2 Category Endpoints** - Create category, List categories
- **3 Product Endpoints** - Create product, List products, Update product
- **2 Faculty Endpoints** - Create faculty, List faculty
- **2 Facility Endpoints** - Create facility, List facilities
- **2 Workshop Endpoints** - Create workshop, List workshops
- **4 Public Product Endpoints** - Get categories, List products, Product details, Cart calculation
- **2 Public Blog Endpoints** - List latest blogs, Get blog details

**Total: 25 Endpoints**

---

## Setup Instructions

### 1. Import Collection
- Open Postman
- Click "Import" button
- Select the file: `Medical-Backend-API.postman_collection.json`
- The collection will be imported with all folders and requests

### 2. Configure Environment Variables
The collection uses two environment variables:

**In Postman:**
- Click the "..." next to the collection name
- Select "Edit"
- Go to "Variables" tab

**Variables to set:**
- `baseUrl`: `http://localhost:3000` (or your API URL)
- `accessToken`: Will be auto-populated after login

---

## Authentication Flow

### Step 1: Register
**Endpoint:** `POST /auth/register`

```json
{
  "fullLegalName": "Dr. John Smith",
  "medicalEmail": "john.smith@hospital.com",
  "professionalRole": "Surgeon",
  "password": "SecurePass123",
  "forgetPassword": false
}
```

**Response:**
```json
{
  "message": "User registration successfully",
  "statusCode": 201,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "fullLegalName": "Dr. John Smith",
    "medicalEmail": "john.smith@hospital.com",
    "professionalRole": "Surgeon",
    "role": "admin",
    "createdAt": "2026-03-01T10:00:00Z"
  }
}
```

### Step 2: Login
**Endpoint:** `POST /auth/login`

```json
{
  "email": "john.smith@hospital.com",
  "password": "SecurePass123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "statusCode": 200,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "fullLegalName": "Dr. John Smith",
      "medicalEmail": "john.smith@hospital.com",
      "role": "admin"
    }
  }
}
```

**Save the access_token:**
1. After login, copy the `access_token` from response
2. Go to collection variables
3. Paste it in the `accessToken` variable

### Step 3: Use Token in Requests
All protected endpoints require the Authorization header:
```
Authorization: Bearer {{accessToken}}
```

---

## Auth Endpoints

### 1. Register User
- **Method:** POST
- **URL:** `/auth/register`
- **Auth Required:** No
- **Request Body:**
  - `fullLegalName` (string, max 200) - REQUIRED
  - `medicalEmail` (string, email) - REQUIRED
  - `professionalRole` (string, max 150) - REQUIRED
  - `password` (string, 6-72 chars) - REQUIRED
  - `forgetPassword` (boolean) - REQUIRED (must be false)

### 2. Login
- **Method:** POST
- **URL:** `/auth/login`
- **Auth Required:** No
- **Request Body:**
  - `email` (string, email) - REQUIRED
  - `password` (string, min 6 chars) - REQUIRED
- **Returns:** JWT access token

### 3. Send OTP (Password Reset)
- **Method:** POST
- **URL:** `/auth/send-otp`
- **Auth Required:** No
- **Request Body:**
  - `email` (string, email) - REQUIRED
- **Purpose:** Send OTP code to email for password reset

### 4. Verify OTP
- **Method:** POST
- **URL:** `/auth/verify-otp`
- **Auth Required:** No
- **Request Body:**
  - `email` (string, email) - REQUIRED
  - `otp` (string, exactly 6 chars) - REQUIRED
- **Purpose:** Verify OTP before resetting password

### 5. Reset Password
- **Method:** PUT
- **URL:** `/auth/reset-password`
- **Auth Required:** No
- **Request Body:**
  - `email` (string, email) - REQUIRED
  - `password` (string, min 6 chars) - REQUIRED
  - `forgetPassword` (boolean) - REQUIRED (must be true)
- **Purpose:** Set new password after OTP verification

---

## User/Admin Endpoints (Protected - Admin role required)

### 1. List All Users
- **Method:** GET
- **URL:** `/admin/users`
- **Auth:** JWT Bearer token (Admin role)
- **Query Params:** None
- **Returns:** Array of all users

### 2. Update Admin Email
- **Method:** PATCH
- **URL:** `/admin/users/adminProfile/settings/email`
- **Auth:** JWT Bearer token (Admin role)
- **Request Body:**
  - `newEmail` (string, email) - REQUIRED

### 3. Change Admin Password
- **Method:** PATCH
- **URL:** `/admin/users/adminProfile/settings/password`
- **Auth:** JWT Bearer token (Admin role)
- **Request Body:**
  - `currentPassword` (string) - REQUIRED
  - `newPassword` (string, min 8 chars) - REQUIRED

---

## Category Endpoints (Protected - Admin role required)

### 1. Create Category
- **Method:** POST
- **URL:** `/admin/categories`
- **Auth:** JWT Bearer token (Admin role)
- **Request Body:**
  - `name` (string, max 120) - REQUIRED
- **Returns:** Created category with ID

### 2. List Categories
- **Method:** GET
- **URL:** `/admin/categories`
- **Auth:** JWT Bearer token (Admin role)
- **Query Params:** None
- **Returns:** Array of all categories

---

## Product Endpoints (Protected - Admin role required)

### 1. Create Product
- **Method:** POST
- **URL:** `/admin/products`
- **Auth:** JWT Bearer token (Admin role)
- **Request Body:**
  - `name` (string, max 200) - REQUIRED
  - `clinicalDescription` (string) - REQUIRED
  - `clinicalBenefits` (array of objects, min 1) - REQUIRED
    - `icon` (string)
    - `title` (string)
    - `description` (string)
  - `technicalSpecifications` (array of objects, min 1) - REQUIRED
    - `name` (string)
    - `value` (string)
  - `categoryId` (UUID) - REQUIRED
  - `actualPrice` (string, numeric) - OPTIONAL
  - `offerPrice` (string, numeric) - OPTIONAL
  - `sku` (string, max 80) - OPTIONAL
  - `stockQuantity` (integer) - OPTIONAL
  - `lowStockAlert` (integer) - OPTIONAL
  - `isActive` (boolean) - OPTIONAL
  - `tags` (string array) - OPTIONAL
  - `images` (string array) - OPTIONAL
  - `frequentlyBoughtTogether` (UUID array) - OPTIONAL
  - `bundleUpsells` (UUID array) - OPTIONAL
  - `frontendBadges` (enum array) - OPTIONAL
  - `bulkPriceTiers` (array of objects) - OPTIONAL

### 2. List Products
- **Method:** GET
- **URL:** `/admin/products`
- **Auth:** JWT Bearer token (Admin role)
- **Query Parameters:**
  - `page` (integer, min 1, default 1)
  - `limit` (integer, min 1, max 100, default 10)
  - `search` (string) - Search by product name
  - `category` (string) - Filter by category name or "All"
  - `tab` (enum: all, active, out_of_stock, low_stock, default: all)
- **Returns:** Paginated product list

### 3. Update Product
- **Method:** PATCH
- **URL:** `/admin/products/:id`
- **Auth:** JWT Bearer token (Admin role)
- **Path Parameters:**
  - `id` (UUID) - Product ID
- **Request Body:** All fields optional
  - `name` (string)
  - `clinicalDescription` (string)
  - `categoryId` (UUID)
  - `actualPrice` (string)
  - `offerPrice` (string)
  - `stockQuantity` (integer)
  - `isActive` (boolean)
  - And more fields for partial updates

---

## Public Product Endpoints (No authentication required)

### 1. Get Categories with Product Count
- **Method:** GET
- **URL:** `/public/products/categories`
- **Auth:** None (Public endpoint)
- **Returns:** 
  - `categories`: Array of category objects with:
    - `id`: Category UUID
    - `name`: Category name
    - `productCount`: Total active products in category
    - `products`: Array of up to 4 sample products with:
      - `id`: Product ID
      - `photo`: First product image URL
      - `category`: Category name
      - `title`: Product name
      - `description`: Clinical description
      - `price`: Actual price
      - `discountedPrice`: Offer price
  - `brands`: Array of unique brand names

### 2. List Products with Filters
- **Method:** GET
- **URL:** `/public/products`
- **Auth:** None (Public endpoint)
- **Query Parameters (all optional):**
  - `page` (integer, min 1, default: 1) - Page number
  - `limit` (integer, min 1, default: 12) - Items per page
  - `search` (string) - Search in name, SKU, description
  - `categoryIds` (array of UUIDs) - Filter by category IDs (can add multiple)
  - `brands` (array of strings) - Filter by brands (can add multiple)
  - `minPrice` (number string) - Minimum price filter
  - `maxPrice` (number string) - Maximum price filter
  - `sortBy` (enum) - Sort options:
    - `price-asc`: Price low to high
    - `price-desc`: Price high to low
    - `name-asc`: Name A-Z
    - `name-desc`: Name Z-A
    - `newest`: Most recent (default)
- **Returns:** 
  - `items`: Array of product objects with:
    - `id`: Product ID
    - `photo`: First product image
    - `category`: Category name(s)
    - `title`: Product name
    - `description`: Clinical description
    - `price`: Actual price
    - `discountedPrice`: Offer price
    - `brand`: Brand name
    - `inStock`: Boolean stock status
  - `meta`: Pagination metadata
    - `page`: Current page
    - `limit`: Items per page
    - `total`: Total items
    - `totalPages`: Total pages

### 3. Get Product Details
- **Method:** GET
- **URL:** `/public/products/:id`
- **Auth:** None (Public endpoint)
- **Path Parameters:**
  - `id` (UUID) - Product ID
- **Returns:** Complete product details including:
  - Basic info: `id`, `name`, `brand`, `sku`, `clinicalDescription`
  - Categories: Array of category objects with `id` and `name`
  - Tags: Array of product tags
  - Pricing: `actualPrice`, `offerPrice`, `bulkPriceTiers`
  - Stock: `stockQuantity`, `inStock`, `backorder`
  - Media: `images` (array), `frontendBadges` (array)
  - Clinical benefits: Array of benefit objects with `icon`, `title`, `description`
  - Technical specifications: Array of spec objects with `name`, `value`
  - Related products: `frequentlyBoughtTogether`, `bundleUpsells`
  - Timestamps: `createdAt`, `updatedAt`

### 4. Calculate Cart
- **Method:** POST
- **URL:** `/public/products/cart/calculate`
- **Auth:** None (Public endpoint)
- **Request Body (CartRequestDto):**
  ```json
  {
    "items": [
      {
        "productId": "750e8400-e29b-41d4-a716-446655440005",
        "quantity": 2
      }
    ]
  }
  ```
  - `items` (array) - REQUIRED, must not be empty
    - `productId` (UUID) - REQUIRED
    - `quantity` (integer, min 1) - REQUIRED
- **Validation Rules:**
  - Items array must contain at least one item
  - Each productId must be a valid UUID
  - Each quantity must be at least 1
  - All products must exist in the database
- **Returns:**
  - `items`: Array of cart items with:
    - `productId`: Product UUID
    - `photo`: First product image
    - `name`: Product name
    - `sku`: Product SKU
    - `inStock`: Boolean stock status
    - `price`: Offer price or actual price
    - `quantity`: Quantity ordered
    - `itemTotal`: Price × quantity
  - `orderSummary`:
    - `subtotal`: Sum of all item totals
    - `estimatedTax`: 10% of subtotal
    - `orderTotal`: subtotal + estimatedTax

**DTO Validation Examples:**

✅ **Valid Request:**
```json
{
  "items": [
    {
      "productId": "750e8400-e29b-41d4-a716-446655440005",
      "quantity": 2
    }
  ]
}
```

❌ **Invalid - Missing items:**
```json
{}
// Error: "items must be an array", "items should not be empty"
```

❌ **Invalid - Quantity less than 1:**
```json
{
  "items": [
    {
      "productId": "750e8400-e29b-41d4-a716-446655440005",
      "quantity": 0
    }
  ]
}
// Error: "quantity must not be less than 1"
```

❌ **Invalid - Invalid UUID:**
```json
{
  "items": [
    {
      "productId": "invalid-uuid",
      "quantity": 1
    }
  ]
}
// Error: "productId must be a UUID"
```

---

## Public Blog Endpoints (No authentication required)

### 1. List Latest Blogs
- **Method:** GET
- **URL:** `/public/blogs`
- **Auth:** None (Public endpoint)
- **Query Parameters (all optional):**
  - `page` (integer, min 1, default: 1) - Page number
  - `limit` (integer, min 1, default: 10) - Items per page
  - `search` (string) - Search in title, excerpt, content
  - `categoryId` (UUID) - Filter by category
  - `sortBy` (enum) - Sort options:
    - `latest`: Most recent (default)
    - `oldest`: Oldest first
    - `featured`: Featured posts first
- **Returns:** 
  - `items`: Array of blog posts with:
    - `id`: Blog post UUID
    - `title`: Blog post title
    - `description`: Excerpt or content preview (max 200 chars)
    - `coverImageUrl`: Cover image URL
    - `categories`: Array of category objects (`id`, `name`)
    - `authors`: Array of author objects with:
      - `id`: Author UUID
      - `fullLegalName`: Author full name
      - `professionalRole`: Professional role/title
      - `profilePhotoUrl`: Author profile photo URL
    - `readTimeMinutes`: Estimated reading time in minutes
    - `publishedAt`: Publication timestamp
    - `isFeatured`: Featured flag
  - `meta`: Pagination metadata (`page`, `limit`, `total`, `totalPages`)

**Use case:** Blog listing page, homepage blog section

### 2. Get Blog Post Details
- **Method:** GET
- **URL:** `/public/blogs/:id`
- **Auth:** None (Public endpoint)
- **Path Parameters:**
  - `id` (UUID) - Blog post ID
- **Returns:** Complete blog post details including:
  - Basic info: `id`, `title`, `content` (full HTML), `description`, `coverImageUrl`
  - Categories: Array of category objects
  - Tags: Array of tag objects with `id` and `name`
  - Authors: Array with profile photos and professional roles
  - Reading info: `readTimeMinutes`, `publishedAt`, `isFeatured`
  - SEO: `metaTitle`, `metaDescription`

**Note:** Only published blog posts are accessible through public endpoints

**Use case:** Blog detail/reading page

---

## Faculty Endpoints (Protected - Admin role required)

### 1. Create Faculty
- **Method:** POST
- **URL:** `/admin/faculty`
- **Auth:** JWT Bearer token (Admin role)
- **Request Body:**
  - `firstName` (string) - REQUIRED
  - `lastName` (string) - REQUIRED
  - `phoneNumber` (string) - REQUIRED
  - `email` (string, email) - REQUIRED
  - `npiNumber` (string, exactly 10 chars) - REQUIRED
  - `assignedRole` (string) - REQUIRED
  - `imageUrl` (string) - OPTIONAL
  - `primaryClinicalRole` (string) - OPTIONAL
  - `medicalDesignation` (string) - OPTIONAL
  - `institutionOrHospital` (string) - OPTIONAL

### 2. List Faculty
- **Method:** GET
- **URL:** `/admin/faculty`
- **Auth:** JWT Bearer token (Admin role)
- **Query Parameters:**
  - `q` (string) - Search by name or email
  - `page` (integer, default 1)
  - `limit` (integer, default 10)
- **Returns:** Paginated faculty list

---

## Facility Endpoints (Protected - Admin role required)

### 1. Create Facility
- **Method:** POST
- **URL:** `/admin/facilities`
- **Auth:** JWT Bearer token (Admin role)
- **Request Body:**
  - `name` (string, max 200) - REQUIRED
  - `address` (string, max 400) - REQUIRED

### 2. List Facilities
- **Method:** GET
- **URL:** `/admin/facilities`
- **Auth:** JWT Bearer token (Admin role)
- **Returns:** Array of all active facilities

---

## Workshop Endpoints (Protected - Admin role required)

### 1. Create Workshop
- **Method:** POST
- **URL:** `/admin/workshops`
- **Auth:** JWT Bearer token (Admin role)
- **Request Body:**
  - `deliveryMode` (enum: in_person, online) - REQUIRED
  - `title` (string, max 220) - REQUIRED
  - `facilityId` (UUID) - REQUIRED
  - `capacity` (integer, min 1) - REQUIRED
  - `alertAt` (integer, min 0) - REQUIRED
  - `registrationDeadline` (string, YYYY-MM-DD) - REQUIRED
  - `offersCmeCredits` (boolean) - REQUIRED
  - `shortBlurb` (string) - OPTIONAL
  - `coverImageUrl` (string) - OPTIONAL
  - `learningObjectives` (string) - OPTIONAL
  - `cmeCreditsInfo` (string) - OPTIONAL
  - `days` (array of objects) - OPTIONAL
    - `date` (string, YYYY-MM-DD)
    - `dayNumber` (integer, min 1)
    - `segments` (array of objects)
      - `segmentNumber` (integer, min 1)
      - `courseTopic` (string, max 220)
      - `topicDetails` (string)
      - `startTime` (string, HH:MM AM/PM)
      - `endTime` (string, HH:MM AM/PM)
  - `groupDiscounts` (array of objects) - OPTIONAL
    - `minimumAttendees` (integer, min 1)
    - `groupRatePerPerson` (string, numeric)

### 2. List Workshops
- **Method:** GET
- **URL:** `/admin/workshops`
- **Auth:** JWT Bearer token (Admin role)
- **Query Parameters:**
  - `q` (string) - Search by title
  - `facilityId` (UUID)
  - `facultyId` (UUID) - Filter by faculty member
  - `deliveryMode` (enum: in_person, online)
  - `offersCmeCredits` (string: true, false)
  - `groupDiscountEnabled` (string: true, false)
  - `page` (integer, default 1)
  - `limit` (integer, max 50, default 10)
  - `sortBy` (enum: createdAt, title, default: createdAt)
  - `sortOrder` (enum: asc, desc, default: desc)
- **Returns:** Paginated workshop list

---

## Common Response Format

### Success Response (2xx)
```json
{
  "message": "Operation successful",
  "statusCode": 200,
  "data": {
    // Response data here
  }
}
```

### Error Response (4xx, 5xx)
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

---

## Testing Tips

1. **Always Register & Login First**
   - Get the JWT token before accessing protected endpoints
   - Copy the token to the `accessToken` variable

2. **Use Real UUIDs for Foreign Keys**
   - When creating products, use a valid `categoryId`
   - When creating workshops, use a valid `facilityId`
   - Use existing faculty/facility IDs when testing

3. **Validate Required Fields**
   - The API validates all DTOs
   - Check the request examples for required vs optional fields
   - Follow the data types (string, integer, UUID, etc.)

4. **Test Pagination**
   - Most list endpoints support pagination
   - Test with different `page` and `limit` values
   - Check the total count in responses

5. **Monitor Status Codes**
   - 200/201: Success
   - 400: Bad request (invalid data)
   - 401: Unauthorized (missing/invalid token)
   - 403: Forbidden (insufficient permissions)
   - 404: Not found
   - 500: Server error

---

## Environment Setup

### Development Environment
```
baseUrl = http://localhost:3000
JWT Expiration = 7 days
SMTP Configured = Yes
```

### Database
```
Type: PostgreSQL
Name: medical_db
Location: localhost:5432
```

---

## Notes

- All timestamps are in ISO 8601 format (UTC)
- Email validation uses standard email regex
- Passwords are hashed with bcrypt
- JWT tokens expire after 7 days
- All numeric prices are stored as strings for precision
- Category/Product relationships are one-to-many
- Facility/Workshop relationships are one-to-many

---

## Support

For issues or questions about the API:
1. Check the endpoint descriptions in the collection
2. Review the DTOs in the source code
3. Check the application logs for detailed error messages
4. Verify all required fields are provided
5. Ensure JWT token is still valid (hasn't expired)

