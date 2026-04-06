# User Role Update Endpoint Documentation

## Overview

The User Role Update endpoint allows administrators to change a user's system role. This is essential for role-based access control, allowing admins to promote users from regular users to students, instructors, or other roles.

**Authentication:** Required (JWT Bearer Token with Admin role)
**Authorization:** Admin users only
**Use Case:** User role management, permission escalation, role reassignment

---

## Endpoint Contract

| Property | Value |
|----------|-------|
| **HTTP Method** | PATCH |
| **Route** | `/admin/users/:userId/role` |
| **Authentication** | JWT Bearer Token (Admin role required) |
| **Content-Type** | `application/json` |
| **Response Type** | JSON with updated user data |

---

## URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string (UUID) | Yes | The ID of the user whose role will be updated |

---

## Request Body

### UpdateUserRoleDto

| Field | Type | Required | Enum Values | Description |
|-------|------|----------|-------------|-------------|
| `role` | enum | Yes | ADMIN, USER, STUDENT, INSTRUCTOR | The new role to assign to the user |

### Role Enum Values

```
ADMIN      - System administrator (full access to admin endpoints)
USER       - Regular/default user (basic access)
STUDENT    - Student user (access to student features)
INSTRUCTOR - Instructor/faculty (teaching and course management)
```

### Request Examples

#### Example 1: Promote User to Student

```http
PATCH /admin/users/123e4567-e89b-12d3-a456-426614174000/role HTTP/1.1
Host: {{baseUrl}}
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "role": "STUDENT"
}
```

---

#### Example 2: Promote User to Instructor

```http
PATCH /admin/users/123e4567-e89b-12d3-a456-426614174001/role HTTP/1.1
Host: {{baseUrl}}
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "role": "INSTRUCTOR"
}
```

---

#### Example 3: Promote User to Admin

```http
PATCH /admin/users/123e4567-e89b-12d3-a456-426614174002/role HTTP/1.1
Host: {{baseUrl}}
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "role": "ADMIN"
}
```

---

#### Example 4: Demote User Back to Regular User

```http
PATCH /admin/users/123e4567-e89b-12d3-a456-426614174003/role HTTP/1.1
Host: {{baseUrl}}
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "role": "USER"
}
```

---

## Success Response (200 OK)

### Response Body

```json
{
  "message": "User role updated successfully",
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "fullLegalName": "John Doe",
    "medicalEmail": "john.doe@medical.com",
    "role": "STUDENT",
    "status": "ACTIVE"
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `message` | string | Confirmation message |
| `data.id` | string (UUID) | User ID |
| `data.fullLegalName` | string | User's full legal name |
| `data.medicalEmail` | string | User's medical email address |
| `data.role` | enum | The user's new role |
| `data.status` | enum | User's account status (ACTIVE, INACTIVE, SUSPENDED) |

---

## Response Variants

### Variant 1: Promote to Instructor

**Request:**
```json
{
  "role": "INSTRUCTOR"
}
```

**Response:**
```json
{
  "message": "User role updated successfully",
  "data": {
    "id": "uuid-123",
    "fullLegalName": "Dr. Sarah Johnson",
    "medicalEmail": "sarah.johnson@medical.com",
    "role": "INSTRUCTOR",
    "status": "ACTIVE"
  }
}
```

---

### Variant 2: Demote from Instructor to Student

**Request:**
```json
{
  "role": "STUDENT"
}
```

**Response:**
```json
{
  "message": "User role updated successfully",
  "data": {
    "id": "uuid-456",
    "fullLegalName": "Jane Smith",
    "medicalEmail": "jane.smith@medical.com",
    "role": "STUDENT",
    "status": "ACTIVE"
  }
}
```

---

### Variant 3: Promote to Admin

**Request:**
```json
{
  "role": "ADMIN"
}
```

**Response:**
```json
{
  "message": "User role updated successfully",
  "data": {
    "id": "uuid-789",
    "fullLegalName": "Admin Manager",
    "medicalEmail": "admin.manager@medical.com",
    "role": "ADMIN",
    "status": "ACTIVE"
  }
}
```

---

## Error Responses

### 400 Bad Request - Invalid Role

**Scenario:** Request body has invalid role value

```json
{
  "statusCode": 400,
  "message": [
    "role must be one of the following values: ADMIN, USER, STUDENT, INSTRUCTOR"
  ],
  "error": "Bad Request"
}
```

**Common Validation Errors:**
- `role must be one of the following values: ADMIN, USER, STUDENT, INSTRUCTOR`
- `role should not be empty`
- `role must be a string`

**Fix:** Use only valid enum values: `ADMIN`, `USER`, `STUDENT`, or `INSTRUCTOR`

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

**Reason:** Only users with `ADMIN` role can update other users' roles.

**Fix:** Login with an admin account or request admin privileges.

---

### 404 Not Found

**Scenario:** User with given ID doesn't exist

```json
{
  "statusCode": 404,
  "message": "User not found",
  "error": "Not Found"
}
```

**Reasons:**
- User ID is invalid (not a valid UUID format)
- User ID doesn't exist in the database
- User was deleted

**Fix:** Verify the userId is correct and the user exists in the system.

---

## Implementation Details

### Role Assignment Workflow

1. **Registration Flow:**
   - New users who register get `role: USER` by default
   - Admin can then change their role as needed

2. **Role Escalation:**
   - User → Student (to enroll in courses)
   - User → Instructor (to teach/create courses)
   - User/Student/Instructor → Admin (to manage system)

3. **Role Demotion:**
   - Instructor → Student (remove teaching privileges)
   - Instructor → User (remove all special privileges)
   - Admin → User (revoke admin access)

### Database Behavior

- **Column Updated:** `role` (enum column, type: 'enum')
- **Transaction:** Atomic single UPDATE operation
- **Validation:** Enum constraint ensures only valid roles stored

### Access Control

- Only `ADMIN` role users can call this endpoint
- Admins can change any user's role, including other admins
- Can change own role (admins can demote themselves)

---

## Testing Checklist

- [ ] Update user role to STUDENT succeeds with 200
- [ ] Update user role to INSTRUCTOR succeeds with 200
- [ ] Update user role to ADMIN succeeds with 200
- [ ] Update user role to USER succeeds with 200
- [ ] Invalid role enum returns 400 Bad Request
- [ ] Missing role field returns 400 Bad Request
- [ ] Non-existent user ID returns 404 Not Found
- [ ] Invalid UUID format returns 400 or 404
- [ ] Missing JWT token returns 401 Unauthorized
- [ ] Expired JWT token returns 401 Unauthorized
- [ ] Non-admin JWT token returns 403 Forbidden
- [ ] Response includes correct user ID
- [ ] Response includes correct user email
- [ ] Response includes correct new role
- [ ] User status remains unchanged after role update
- [ ] Master directory reflects updated role immediately
- [ ] Can demote own role (self-demotion works)
- [ ] Can promote another admin to admin
- [ ] Updated role persists after login
- [ ] Role change is logged/auditable (if audit enabled)

---

## Security Considerations

### Best Practices

1. **Audit Trail:** Consider logging all role changes with admin ID and timestamp
2. **Rate Limiting:** Implement rate limiting to prevent role update spam
3. **Confirmation:** For admin promotions, consider requiring additional confirmation
4. **Soft Deletes:** Don't hard delete users; demote their role instead
5. **Role Hierarchy:** May want to prevent users from promoting to higher roles without authorization

### Permission Model

- Only ADMIN role can execute this endpoint
- No role can delegate its own authority
- All role changes go through same endpoint

---

## Common Workflows

### Workflow 1: Add Instructor from Registered User

```
1. User registers → role = USER (default)
2. Admin gets list of users (GET /admin/users/directory/master)
3. Admin identifies user to promote
4. Admin calls PATCH /admin/users/:userId/role with role=INSTRUCTOR
5. User now has INSTRUCTOR privileges
```

### Workflow 2: Convert Student to Instructor

```
1. Student has role = STUDENT
2. Admin PATCH /admin/users/:userId/role with role=INSTRUCTOR
3. User is now instructor with enhanced permissions
```

### Workflow 3: Demote Admin Back to User

```
1. Admin has role = ADMIN
2. Another admin PATCH /admin/users/:userId/role with role=USER
3. User loses admin privileges (can still be re-promoted)
```

---

## Source Implementation

**Files Involved:**
- `src/users/users.controller.ts` - Route handler
- `src/users/users.service.ts` - Business logic
- `src/users/dto/update-user-role.dto.ts` - Request validation
- `src/users/entities/user.entity.ts` - Data model with UserRole enum

**Key Methods:**
- `UsersController.updateUserRole()` - Endpoint handler
- `UsersService.updateUserRole()` - Role update logic

**Key Validations:**
- `@IsEnum(UserRole)` ensures only valid roles accepted
- Path parameter `userId` is validated as UUID
- Admin role check via RolesGuard

---

## Related Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/admin/users/directory/master` | GET | View all users and their current roles |
| `/admin/users/:userId/role` | PATCH | Update user's role |
| `/users/profile` | GET | Get current user's profile (includes role) |
| `/auth/register` | POST | Register new user (defaults to USER role) |
| `/auth/login` | POST | Login and receive JWT with role in payload |

---

## Related Documentation

- [ENDPOINTS_SUMMARY.md](ENDPOINTS_SUMMARY.md) - Complete endpoint reference
- [MASTER_DIRECTORY_DETAILS.md](MASTER_DIRECTORY_DETAILS.md) - User directory endpoint
- [USER_PROFILE_DETAILS.md](USER_PROFILE_DETAILS.md) - User profile endpoints
- [QUICK_START.md](QUICK_START.md) - API quick start guide
