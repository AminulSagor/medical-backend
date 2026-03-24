# 🚀 Quick Start Guide - Postman Collection

## Files Generated ✅

```
Medical-Backend-API.postman_collection.json  ← Postman Collection (IMPORT THIS)
POSTMAN_GUIDE.md                              ← Detailed API Documentation
ENDPOINTS_SUMMARY.md                          ← Quick Reference Guide
QUICK_START.md                                ← This file
```

---

## Step 1: Import Collection (2 minutes)

### In Postman Desktop App:
1. Click **"Import"** button (top-left)
2. Select **"Upload Files"**
3. Choose: `Medical-Backend-API.postman_collection.json`
4. Click **"Import"**

✅ Collection imported with 21 endpoints organized in 7 folders

---

## Step 2: Set Environment Variables (1 minute)

After importing:
1. Click the **collection name** → **"..."** → **"Edit"**
2. Go to **"Variables"** tab
3. Set these variables:
   - **baseUrl**: `http://localhost:3000`
   - **accessToken**: (leave empty, will be auto-populated after login)
4. Click **"Save"**

---

## Step 3: Test Authentication (3 minutes)

### Register:
1. Open **Auth** → **Register**
2. Update the email in request body
3. Click **"Send"**
4. You should get a 201 response ✅

### Login:
1. Open **Auth** → **Login**
2. Use the same credentials you just registered
3. Click **"Send"**
4. Copy the `access_token` from response

### Save Token:
1. Go to **collection variables**
2. Paste token in **accessToken** field
3. This token will now be used in all protected requests ✅

---

## Step 4: Test Protected Endpoints (5 minutes)

### Try These in Order:

**Categories:**
```
POST /admin/categories → Create a category
GET /admin/categories → List all categories
```

**Facilities:**
```
POST /admin/facilities → Create a facility
GET /admin/facilities → List all facilities
```

**Products:**
```
POST /admin/products → Create a product (use categoryId from step above)
GET /admin/products → List all products
PATCH /admin/products/:id → Update a product
```

**Faculty:**
```
POST /admin/faculty → Create faculty
GET /admin/faculty → List faculty
```

**Workshops:**
```
POST /admin/workshops → Create workshop (use facilityId from step above)
GET /admin/workshops → List workshops
```

---

## Complete API Overview

### 21 Total Endpoints Organized in 7 Modules:

| Module | Endpoints | Auth Required |
|--------|-----------|---------------|
| **Auth** | 5 | ❌ No |
| **Users** | 3 | ✅ Yes |
| **Categories** | 2 | ✅ Yes |
| **Products** | 3 | ✅ Yes |
| **Faculty** | 2 | ✅ Yes |
| **Facilities** | 2 | ✅ Yes |
| **Workshops** | 2 | ✅ Yes |

---

## Folder Structure in Postman

```
📦 Medical Backend API
 ├── 🔓 Auth (5 endpoints)
 │   ├── Register
 │   ├── Login
 │   ├── Send OTP
 │   ├── Verify OTP
 │   └── Reset Password
 ├── 👥 Admin - Users (3 endpoints)
 │   ├── List All Users
 │   ├── Update Admin Email
 │   └── Change Admin Password
 ├── 📁 Admin - Categories (2 endpoints)
 │   ├── Create Category
 │   └── List Categories
 ├── 📦 Admin - Products (3 endpoints)
 │   ├── Create Product
 │   ├── List Products
 │   └── Update Product
 ├── 👨‍⚕️ Admin - Faculty (2 endpoints)
 │   ├── Create Faculty
 │   └── List Faculty
 ├── 🏥 Admin - Facilities (2 endpoints)
 │   ├── Create Facility
 │   └── List Facilities
 └── 🎓 Admin - Workshops (2 endpoints)
     ├── Create Workshop
     └── List Workshops
```

---

## Common Workflows

### ✅ Workflow 1: Product Catalog Setup
```
1. Auth → Register → Copy token
2. Auth → Login (get fresh token)
3. Categories → Create
4. Products → Create (reference category)
5. Products → List (verify)
```

### ✅ Workflow 2: Workshop Management
```
1. Facilities → Create
2. Faculty → Create (optional)
3. Workshops → Create (reference facility)
4. Workshops → List (with filters)
```

### ✅ Workflow 3: Account Management
```
1. Auth → Login
2. Users → Update Email
3. Users → Change Password
```

### ✅ Workflow 4: Password Reset
```
1. Auth → Send OTP
2. Auth → Verify OTP
3. Auth → Reset Password
```

---

## Response Examples

### Success (200/201)
```json
{
  "message": "Operation successful",
  "statusCode": 201,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Example Name",
    "createdAt": "2026-03-01T10:00:00Z"
  }
}
```

### Error (400/401/403/500)
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

---

## Tips & Tricks

### 💡 Enable Console for Request/Response Logging
1. Click **View** → **Show Console** (bottom)
2. Run requests and see detailed logs

### 💡 Use Pre-request Scripts
- Automatically set timestamps
- Generate test data
- Validate responses

### 💡 Environment Switching
- Create environments for: Development, Staging, Production
- Switch easily via environment dropdown

### 💡 Save Collections to Git
```bash
# Export collection
# Commit to version control
# Share with team
```

### 💡 Create Tests for Your Endpoints
```javascript
pm.test("Status code is 200", function() {
    pm.response.to.have.status(200);
});
```

---

## Troubleshooting

### ❌ "401 Unauthorized"
- **Problem**: Missing or invalid token
- **Solution**: 
  1. Go to Auth → Login
  2. Copy the access_token
  3. Update the `accessToken` variable in Postman

### ❌ "403 Forbidden"
- **Problem**: Token valid but user doesn't have admin role
- **Solution**: Register with admin account and use that token

### ❌ "400 Bad Request"
- **Problem**: Invalid request data
- **Solution**: 
  1. Check required fields in request body
  2. Validate data types (string, UUID, integer, etc.)
  3. Check field length limitations

### ❌ "Cannot connect to localhost:3000"
- **Problem**: API server not running
- **Solution**: 
  1. Check if server is running: `npm run start:dev`
  2. Verify baseUrl is correct
  3. Check firewall settings

### ❌ "Invalid UUID"
- **Problem**: Foreign key reference invalid
- **Solution**:
  1. Use actual IDs from previous requests
  2. Create parent resource first (category before product)

---

## API Server Status

✅ **Server Running**: http://localhost:3000  
✅ **Database Connected**: medical_db (PostgreSQL)  
✅ **JWT Authentication**: Enabled  
✅ **Email Service**: Configured  
✅ **Validation**: Active  

---

## Documentation Files

1. **POSTMAN_GUIDE.md**
   - Complete authentication flow
   - All endpoint details with examples
   - Request/response format
   - Testing tips

2. **ENDPOINTS_SUMMARY.md**
   - Quick reference table
   - DTO structures
   - Validation rules
   - Response codes
   - Common workflows

3. **This File** (QUICK_START.md)
   - Fast setup in 5 minutes
   - Common workflows
   - Troubleshooting

---

## What's Included

✅ **21 API Endpoints**
- 5 Auth endpoints (register, login, OTP, password reset)
- 3 User endpoints (list, update email, change password)
- 2 Category endpoints (create, list)
- 3 Product endpoints (create, list, update)
- 2 Faculty endpoints (create, list)
- 2 Facility endpoints (create, list)
- 2 Workshop endpoints (create, list)

✅ **Complete DTO Coverage**
- All request bodies documented
- All query parameters listed
- All field validations specified

✅ **Response Examples**
- Success responses (2xx)
- Error responses (4xx/5xx)
- Real-world examples

✅ **Environment Variables**
- Pre-configured base URL
- Token auto-population
- Easy switching between environments

---

## Next Steps

### 1. **Explore the Collection**
   - Browse through each endpoint
   - Read descriptions
   - Review example requests

### 2. **Test Each Module**
   - Follow the common workflows
   - Verify responses match examples
   - Try different parameters

### 3. **Set Up Your Data**
   - Create test categories
   - Create test products
   - Create test facilities
   - Create test workshops

### 4. **Integrate with Your App**
   - Use endpoint URLs in your frontend
   - Implement error handling
   - Store JWT tokens securely

### 5. **Review Source Code**
   - Check `src/` for implementations
   - Review DTOs for validation rules
   - Understand entity relationships

---

## Version Info

- **API Version**: 1.0.0
- **Collection Format**: Postman v2.1.0
- **Last Updated**: March 1, 2026
- **Status**: ✅ Production Ready

---

## Support

For detailed information:
- **Setup Issues** → read POSTMAN_GUIDE.md
- **Endpoint Details** → read ENDPOINTS_SUMMARY.md
- **Server Issues** → check logs in terminal
- **Code Issues** → review source in src/

---

## You're Ready! 🎉

```
1. ✅ Collection imported
2. ✅ Environment configured
3. ✅ Token obtained
4. ✅ Ready to test!

→ Start with: Auth → Register → Login
→ Then test: Categories → Facilities → Products
→ Finally: Workshops → Faculty
```

**Happy Testing!** 🚀

