# Workshop Update Internal Server Error - Fixes Applied

## Issue Summary
Internal server error (500) when updating workshop by admin in the upsert method.

## Root Cause Found & Fixed

### 1. ✅ FIXED: Deprecated `findByIds()` Method
**Location:** `src/workshops/workshops.service.ts` (lines 672 and 872)

**Problem:** 
- Used deprecated `findByIds()` method which was removed in TypeORM v0.3.0
- Your project uses TypeORM v0.3.28, where this method doesn't exist
- This causes an internal server error

**Solution Applied:**
Replaced both instances:
```typescript
// BEFORE (deprecated)
facultyEntities = await this.facultyRepo.findByIds(dto.facultyIds as any);

// AFTER (correct)
facultyEntities = await this.facultyRepo.find({
  where: { id: In(dto.facultyIds) },
});
```

---

## Additional Issues in Your Request Payload

### 2. ⚠️ TIME FORMAT ERROR
Your request has incorrect time format:

**Current (WRONG):**
```json
"startTime": "11:11AM",
"endTime": "12:12PM"
```

**Required (CORRECT):**
```json
"startTime": "11:11 AM",
"endTime": "12:12 PM"
```

**Why:** The parser regex requires a space: `/^(\d{1,2}):(\d{2})\s+(AM|PM)$/i`

---

## Corrected Request Payload

```json
{
  "id": "d5bf2e00-a0da-476c-815d-e80d2ceb4dd7",
  "deliveryMode": "in_person",
  "status": "draft",
  "title": "Test Draft 3",
  "offersCmeCredits": true,
  "cmeCreditsCount": 10,
  "facilityIds": ["8a0a065e-d81b-45f6-a2c1-2eb9637e8bb6"],
  "webinarPlatform": null,
  "meetingLink": null,
  "meetingPassword": null,
  "autoRecordSession": false,
  "capacity": 24,
  "alertAt": 5,
  "standardBaseRate": "450",
  "groupDiscountEnabled": false,
  "groupDiscounts": [],
  "facultyIds": [],
  "days": [
    {
      "date": "2026-04-20",
      "dayNumber": 1,
      "segments": [
        {
          "segmentNumber": 1,
          "courseTopic": "test topic 1",
          "startTime": "11:11 AM",
          "endTime": "12:12 PM"
        }
      ]
    }
  ]
}
```

---

## Testing Instructions

1. **Rebuild** the application:
   ```bash
   npm run build
   ```

2. **Test the update endpoint** with the corrected time format:
   ```
   POST /admin/workshops
   Body: [see corrected payload above]
   ```

3. **Verify** the workshop updates without internal server error
