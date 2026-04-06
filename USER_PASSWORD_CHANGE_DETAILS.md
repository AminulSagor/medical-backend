# User Password Change Endpoint Documentation

## Overview

The password change endpoint allows authenticated users to securely update their account password. Users must provide their current password and a new password that meets security requirements.

**Authentication:** Required (JWT Bearer Token)
**Authorization:** Users can only change their own password
**Rate Limiting:** Recommended - implement rate limiting to prevent brute force attacks

---

## Endpoint Contract

| Property | Value |
|----------|-------|
| **HTTP Method** | PATCH |
| **Route** | `/users/password` |
| **Authentication** | JWT Bearer Token (Required) |
| **Content-Type** | `application/json` |
| **Response Type** | JSON |

---

## Request Body

### ChangePasswordDto

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `currentPassword` | string | Yes | Must match account password | User's current password (for verification) |
| `newPassword` | string | Yes | Min length: 8 characters | User's new password (must be different from current) |

### Request Example 1: Standard Password Change

```json
{
  "currentPassword": "SecurePass123",
  "newPassword": "NewSecurePass789"
}
```

### Request Example 2: Complex Password

```json
{
  "currentPassword": "MyCurrentP@ss123",
  "newPassword": "SuperSecure@Pass2024!"
}
```

---

## Success Response (200 OK)

### Response Body

```json
{
  "message": "Password changed successfully",
  "data": {
    "id": "uuid-user-id-12345",
    "medicalEmail": "user@medical.com"
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `message` | string | Confirmation message |
| `data.id` | string | User ID for confirmation |
| `data.medicalEmail` | string | User's medical email for reference |

---

## Error Responses

### 400 Bad Request - Invalid Request Body

**Scenario:** Missing required fields or validation failure

```json
{
  "statusCode": 400,
  "message": [
    "currentPassword should not be empty",
    "newPassword must be longer than or equal to 8 characters"
  ],
  "error": "Bad Request"
}
```

**Common Validation Errors:**
- `currentPassword should not be empty` - currentPassword is required
- `newPassword must be longer than or equal to 8 characters` - New password must be at least 8 chars
- `newPassword should not be empty` - newPassword is required
- `currentPassword must be a string` - Invalid type provided

---

### 400 Bad Request - Incorrect Current Password

**Scenario:** User provides wrong current password

```json
{
  "statusCode": 400,
  "message": "Current password is incorrect",
  "error": "Bad Request"
}
```

**Reason:** The `currentPassword` doesn't match the account's current password. User must provide the correct current password for security verification.

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

### 404 Not Found

**Scenario:** User account no longer exists

```json
{
  "statusCode": 404,
  "message": "User not found",
  "error": "Not Found"
}
```

**Reason:** The user ID from the JWT token doesn't correspond to an existing user account.

---

## Request Variants

### Variant 1: Minimal Request

```http
PATCH /users/password HTTP/1.1
Host: {{baseUrl}}
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "currentPassword": "OldPassword123",
  "newPassword": "NewPassword456"
}
```

### Variant 2: With Special Characters

```http
PATCH /users/password HTTP/1.1
Host: {{baseUrl}}
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "currentPassword": "Curr@ntPass#2024",
  "newPassword": "N3w$ecur3P@ssw0rd!"
}
```

### Variant 3: Long Password

```http
PATCH /users/password HTTP/1.1
Host: {{baseUrl}}
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "currentPassword": "MyAccountPassword123",
  "newPassword": "VeryLongAndComplexPasswordWith1234567890SpecialChars!@#$%"
}
```

---

## Implementation Details

### Password Hashing

- **Algorithm:** bcrypt (10 salt rounds)
- **Plaintext Storage:** Never stored; only hashed passwords stored in database
- **Hash Comparison:** Using bcrypt.compare() for secure verification

### Verification Flow

1. User provides `currentPassword` (plaintext)
2. System retrieves stored password hash from database
3. System uses `bcrypt.compare(currentPassword, storedHash)`
4. If comparison fails → 400 Bad Request
5. If comparison succeeds:
   - New password is hashed with bcrypt
   - Stored password in database is updated
   - User session remains valid (no re-login required)

### User Context

The endpoint extracts the user ID from the JWT token payload:
```typescript
const userId = req.user.id; // From JWT validation
```

This ensures users can **only change their own password**, not other users' passwords.

---

## Security Considerations

### Best Practices

1. **HTTPS Only:** Always use HTTPS in production - passwords travel over network
2. **Rate Limiting:** Implement rate limiting to prevent brute force attacks (e.g., 3 attempts per 15 minutes)
3. **Current Password Verification:** Requiring current password prevents unauthorized password changes
4. **Password Strength:** Consider enforcing:
   - Mix of uppercase and lowercase letters
   - Numeric characters
   - Special characters
   - Minimum length of 12 characters (vs current 8)
5. **Session Management:** Consider optional:
   - Log out all other sessions after password change
   - Email notification of password change

### Bcrypt Configuration

- **Salt Rounds:** 10 (recommended balance between security and performance)
- **Hash Size:** 60 characters
- **Time Complexity:** ~100ms per operation

---

## Database Behavior

### Columns Updated

| Column | Change |
|--------|---------|
| `password` | Updated to new bcrypt hash |
| `updated_at` | Set to current timestamp |
| All other columns | Unchanged |

### Transaction

- Single database UPDATE operation
- Atomic - either fully succeeds or fully rolls back
- No intermediate states possible

---

## Testing Checklist

- [ ] Valid credentials with 8-character password succeeds
- [ ] Missing currentPassword returns 400
- [ ] Missing newPassword returns 400
- [ ] Wrong currentPassword returns 400 "Current password is incorrect"
- [ ] New password less than 8 chars returns validation error
- [ ] No JWT token returns 401 Unauthorized
- [ ] Expired JWT token returns 401 Unauthorized
- [ ] Invalid JWT signature returns 401 Unauthorized
- [ ] Non-existent user ID (valid JWT) returns 404
- [ ] User can log in with new password after change
- [ ] Old password no longer works after change
- [ ] Empty newPassword returns validation error

---

## Source Implementation

**Files Modified:**
- `src/users/dto/update-my-profile.dto.ts` - Added `ChangePasswordDto`
- `src/users/user-profile.controller.ts` - Added `changePassword` endpoint
- `src/users/users.service.ts` - Added `changePassword` service method

**Key Methods:**
- `UserProfileController.changePassword()` - Route handler
- `UsersService.changePassword()` - Business logic
- `ChangePasswordDto` - Request validation

---

## Related Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/auth/login` | POST | Initial authentication |
| `/auth/register` | POST | User registration |
| `/users/profile` | GET | View user profile |
| `/users/profile` | PATCH | Update profile details |
| `/admin/users/adminProfile/settings/password` | PATCH | Admin password change (admin only) |

---

## Related Documentation

- [USER_PROFILE_DETAILS.md](USER_PROFILE_DETAILS.md) - User profile GET/PATCH endpoints
- [ENDPOINTS_SUMMARY.md](ENDPOINTS_SUMMARY.md) - Complete endpoint reference
- [QUICK_START.md](QUICK_START.md) - API quick start guide
