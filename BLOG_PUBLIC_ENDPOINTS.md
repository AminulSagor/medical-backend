# Public Blog Endpoints API Contract

This document defines the public blog APIs for listing, trending, and reading published blog details.

Updated on: 2026-04-09

## Base URL
- Local: http://localhost:3000
- Production: use your deployed API host

## Authentication
These endpoints are public and do not require JWT.

Global error shape used by backend:
```json
{
  "statusCode": 404,
  "path": "/requested/path",
  "message": "Blog post not found or not published"
}
```

---

## 1) List Public Blogs

### Endpoint
- Method: GET
- Path: /public/blogs
- Auth: Not required
- Request body: None

### Query params
- page (optional, number, default 1, min 1)
- limit (optional, number, default 10, min 1)
- search (optional, string)
  - Searches title, excerpt, and content.
- categoryId (optional, string)
- sortBy (optional, string)
  - Allowed: latest, oldest, featured
  - Default: latest

### Request variants

#### Variant A: default listing
```bash
curl --location 'http://localhost:3000/public/blogs'
```

#### Variant B: paginated latest blogs
```bash
curl --location 'http://localhost:3000/public/blogs?page=1&limit=12&sortBy=latest'
```

#### Variant C: filter by category
```bash
curl --location 'http://localhost:3000/public/blogs?categoryId=<blog_category_uuid>'
```

#### Variant D: search by keyword
```bash
curl --location 'http://localhost:3000/public/blogs?search=airway'
```

### Success response (200)
```json
{
  "items": [
    {
      "id": "dc6cf788-8fc3-4fc0-9e70-6704f5207f67",
      "title": "Advanced Airway Management in ICU",
      "description": "Best practices for difficult airway in critical care...",
      "coverImageUrl": "https://cdn.example.com/blog/airway.jpg",
      "categories": [
        {
          "id": "2f67f15f-b4e9-4f6e-b4d0-76d2f7d3cb67",
          "name": "Critical Care"
        }
      ],
      "authors": [
        {
          "id": "1d3766e2-3a61-4d84-a90d-e5d799f3a28b",
          "fullLegalName": "Dr. Sarah Jones",
          "professionalRole": "Anesthesiologist",
          "profilePhotoUrl": "https://cdn.example.com/users/sarah.jpg"
        }
      ],
      "readTimeMinutes": 7,
      "readCount": 3245,
      "readBy": "3.2k",
      "publishedAt": "2026-04-01T08:00:00.000Z",
      "isFeatured": true
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 48,
    "totalPages": 5
  }
}
```

### Success response (200) - empty list
```json
{
  "items": [],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 0,
    "totalPages": 0
  }
}
```

---

## 2) List Trending Public Blogs

### Endpoint
- Method: GET
- Path: /public/blogs/trending
- Auth: Not required
- Request body: None

### Query params
- limit (optional, number, default 6, min 1, max 50)

### Request variants

#### Variant A: default trending list
```bash
curl --location 'http://localhost:3000/public/blogs/trending'
```

#### Variant B: top 10 trending blogs
```bash
curl --location 'http://localhost:3000/public/blogs/trending?limit=10'
```

### Success response (200)
```json
{
  "items": [
    {
      "id": "dc6cf788-8fc3-4fc0-9e70-6704f5207f67",
      "title": "Advanced Airway Management in ICU",
      "description": "Best practices for difficult airway in critical care...",
      "coverImageUrl": "https://cdn.example.com/blog/airway.jpg",
      "categories": [
        {
          "id": "2f67f15f-b4e9-4f6e-b4d0-76d2f7d3cb67",
          "name": "Critical Care"
        }
      ],
      "authors": [
        {
          "id": "1d3766e2-3a61-4d84-a90d-e5d799f3a28b",
          "fullLegalName": "Dr. Sarah Jones",
          "professionalRole": "Anesthesiologist",
          "profilePhotoUrl": "https://cdn.example.com/users/sarah.jpg"
        }
      ],
      "readTimeMinutes": 7,
      "readCount": 3245,
      "readBy": "3.2k",
      "publishedAt": "2026-04-01T08:00:00.000Z",
      "isFeatured": true
    }
  ],
  "meta": {
    "limit": 6,
    "total": 6
  }
}
```

### Error response (400) - invalid query
```json
{
  "statusCode": 400,
  "path": "/public/blogs/trending?limit=0",
  "message": [
    "limit must not be less than 1"
  ]
}
```

---

## 3) Get Public Blog Details

### Endpoint
- Method: GET
- Path: /public/blogs/:id
- Auth: Not required
- Request body: None

Behavior note:
- Each successful details request increments the blog readCount by 1.

### Request variants

#### Variant A: valid published blog id
```bash
curl --location 'http://localhost:3000/public/blogs/dc6cf788-8fc3-4fc0-9e70-6704f5207f67'
```

#### Variant B: blog not found or not published
```bash
curl --location 'http://localhost:3000/public/blogs/00000000-0000-0000-0000-000000000000'
```

### Success response (200)
```json
{
  "id": "dc6cf788-8fc3-4fc0-9e70-6704f5207f67",
  "title": "Advanced Airway Management in ICU",
  "content": "Full article content...",
  "description": "Best practices for difficult airway in critical care...",
  "coverImageUrl": "https://cdn.example.com/blog/airway.jpg",
  "categories": [
    {
      "id": "2f67f15f-b4e9-4f6e-b4d0-76d2f7d3cb67",
      "name": "Critical Care"
    }
  ],
  "tags": [
    {
      "id": "7958f677-b7be-4577-82fb-f6e5f682a04a",
      "name": "ICU"
    }
  ],
  "authors": [
    {
      "id": "1d3766e2-3a61-4d84-a90d-e5d799f3a28b",
      "fullLegalName": "Dr. Sarah Jones",
      "professionalRole": "Anesthesiologist",
      "profilePhotoUrl": "https://cdn.example.com/users/sarah.jpg"
    }
  ],
  "readTimeMinutes": 7,
  "readCount": 3246,
  "readBy": "3.2k",
  "publishedAt": "2026-04-01T08:00:00.000Z",
  "isFeatured": true,
  "seo": {
    "metaTitle": "Advanced Airway Management in ICU",
    "metaDescription": "Clinical strategies for difficult airway in intensive care settings."
  }
}
```

### Error response (404)
```json
{
  "statusCode": 404,
  "path": "/public/blogs/00000000-0000-0000-0000-000000000000",
  "message": "Blog post not found or not published"
}
```
