# Public Blog Endpoints

## Overview
Two new public endpoints have been added for viewing published blog posts. These endpoints are **public** and do not require authentication.

---

## Endpoints Summary

### 1. **GET** `/public/blogs`
List latest published blog posts with filtering and sorting.

**Query Parameters (all optional):**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10)
- `search` - Search in title, excerpt, content
- `categoryId` - Filter by category UUID
- `sortBy` - Sort options: `latest` (default), `oldest`, `featured`

**Response format:**
```json
{
  "items": [
    {
      "id": "b50e8400-e29b-41d4-a716-446655440010",
      "title": "Advances in Minimally Invasive Surgery",
      "description": "Explore the latest techniques...",
      "coverImageUrl": "https://example.com/images/surgery-blog.jpg",
      "categories": [
        {
          "id": "c50e8400-e29b-41d4-a716-446655440001",
          "name": "Surgery"
        }
      ],
      "authors": [
        {
          "id": "550e8400-e29b-41d4-a716-446655440000",
          "fullLegalName": "Dr. John Smith",
          "professionalRole": "Surgeon",
          "profilePhotoUrl": "https://example.com/images/dr-smith.jpg"
        }
      ],
      "readTimeMinutes": 8,
      "publishedAt": "2026-03-08T10:00:00Z",
      "isFeatured": true
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  }
}
```

**Use case:** Blog listing page, homepage blog feed

---

### 2. **GET** `/public/blogs/:id`
Get complete blog post details by ID.

**URL Parameters:**
- `id` - Blog post UUID (REQUIRED)

**Response includes:**
- Full content (HTML)
- Categories and tags
- Author information with profile photos
- Reading time in minutes
- SEO metadata

**Use case:** Blog detail/reading page

**Note:** Returns 404 if blog post is not published

---

## New Features Added

### Entity Updates

**1. User Entity (`src/users/entities/user.entity.ts`)**
- ✅ Added `profilePhotoUrl` field (nullable text)
  - Stores author profile photo URLs
  - Displayed in blog post listings and details

**2. BlogPost Entity (`src/blog/entities/blog-post.entity.ts`)**
- ✅ Added `readTimeMinutes` field (integer, default: 5)
  - Estimated reading time for blog posts
  - Helps users gauge content length

### DTOs Created

**1. ListPublicBlogsQueryDto** (`src/blog/dto/list-public-blogs.query.dto.ts`)
- Query parameters for filtering and pagination
- Validation with class-validator decorators

### Controllers

**1. PublicBlogController** (`src/blog/public-blog.controller.ts`)
- Two GET endpoints for public access
- No authentication guards
- Clean, simple controller structure

### Service Methods

**Added to BlogService** (`src/blog/blog.service.ts`):

**1. `findAllPublic(query)`**
- Fetches only PUBLISHED blog posts
- Filters by search term and category
- Sorts by latest, oldest, or featured
- Returns sanitized author data with profile photos
- Pagination support

**2. `findOnePublic(id)`**
- Fetches single published blog post
- Returns full content and metadata
- Includes all related data (categories, tags, authors)
- Returns 404 for unpublished posts

**3. `sanitizePublicAuthor(author)`**
- Removes sensitive author data (email, password)
- Returns only public fields:
  - id, fullLegalName, professionalRole, profilePhotoUrl

---

## Postman Collection

All endpoints have been added to `Medical-Backend-API.postman_collection.json` under the folder **"Public - Blogs"**.

Each endpoint includes:
- ✅ Complete request examples
- ✅ Success response samples
- ✅ Error response samples
- ✅ Query parameter descriptions
- ✅ Comprehensive documentation

**Total Endpoints in Collection:** 25 (23 previous + 2 new)

---

## Response Data Structure

### Blog List Item
Each blog in the list includes:
- **categories**: Array of category objects (id, name)
- **title**: Blog post title
- **description**: Excerpt or first 200 characters
- **authors**: Array with profile info and photo
- **readTimeMinutes**: Estimated reading time

### Blog Details
Full blog post includes:
- All fields from list item
- **content**: Full HTML content
- **tags**: Array of tag objects
- **seo**: SEO metadata (metaTitle, metaDescription)

### Author Object (Public)
Only public information returned:
```json
{
  "id": "uuid",
  "fullLegalName": "Dr. John Smith",
  "professionalRole": "Surgeon",
  "profilePhotoUrl": "https://example.com/photo.jpg"
}
```

**Note:** Email and password are never exposed in public endpoints

---

## Security & Privacy

✅ **Publishing Status Check**
- Only posts with `publishingStatus = 'published'` are accessible
- Draft and scheduled posts return 404

✅ **Author Data Sanitization**
- Medical email addresses are not exposed
- Passwords are never included
- Only public profile information returned

✅ **No Authentication Required**
- Public endpoints work without JWT tokens
- Suitable for public-facing website/blog

---

## Testing in Postman

1. **Import Collection:** Import `Medical-Backend-API.postman_collection.json`
2. **Set Base URL:** Set `{{baseUrl}}` to `http://localhost:3000`
3. **Test Endpoints:**
   - List blogs: Test with different filters and sorting
   - Get blog details: Use a valid published blog ID
4. **No Auth Required:** Test directly without login

---

## Use Cases

**Blog Listing Page:**
- Display latest blogs with pagination
- Filter by category
- Search functionality
- Show author profiles and reading time

**Blog Detail Page:**
- Full blog content with formatting
- Author bio with photo
- Related categories and tags
- SEO-optimized metadata

**Homepage Blog Feed:**
- Display featured blogs
- Show latest 5-10 posts
- Preview with read more link

---

## Updated Files

**Entity Updates:**
- `src/users/entities/user.entity.ts` (added profilePhotoUrl)
- `src/blog/entities/blog-post.entity.ts` (added readTimeMinutes)

**New Files:**
- `src/blog/public-blog.controller.ts`
- `src/blog/dto/list-public-blogs.query.dto.ts`

**Updated Files:**
- `src/blog/blog.module.ts` (registered public controller)
- `src/blog/blog.service.ts` (added public methods)
- `src/blog/dto/create-blog-post.dto.ts` (added readTimeMinutes validation)
- `Medical-Backend-API.postman_collection.json` (added public blog section)
- `POSTMAN_GUIDE.md` (added documentation)
