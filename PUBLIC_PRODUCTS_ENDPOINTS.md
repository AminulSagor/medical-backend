# Public Products API Endpoints

## Overview
Four new public endpoints have been added for product browsing, filtering, and cart calculations. These endpoints are **public** and do not require authentication.

---

## Endpoints Summary

### 1. **GET** `/public/products/categories`
Returns all product categories with counts and sample products.

**Response includes:**
- List of categories with product counts
- All available brands
- Sample products (up to 4 per category)

**Use case:** Homepage category display, filter options

---

### 2. **GET** `/public/products`
Lists products with comprehensive filtering and sorting.

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 12)
- `search` - Search text (searched in name, SKU, description)
- `categoryIds` - Array of category UUIDs
- `brands` - Array of brand names
- `minPrice` - Minimum price filter
- `maxPrice` - Maximum price filter
- `sortBy` - Sort options: `price-asc`, `price-desc`, `name-asc`, `name-desc`, `newest`

**Response format:**
```json
{
  "items": [
    {
      "id": "uuid",
      "photo": "url",
      "category": "Category Name",
      "title": "Product Name",
      "description": "Product description",
      "price": "150.00",
      "discountedPrice": "120.00",
      "brand": "Brand Name",
      "inStock": true
    }
  ],
  "meta": {
    "page": 1,
    "limit": 12,
    "total": 50,
    "totalPages": 5
  }
}
```

**Use case:** Product listing page with filters

---

### 3. **GET** `/public/products/:id`
Returns complete product details.

**Response includes:**
- Basic info (name, brand, SKU, description)
- Categories and tags
- Pricing (actual price, offer price, bulk tiers)
- Stock information
- Images and badges
- Clinical benefits
- Technical specifications
- Related products (frequently bought together, bundle upsells)

**Use case:** Product detail page

---

### 4. **POST** `/public/products/cart/calculate`
Calculates cart totals with tax.

**Request Body:**
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

**Validation:**
- `items` array is required and must not be empty
- `productId` must be a valid UUID
- `quantity` must be at least 1

**Response:**
```json
{
  "items": [
    {
      "productId": "uuid",
      "photo": "url",
      "name": "Product Name",
      "sku": "SKU-001",
      "inStock": true,
      "price": "120.00",
      "quantity": 2,
      "itemTotal": "240.00"
    }
  ],
  "orderSummary": {
    "subtotal": "240.00",
    "estimatedTax": "24.00",
    "orderTotal": "264.00"
  }
}
```

**Tax Calculation:** 10% of subtotal

**Use case:** Shopping cart page

---

## DTO Validation

### CartRequestDto
✅ **Valid:**
```json
{
  "items": [
    { "productId": "valid-uuid", "quantity": 2 }
  ]
}
```

❌ **Invalid - Missing items:**
```json
{}
```
Error: `"items must be an array"`, `"items should not be empty"`

❌ **Invalid - Zero quantity:**
```json
{
  "items": [
    { "productId": "valid-uuid", "quantity": 0 }
  ]
}
```
Error: `"quantity must not be less than 1"`

❌ **Invalid - Invalid UUID:**
```json
{
  "items": [
    { "productId": "invalid", "quantity": 1 }
  ]
}
```
Error: `"productId must be a UUID"`

---

## Postman Collection

All endpoints have been added to `Medical-Backend-API.postman_collection.json` under the folder **"Public - Products"**.

Each endpoint includes:
- ✅ Complete request examples
- ✅ Success response samples
- ✅ Error response samples (for cart endpoint)
- ✅ Full DTO validation documentation
- ✅ Query parameter descriptions

**Total Endpoints in Collection:** 25 (21 previous + 4 new)

---

## Testing in Postman

1. **Import Collection:** Import `Medical-Backend-API.postman_collection.json`
2. **Set Base URL:** Set `{{baseUrl}}` variable to `http://localhost:3000`
3. **No Auth Required:** All public endpoints can be tested without authentication
4. **Test Cart:** Use the "Calculate Cart" endpoint with sample product IDs from your database

---

## Features

✅ **Category Browsing** - View all categories with product counts and brands
✅ **Advanced Filtering** - Filter by category, brand, and price range
✅ **Search** - Search products by name, SKU, or description
✅ **Sorting** - Sort by price, name, or newest
✅ **Full Details** - Complete product information including specs and benefits
✅ **Cart Calculation** - Real-time cart totals with tax calculation
✅ **Stock Status** - In-stock indicators on all products
✅ **Price Display** - Both actual and discounted prices shown
✅ **DTO Validation** - Comprehensive validation with helpful error messages

---

## Implementation Details

**New Files Created:**
- `src/products/public-products.controller.ts`
- `src/products/dto/list-products-public.query.dto.ts`
- `src/products/dto/cart.dto.ts`

**Updated Files:**
- `src/products/entities/product.entity.ts` (added `brand` field)
- `src/products/products.service.ts` (added public methods)
- `src/products/products.module.ts` (registered public controller)
- `src/products/dto/create-product.dto.ts` (added brand validation)
- `src/products/dto/update-product.dto.ts` (added brand validation)

**Service Methods Added:**
1. `getCategoriesWithProductCount()` - Categories with counts and brands
2. `findAllPublic()` - Filtered product listing
3. `getProductDetails()` - Full product details
4. `calculateCart()` - Cart calculation with tax
