// SQL Query Verification for Admin Workshops Endpoint
// This file documents the expected SQL queries for different filter combinations

// ============================================
// Test Case 1: Published Online Workshops with Refunds
// Query: GET /admin/workshops?status=published&deliveryMode=online&hasRefundRequests=true&sortBy=title&sortOrder=asc
// ============================================
/*
Expected SQL:
SELECT "w"."id", "w"."title", "w"."shortBlurb", ... (all workshop columns)
FROM "workshops" "w"
WHERE "w"."status" = $1 ('published')
  AND "w"."deliveryMode" = $2 ('online')
  AND EXISTS (
    SELECT 1 FROM "workshop_refunds" "wr" 
    WHERE "wr"."workshopId" = "w"."id"
  )
ORDER BY "w"."title" ASC
LIMIT $3 (10) OFFSET $4 (0)

Status: ✓ VALID - Clean, no GROUP BY issues, no duplicate rows
*/

// ============================================
// Test Case 2: Upcoming Workshops
// Query: GET /admin/workshops?upcoming=true&page=1&limit=10
// ============================================
/*
Expected SQL:
SELECT "w"."id", "w"."title", ... (all workshop columns)
FROM "workshops" "w"
WHERE "w"."id" IN (
  SELECT DISTINCT "wd"."workshopId" 
  FROM "workshop_days" "wd" 
  WHERE "wd"."date" >= CURRENT_DATE
)
LIMIT 10 OFFSET 0

Status: ✓ VALID - Subquery approach works with pagination
*/

// ============================================
// Test Case 3: Past Workshops
// Query: GET /admin/workshops?past=true&page=1&limit=10
// ============================================
/*
Expected SQL:
SELECT "w"."id", "w"."title", ... (all workshop columns)
FROM "workshops" "w"
WHERE "w"."id" NOT IN (
  SELECT DISTINCT "wd"."workshopId" 
  FROM "workshop_days" "wd" 
  WHERE "wd"."date" >= CURRENT_DATE
)
LIMIT 10 OFFSET 0

Status: ✓ VALID - Subquery approach works correctly
*/

// ============================================
// Test Case 4: Upcoming Workshops with Refunds
// Query: GET /admin/workshops?upcoming=true&hasRefundRequests=true&sortBy=createdAt&sortOrder=desc
// ============================================
/*
Expected SQL:
SELECT "w"."id", "w"."title", ...
FROM "workshops" "w"
WHERE "w"."id" IN (
  SELECT DISTINCT "wd"."workshopId" 
  FROM "workshop_days" "wd" 
  WHERE "wd"."date" >= CURRENT_DATE
)
  AND EXISTS (
    SELECT 1 FROM "workshop_refunds" "wr" 
    WHERE "wr"."workshopId" = "w"."id"
  )
ORDER BY "w"."createdAt" DESC
LIMIT 10 OFFSET 0

Status: ✓ VALID - Multiple filters combine correctly with AND
*/

// ============================================
// Test Case 5: Complex Filter - Published Online with Title Search and Refunds
// Query: GET /admin/workshops?status=published&deliveryMode=online&q=leadership&hasRefundRequests=true&sortBy=title&sortOrder=asc&limit=20
// ============================================
/*
Expected SQL:
SELECT "w"."id", "w"."title", ...
FROM "workshops" "w"
WHERE LOWER("w"."title") LIKE $1 ('%leadership%')
  AND "w"."facilityIds" LIKE $2 (if facilityId provided)
  AND "w"."deliveryMode" = $3 ('online')
  AND "w"."status" = $4 ('published')
  AND EXISTS (
    SELECT 1 FROM "workshop_refunds" "wr" 
    WHERE "wr"."workshopId" = "w"."id"
  )
ORDER BY "w"."title" ASC
LIMIT 20 OFFSET 0

Status: ✓ VALID - All filters combine with AND operators
*/

// ============================================
// Test Case 6: Workshops at Facility with Faculty Filter
// Query: GET /admin/workshops?facilityId=fac-001&facultyId=fac-uuid&upcoming=true
// ============================================
/*
Expected SQL:
SELECT "w"."id", "w"."title", ...
FROM "workshops" "w"
INNER JOIN "workshop_faculty" "wf" 
  ON "wf"."workshopId" = "w"."id" AND "wf"."facultyId" = $1 (faculty-uuid)
WHERE "w"."facilityIds" LIKE $2 ('%fac-001%')
  AND "w"."id" IN (
    SELECT DISTINCT "wd"."workshopId" 
    FROM "workshop_days" "wd" 
    WHERE "wd"."date" >= CURRENT_DATE
  )
ORDER BY "w"."createdAt" DESC
LIMIT 10 OFFSET 0

Status: ✓ VALID - INNER JOIN for faculty works with subqueries
*/

// ============================================
// Query Architecture Improvements
// ============================================
/*
Refactored Implementation Uses:

1. ✓ Subqueries for date-based filters (upcoming/past)
   - Avoids GROUP BY issues
   - Maintains clean result set without duplication
   - Works correctly with pagination (skip/take)

2. ✓ EXISTS clause for refund filter
   - More efficient than INNER JOIN + GROUP BY
   - Doesn't add overhead to result row count
   - Scales better with large refund tables

3. ✓ INNER JOIN only for relationships that need to be checked
   - Faculty filter uses INNER JOIN (required)
   - Other conditions use subqueries/EXISTS (cleaner)

4. ✓ No GROUP BY in main query
   - Previous implementation had GROUP BY issues
   - New implementation avoids SQL standard violations
   - Works across all SQL database engines

5. ✓ Proper parameter binding
   - All filter values use TypeORM parameter binding
   - Prevents SQL injection
   - Maintains query performance with prepared statements
*/

// ============================================
// Potential Issues - RESOLVED
// ============================================
/*
❌ FIXED: GROUP BY w.id with leftJoinAndSelect
   - Previous: Would cause issues with selected columns
   - Current: Uses subqueries instead

❌ FIXED: Multiple groupBy calls
   - Previous: Conflicting groupBy calls when multiple filters applied
   - Current: Uses WHERE subqueries, no groupBy conflicts

❌ FIXED: leftJoinAndSelect affecting result structure
   - Previous: Days array would be replicated for each workshop
   - Current: No unnecessary joins in main query

❌ FIXED: Pagination with GROUP BY
   - Previous: skip/take might not work correctly with GROUP BY
   - Current: Standard pagination works with subqueries
*/
