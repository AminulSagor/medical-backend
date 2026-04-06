# Master Directory Endpoint Documentation

## Overview

The Master Directory endpoint provides administrators with a comprehensive view of all users in the system with advanced filtering, searching, and pagination capabilities. This endpoint returns both real-time statistics and paginated user data in a table format optimized for administrative dashboards.

**Authentication:** Required (JWT Bearer Token with Admin role)
**Authorization:** Admin users only
**Use Case:** User management dashboard, directory search, user analytics

---

## Endpoint Contract

| Property | Value |
|----------|-------|
| **HTTP Method** | GET |
| **Route** | `/admin/users/directory/master` |
| **Authentication** | JWT Bearer Token (Admin role required) |
| **Content-Type** | `application/json` |
| **Response Type** | JSON with statistics and paginated table data |

---

## Query Parameters

### Parameter Details

| Parameter | Type | Default | Required | Constraints | Description |
|-----------|------|---------|----------|-------------|-------------|
| `page` | number | 1 | No | Min: 1 | Page number for pagination (0-indexed internally) |
| `limit` | number | 20 | No | Min: 1 | Records per page (max recommended: 100) |
| `search` | string | - | No | Max: 255 chars | Search by full name or medical email (case-insensitive, partial match) |
| `role` | enum | - | No | ADMIN, USER, STUDENT, INSTRUCTOR | Filter by user role |
| `status` | enum | - | No | ACTIVE, INACTIVE, SUSPENDED | Filter by user account status |
| `sortBy` | string | joinedDate | No | name, email, joinedDate, courses | Field to sort by |
| `sortOrder` | string | desc | No | asc, desc | Sort direction (ascending or descending) |

### Role Enum Values
```
ADMIN      - System administrator
USER       - General user
STUDENT    - Student user
INSTRUCTOR - Faculty/instructor user
```

### Status Enum Values
```
ACTIVE     - User account is active
INACTIVE   - User account is inactive
SUSPENDED  - User account is suspended/disabled
```

### Sort By Options
```
name       - Sort by full legal name (alphabetical)
email      - Sort by medical email address (alphabetical)
joinedDate - Sort by account creation date (default)
courses    - Sort by number of courses taken
```

---

## Request Examples

### Example 1: Basic Request (Default Pagination)

```http
GET /admin/users/directory/master HTTP/1.1
Host: {{baseUrl}}
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Query String:**
```
?page=1&limit=20
```

---

### Example 2: Search by Name or Email

```http
GET /admin/users/directory/master?search=john HTTP/1.1
Host: {{baseUrl}}
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Matches:**
- Names containing "john" (case-insensitive)
- Emails containing "john" (case-insensitive)
- Example: "John Doe", "john.doe@medical.com", "Dr. Johnson"

---

### Example 3: Filter by Role

```http
GET /admin/users/directory/master?role=STUDENT&page=1&limit=20 HTTP/1.1
Host: {{baseUrl}}
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

### Example 4: Filter by Status

```http
GET /admin/users/directory/master?status=SUSPENDED&limit=10 HTTP/1.1
Host: {{baseUrl}}
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

### Example 5: Combined Filters + Sort

```http
GET /admin/users/directory/master?role=INSTRUCTOR&status=ACTIVE&sortBy=name&sortOrder=asc&page=1&limit=25 HTTP/1.1
Host: {{baseUrl}}
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

### Example 6: Search + Role + Sort by Courses

```http
GET /admin/users/directory/master?search=doctor&role=INSTRUCTOR&sortBy=courses&sortOrder=desc&page=1&limit=15 HTTP/1.1
Host: {{baseUrl}}
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

### Example 7: Filter by Multiple Statuses (One at a Time)

```http
GET /admin/users/directory/master?status=INACTIVE&sortBy=name&page=1 HTTP/1.1
Host: {{baseUrl}}
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

### Example 8: High Limit Pagination

```http
GET /admin/users/directory/master?page=2&limit=50 HTTP/1.1
Host: {{baseUrl}}
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Success Response (200 OK)

### Complete Response Structure

```json
{
  "statistics": {
    "totalCommunity": 150,
    "activeStudents": 85,
    "growthPulse": 12,
    "instructorCount": 8,
    "adminCount": 2
  },
  "table": {
    "data": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "userIdentity": {
          "name": "Dr. John Doe",
          "email": "john.doe@medical.com",
          "profilePhoto": "https://example.com/profiles/john-doe.jpg"
        },
        "role": "INSTRUCTOR",
        "credential": "MD, Cardiologist",
        "status": "ACTIVE",
        "courses": 5,
        "joinedDate": "2024-01-15T10:00:00.000Z",
        "lastActive": "2024-04-06T14:30:00.000Z"
      },
      {
        "id": "123e4567-e89b-12d3-a456-426614174001",
        "userIdentity": {
          "name": "Sarah Johnson",
          "email": "sarah.johnson@medical.com",
          "profilePhoto": null
        },
        "role": "STUDENT",
        "credential": "BSc Nursing",
        "status": "ACTIVE",
        "courses": 3,
        "joinedDate": "2024-02-20T08:15:00.000Z",
        "lastActive": "2024-04-05T16:45:00.000Z"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

### Response Field Descriptions

#### Statistics Object

| Field | Type | Description |
|-------|------|-------------|
| `totalCommunity` | number | Total number of users in the system |
| `activeStudents` | number | Number of users with role STUDENT and status ACTIVE |
| `growthPulse` | number | Number of users who joined in the last 30 days |
| `instructorCount` | number | Number of users with role INSTRUCTOR |
| `adminCount` | number | Number of users with role ADMIN |

#### Table Data Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Unique user identifier |
| `userIdentity.name` | string | User's full legal name |
| `userIdentity.email` | string | User's medical email address |
| `userIdentity.profilePhoto` | string or null | URL to profile photo or null if not set |
| `role` | enum | User's role (ADMIN, USER, STUDENT, INSTRUCTOR) |
| `credential` | string | User's professional credentials or professional role |
| `status` | enum | User's account status (ACTIVE, INACTIVE, SUSPENDED) |
| `courses` | number | Number of courses the user has taken/completed |
| `joinedDate` | ISO 8601 string | Account creation timestamp |
| `lastActive` | ISO 8601 string | Last activity timestamp |

#### Pagination Meta Object

| Field | Type | Description |
|-------|------|-------------|
| `page` | number | Current page number (1-indexed) |
| `limit` | number | Records per page |
| `total` | number | Total records matching the query |
| `totalPages` | number | Total number of pages (calculated: Math.ceil(total / limit)) |

---

## Response Variants

### Variant 1: Empty Results

**Query:**
```
GET /admin/users/directory/master?search=nonexistent&page=1&limit=20
```

**Response:**
```json
{
  "statistics": {
    "totalCommunity": 150,
    "activeStudents": 85,
    "growthPulse": 12,
    "instructorCount": 8,
    "adminCount": 2
  },
  "table": {
    "data": [],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 0,
      "totalPages": 0
    }
  }
}
```

---

### Variant 2: Single User Result

**Query:**
```
GET /admin/users/directory/master?search=specific@medical.com&limit=20
```

**Response:**
```json
{
  "statistics": {
    "totalCommunity": 150,
    "activeStudents": 85,
    "growthPulse": 12,
    "instructorCount": 8,
    "adminCount": 2
  },
  "table": {
    "data": [
      {
        "id": "uuid-123",
        "userIdentity": {
          "name": "Perfect Match User",
          "email": "specific@medical.com",
          "profilePhoto": "https://..."
        },
        "role": "INSTRUCTOR",
        "credential": "PhD",
        "status": "ACTIVE",
        "courses": 10,
        "joinedDate": "2023-06-01T00:00:00.000Z",
        "lastActive": "2024-04-06T10:00:00.000Z"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

---

### Variant 3: Paginated Results (Page 2)

**Query:**
```
GET /admin/users/directory/master?page=2&limit=20
```

**Response:**
```json
{
  "statistics": { ... },
  "table": {
    "data": [
      { ... user 21 ... },
      { ... user 22 ... },
      { ... user 40 ... }
    ],
    "meta": {
      "page": 2,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

---

### Variant 4: Filtered by Role (All Students)

**Query:**
```
GET /admin/users/directory/master?role=STUDENT&sortBy=name&sortOrder=asc
```

**Response:**
```json
{
  "statistics": { ... },
  "table": {
    "data": [
      {
        "role": "STUDENT",
        ...
      },
      {
        "role": "STUDENT",
        ...
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 85,
      "totalPages": 5
    }
  }
}
```

---

## Error Responses

### 400 Bad Request - Invalid Query Parameter

**Scenario:** Invalid enum value or constraint violation

```json
{
  "statusCode": 400,
  "message": [
    "role must be one of the following values: ADMIN, USER, STUDENT, INSTRUCTOR",
    "page must not be less than 1"
  ],
  "error": "Bad Request"
}
```

**Common Validation Errors:**
- `role must be one of the following values: ADMIN, USER, STUDENT, INSTRUCTOR`
- `status must be one of the following values: ACTIVE, INACTIVE, SUSPENDED`
- `page must not be less than 1`
- `limit must not be less than 1`
- `sortBy must be one of the following values: name, email, joinedDate, courses`
- `sortOrder must be one of the following values: asc, desc`

---

### 401 Unauthorized

**Scenario:** Missing or invalid JWT token

```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

**Reasons:**
- No JWT token provided in Authorization header
- Token has expired
- Token is malformed or invalid
- Token signature verification failed

**Fix:** Include valid Authorization header:
```
Authorization: Bearer <valid-jwt-token>
```

---

### 403 Forbidden - Non-Admin User

**Scenario:** JWT token is valid but user is not an admin

```json
{
  "statusCode": 403,
  "message": "Forbidden"
}
```

**Reason:** Only users with `ADMIN` role can access this endpoint. Users with role STUDENT, USER, or INSTRUCTOR will receive 403 Forbidden.

**Fix:** Login with an admin account or request admin privileges.

---

## Database Query Behavior

### Search Implementation
- **Fields Searched:** 
  - `user.fullLegalName` (full text search, case-insensitive)
  - `user.medicalEmail` (partial match, case-insensitive)
- **Pattern:** LIKE '%search-term%' (substring match)
- **SQL:** `LOWER(user.fullLegalName) LIKE :s OR LOWER(user.medicalEmail) LIKE :s`

### Filter Implementation
- **Role Filter:** Exact match on `user.role` column
- **Status Filter:** Exact match on `user.status` column
- **Combined Filters:** AND logic (all filters must match)

### Sorting Implementation
- **Default:** By `user.createdAt` (DESC - newest first)
- **Name:** By `user.fullLegalName` (A-Z or Z-A)
- **Email:** By `user.medicalEmail` (A-Z or Z-A)
- **Courses:** By `user.coursesCount` (numeric order)

### Pagination Implementation
- **Skip:** `(page - 1) * limit` records
- **Take:** `limit` records
- **Total Count:** Separate COUNT query to get total matching records

---

## Testing Checklist

- [ ] Request with default parameters returns 20 records
- [ ] Page parameter changes results correctly
- [ ] Limit parameter reduces/increases records returned
- [ ] Search by first name returns matching users
- [ ] Search by last name returns matching users
- [ ] Search by email returns matching users
- [ ] Search by partial name works (substring matching)
- [ ] Role filter returns only users with specified role
- [ ] Status filter returns only users with specified status
- [ ] Combined role + status filters work (AND logic)
- [ ] sortBy=name with sortOrder=asc sorts alphabetically
- [ ] sortBy=email sorts by email address correctly
- [ ] sortBy=courses sorts by course count correctly
- [ ] sortBy=joinedDate sorts by creation date correctly
- [ ] Non-existent search returns empty data array with totalPages=0
- [ ] Page beyond totalPages returns empty data array
- [ ] Statistics remain consistent across all queries
- [ ] Invalid role enum returns 400 Bad Request
- [ ] Invalid status enum returns 400 Bad Request
- [ ] Invalid sortBy value returns 400 Bad Request
- [ ] page < 1 returns 400 Bad Request
- [ ] limit < 1 returns 400 Bad Request
- [ ] Missing JWT token returns 401 Unauthorized
- [ ] Non-admin JWT token returns 403 Forbidden
- [ ] Expired JWT token returns 401 Unauthorized
- [ ] Profile photos display correctly (or null if not set)
- [ ] Last active dates are present and valid
- [ ] Credentials field shows title or role appropriately

---

## Performance Considerations

### Query Optimization
- Uses TypeORM QueryBuilder for efficient database queries
- Single COUNT query for pagination metadata
- Index recommendations:
  - `user.role` column
  - `user.status` column
  - `user.fullLegalName` column (for search)
  - `user.medicalEmail` column (for search)
  - `user.createdAt` column (for sorting)

### Response Size
- Default limit of 20 records keeps response payload reasonable
- Recommend max 100 records per page for performance
- Statistics are calculated separately and cached if possible

### Rate Limiting
- Consider implementing rate limiting on this endpoint
- Recommended: 100 requests per minute per user

---

## Source Implementation

**Files Involved:**
- `src/users/users.controller.ts` - Route handler
- `src/users/users.service.ts` - Business logic
- `src/users/dto/master-directory.query.dto.ts` - Request validation
- `src/users/entities/user.entity.ts` - Data model

**Key Methods:**
- `UsersController.getMasterDirectory()` - Endpoint handler
- `UsersService.getMasterDirectory()` - Pagination and filtering logic
- `UsersService.calculateDirectoryStatistics()` - Statistics computation

**Key Validations:**
- `@IsInt()` and `@Min(1)` for page and limit
- `@IsEnum(UserRole)` for role parameter
- `@IsEnum(UserStatus)` for status parameter
- `@IsString()` for search parameter

---

## Related Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/admin/users` | GET | List users with basic query |
| `/users/profile` | GET | Get authenticated user's profile |
| `/users/profile` | PATCH | Update authenticated user's profile |
| `/users/password` | PATCH | Change user's password |
| `/admin/users/adminProfile/settings/email` | PATCH | Update admin email |
| `/admin/users/adminProfile/settings/password` | PATCH | Change admin password |

---

## Related Documentation

- [ENDPOINTS_SUMMARY.md](ENDPOINTS_SUMMARY.md) - Complete endpoint reference
- [USER_PROFILE_DETAILS.md](USER_PROFILE_DETAILS.md) - User profile endpoints
- [USER_PASSWORD_CHANGE_DETAILS.md](USER_PASSWORD_CHANGE_DETAILS.md) - Password change endpoint
- [QUICK_START.md](QUICK_START.md) - API quick start guide
- [POSTMAN_GUIDE.md](POSTMAN_GUIDE.md) - Postman collection guide
