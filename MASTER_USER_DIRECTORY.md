# Master User Directory Endpoint

## Overview
Admin endpoint that provides comprehensive user statistics and a filterable/sortable user directory table.

---

## Endpoint

**GET** `/admin/users/directory/master`

**Authentication:** Required (Admin role only)

**Headers:**
```
Authorization: Bearer {accessToken}
```

---

## Query Parameters

All parameters are optional:

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `page` | integer | Page number (min: 1) | 1 |
| `limit` | integer | Items per page (min: 1) | 20 |
| `search` | string | Search in name or email | - |
| `role` | enum | Filter by role: `student`, `admin`, `instructor`, `user` | - |
| `status` | enum | Filter by status: `active`, `inactive`, `suspended` | - |
| `sortBy` | enum | Sort by: `name`, `email`, `courses`, `joinedDate` | `joinedDate` |
| `sortOrder` | enum | Sort order: `asc`, `desc` | `desc` |

---

## Response Structure

```json
{
  "statistics": {
    "totalCommunity": 1250,
    "activeStudents": 950,
    "growthPulse": "15.3%",
    "engagementRate": "68.4%",
    "roleDistribution": {
      "student": 1000,
      "instructor": 200,
      "admin": 50
    }
  },
  "table": {
    "data": [
      {
        "id": "uuid",
        "userIdentity": {
          "name": "Dr. John Smith",
          "email": "john.smith@hospital.com",
          "profilePhoto": "https://example.com/photo.jpg"
        },
        "role": "student",
        "credential": "MD, FACS",
        "status": "active",
        "courses": 5,
        "joinedDate": "2026-01-15T10:00:00Z",
        "lastActive": "2026-03-08T09:30:00Z"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 1250,
      "totalPages": 63
    }
  }
}
```

---

## Statistics Explained

### 1. Total Community
Total number of registered users across all roles.

### 2. Active Students
Number of users with role `student` and status `active`.

### 3. Growth Pulse
Percentage growth based on users joined in the last 30 days compared to previous users.

**Formula:**
```
(New Users Last 30 Days / Previous Users) * 100
```

### 4. Engagement Rate
Percentage of users who were active in the last 7 days.

**Formula:**
```
(Active Users Last Week / Total Users) * 100
```

### 5. Role Distribution
Breakdown of user count by role (student, instructor, admin, etc.)

---

## User Table Fields

### userIdentity
- **name**: User's full legal name
- **email**: User's medical/institutional email
- **profilePhoto**: URL to profile photo (nullable)

### role
One of: `student`, `admin`, `instructor`, `user`

### credential
User's professional credentials or role (e.g., "MD, FACS", "Surgeon")

### status
One of: `active`, `inactive`, `suspended`

### courses
Number of courses enrolled/assigned

### joinedDate
User registration timestamp

### lastActive
Last activity timestamp (nullable)

---

## Example Requests

### Get all users (default)
```
GET /admin/users/directory/master
```

### Search for specific user
```
GET /admin/users/directory/master?search=john
```

### Filter by role
```
GET /admin/users/directory/master?role=student
```

### Filter by status
```
GET /admin/users/directory/master?status=active
```

### Sort by courses (ascending)
```
GET /admin/users/directory/master?sortBy=courses&sortOrder=asc
```

### Multiple filters with pagination
```
GET /admin/users/directory/master?role=student&status=active&page=2&limit=50&sortBy=joinedDate&sortOrder=desc
```

---

## New Database Fields

The following fields were added to the `users` table:

### UserRole Enum Extended
```typescript
enum UserRole {
  ADMIN = "admin",
  USER = "user",
  STUDENT = "student",      // NEW
  INSTRUCTOR = "instructor"  // NEW
}
```

### UserStatus Enum (New)
```typescript
enum UserStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  SUSPENDED = "suspended"
}
```

### User Entity Fields Added
- `status`: UserStatus (default: `active`)
- `credentials`: string (nullable) - Professional credentials
- `coursesCount`: integer (default: 0) - Number of courses
- `lastActiveAt`: timestamp (nullable) - Last activity time

---

## Use Cases

### 1. Admin Dashboard
Display key metrics and community overview:
- Total users across platform
- Active student engagement
- Growth trends
- Role distribution

### 2. User Management Table
Complete user directory with:
- Searchable by name/email
- Filterable by role and status
- Sortable by multiple fields
- Paginated results

### 3. Analytics
Track platform health:
- Monitor growth pulse
- Measure engagement rates
- Identify inactive users
- Course enrollment tracking

---

## Implementation Files

**Created:**
- `src/users/dto/master-directory.query.dto.ts` - Query parameters DTO

**Updated:**
- `src/users/entities/user.entity.ts` - Added new fields and enums
- `src/users/users.controller.ts` - Added directory endpoint
- `src/users/users.service.ts` - Added statistics and directory methods

---

## Error Responses

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "Forbidden resource"
}
```
Only admin users can access this endpoint.

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": [
    "page must not be less than 1",
    "role must be a valid enum value"
  ],
  "error": "Bad Request"
}
```

---

## Performance Considerations

- Uses database indexing on commonly filtered fields
- Pagination prevents large data transfers
- Statistics are calculated separately from table data
- Query builder optimization for complex filters

---

## Future Enhancements

Potential features to add:
- Export to CSV/Excel
- Advanced date range filters
- Bulk status updates
- User activity logs
- Course enrollment details
- Revenue/payment tracking per user
