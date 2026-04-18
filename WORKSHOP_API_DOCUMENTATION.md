# Workshop API Documentation

## Overview
Complete API documentation for workshop management including creation, listing, updates, and public access.

---

## Admin Workshop Endpoints

### 1. Create/Update Workshop (Upsert)
**Endpoint:** `POST /admin/workshops`

**Description:** Creates a new workshop or updates an existing one. Supports draft creation with partial data.

**Authentication:** Required (Admin role)

**Request Body:**
```typescript
{
  // Optional ID for upsert functionality
  id?: string;
  
  // Basic Information
  title?: string;                    // Max 220 chars
  shortBlurb?: string;
  coverImageUrl?: string;
  learningObjectives?: string;
  
  // Status & Delivery
  status?: 'draft' | 'published' | 'cancelled';
  deliveryMode?: 'online' | 'in_person';
  offersCmeCredits?: boolean;
  
  // Online Workshop Fields
  webinarPlatform?: string;           // "Zoom", "Teams", etc.
  meetingLink?: string;
  meetingPassword?: string;
  autoRecordSession?: boolean;
  
  // Capacity & Pricing
  capacity?: number;
  alertAt?: number;                  // Alert when enrolled reaches this number
  standardBaseRate?: string;         // "299.99" format
  groupDiscountEnabled?: boolean;
  
  // Registration Deadline
  registrationDeadline?: string;     // ISO datetime: "2026-04-20T15:00:00Z"
  
  // Location (for in-person)
  facilityIds?: string[];            // Array of facility UUIDs
  
  // Group Discounts
  groupDiscounts?: {
    minimumAttendees: number;
    groupRatePerPerson: string;      // "249.99" format
  }[];
  
  // Schedule
  days?: {
    dayNumber: number;
    date: string;                    // "2024-06-15"
    segments: {
      segmentNumber: number;
      courseTopic: string;
      topicDetails?: string;
      startTime: string;             // "9:00 AM"
      endTime: string;               // "10:30 AM"
    }[];
  }[];
  
  // Faculty
  facultyIds?: string[];             // Array of faculty UUIDs
}
```

**Response:**
```typescript
{
  id: string;
  title: string;
  status: 'draft' | 'published';
  deliveryMode: 'online' | 'in_person';
  registrationDeadline: Date | null;  // Always returned
  // ... all other workshop fields
  createdAt: Date;
  updatedAt: Date;
}
```

**Examples:**
```bash
# Create draft
curl -X POST /admin/workshops \
  -H "Content-Type: application/json" \
  -d '{"title": "New Workshop", "status": "draft"}'

# Update existing workshop
curl -X POST /admin/workshops \
  -H "Content-Type: application/json" \
  -d '{"id": "workshop-uuid", "title": "Updated Title"}'

# Create complete workshop
curl -X POST /admin/workshops \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Complete Workshop",
    "deliveryMode": "online",
    "status": "published",
    "registrationDeadline": "2026-04-20T15:00:00Z",
    "standardBaseRate": "299.99",
    "capacity": 50,
    "days": [...]
  }'
```

---

### 2. List Workshops
**Endpoint:** `GET /admin/workshops`

**Description:** Returns paginated list of workshops with filtering and sorting options.

**Authentication:** Required (Admin role)

**Query Parameters:**
```typescript
{
  // Pagination
  page?: number;                     // Default: 1
  limit?: number;                    // Default: 10, Max: 100
  
  // Search & Filters
  search?: string;                   // Search in title/description
  deliveryMode?: 'online' | 'in_person';
  status?: 'draft' | 'published' | 'cancelled';
  offersCmeCredits?: boolean;
  groupDiscountEnabled?: boolean;
  facultyId?: string;                // Faculty UUID
  
  // Date Filters
  upcoming?: boolean;                // Workshops with future dates
  past?: boolean;                    // Workshops with only past dates
  hasRefundRequests?: boolean;       // Workshops with refund records
  
  // Sorting
  sortBy?: 'createdAt' | 'title' | 'startDate';
  sortOrder?: 'asc' | 'desc';
}
```

**Response:**
```typescript
{
  workshops: {
    id: string;
    title: string;
    shortBlurb?: string;
    deliveryMode: 'online' | 'in_person';
    status: 'draft' | 'published';
    registrationDeadline: Date | null;  // Always returned
    coverImageUrl?: string;
    totalEnrolled: number;
    availableSeats: number;
    createdAt: Date;
    updatedAt: Date;
  }[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

**Examples:**
```bash
# Basic listing
curl "/admin/workshops?page=1&limit=10"

# Search published workshops
curl "/admin/workshops?search=Cardiology&status=published"

# Upcoming online workshops
curl "/admin/workshops?deliveryMode=online&upcoming=true&sortBy=startDate&sortOrder=asc"

# Workshops with refund requests
curl "/admin/workshops?hasRefundRequests=true"
```

---

### 3. Get Workshop by ID
**Endpoint:** `GET /admin/workshops/:id`

**Description:** Returns complete workshop details including all relations.

**Authentication:** Required (Admin role)

**Response:**
```typescript
{
  id: string;
  title: string;
  shortBlurb?: string;
  deliveryMode: 'online' | 'in_person';
  status: 'draft' | 'published';
  registrationDeadline: Date | null;  // Always returned
  coverImageUrl?: string;
  learningObjectives?: string;
  offersCmeCredits: boolean;
  cmeCreditsCount: number;
  
  // Capacity & Pricing
  capacity: number;
  alertAt: number;
  standardBaseRate: string;
  groupDiscountEnabled: boolean;
  
  // Relations
  days: {
    id: string;
    dayNumber: number;
    date: string;
    segments: {
      id: string;
      segmentNumber: number;
      courseTopic: string;
      topicDetails?: string;
      startTime: string;
      endTime: string;
    }[];
  }[];
  
  groupDiscounts: {
    id: string;
    minimumAttendees: number;
    groupRatePerPerson: string;
  }[];
  
  faculty: {
    id: string;
    name: string;
    // ... other faculty fields
  }[];
  
  createdAt: Date;
  updatedAt: Date;
}
```

---

### 4. Delete Workshop
**Endpoint:** `DELETE /admin/workshops/:id`

**Description:** Deletes a workshop. Prevents deletion if active reservations or enrollments exist.

**Authentication:** Required (Admin role)

**Response:** `204 No Content` on success

**Error Responses:**
- `400 Bad Request` - Workshop has active reservations/enrollments
- `404 Not Found` - Workshop not found

**Refund Validation:**
- Prevents refunding already refunded attendees
- Error: "One or more selected attendees are already fully refunded"

---

### 5. Get Workshop Enrollees
**Endpoint:** `GET /admin/workshops/:workshopId/enrollees`

**Description:** Returns paginated list of workshop enrollees with enrollment status information.

**Authentication:** Required (Admin role)

**Query Parameters:**
```typescript
{
  // Pagination
  page?: number;                     // Default: 1
  limit?: number;                    // Default: 10, Max: 100
  
  // Search & Filters
  search?: string;                   // Search by name, email, institution
  bookingType?: 'single' | 'group'; // Filter by booking type
  enrollmentStatus?: 'BOOKED' | 'REFUND_REQUESTED' | 'PARTIAL_REFUNDED' | 'REFUNDED';
}
```

**Response:**
```typescript
{
  enrollees: {
    reservationId: string;
    bookingType: 'single' | 'group';
    groupSize: number;
    studentInfo: {
      fullName: string;
      email: string;
      phoneNumber?: string;
    };
    institutionOrHospital?: string;
    registeredAt: Date;
    paymentAmount: string;
    status: 'BOOKED' | 'REFUND_REQUESTED' | 'PARTIAL_REFUNDED' | 'REFUNDED';
    paymentGateway?: string;
    transactionId?: string;
    members: {
      attendeeId: string;
      fullName: string;
      email: string;
      status: 'CONFIRMED' | 'REFUNDED';  // Individual members are either confirmed or fully refunded
    }[];
  }[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

**Enrollment Status Logic:**
- **BOOKED** - Normal confirmed booking (no refunds or requests)
- **REFUND_REQUESTED** - Pending refund request exists (highest priority)
- **PARTIAL_REFUNDED** - Some (but not all) attendees refunded
- **REFUNDED** - All attendees fully refunded

**Member Status Logic:**
- **CONFIRMED** - Attendee is actively enrolled
- **REFUNDED** - Attendee has been fully refunded (no partial refunds for individuals)

**Booking Type Logic:**
- **single** - 1 attendee (numberOfSeats = 1)
- **group** - 2+ attendees (numberOfSeats > 1)

**Examples:**
```bash
# Get all enrollees
curl "/admin/workshops/workshop-uuid/enrollees?page=1&limit=10"

# Filter by enrollment status
curl "/admin/workshops/workshop-uuid/enrollees?enrollmentStatus=REFUND_REQUESTED"

# Search by name or email
curl "/admin/workshops/workshop-uuid/enrollees?search=john"

# Filter by booking type
curl "/admin/workshops/workshop-uuid/enrollees?bookingType=group"
```

---

### 6. Get Refund Preview
**Endpoint:** `GET /admin/workshops/:workshopId/enrollees/:reservationId/refund-preview`

**Description:** Returns refund preview for a specific reservation.

**Authentication:** Required (Admin role)

**Response:**
```typescript
{
  reservation: {
    id: string;
    numberOfSeats: number;
    totalPrice: string;
    attendees: {
      id: string;
      fullName: string;
      email: string;
    }[];
  };
  refundableAmount: string;
  refundableAttendees: {
    attendeeId: string;
    fullName: string;
    refundAmount: string;
  }[];
}
```

---

### 7. Confirm Refund
**Endpoint:** `POST /admin/workshops/:workshopId/refunds`

**Description:** Processes refund for workshop enrollees.

**Authentication:** Required (Admin role)

**Request Body:**
```typescript
{
  reservationId: string;
  attendeeIds: string[];
  refundAmount: string;
  reason: string;
  adjustmentNote?: string;
  paymentGateway?: string;
  transactionId?: string;
}
```

**Response:**
```typescript
{
  refundId: string;
  requestId: string;
  status: 'PROCESSED';
  refundAmount: string;
  processedAt: Date;
  attendees: {
    attendeeId: string;
    status: 'REFUNDED' | 'PARTIAL_REFUNDED';
    refundAmount: string;
  }[];
}
```

---

### 8. Get Workshop Statistics
**Endpoint:** `GET /admin/workshops/stats`

**Description:** Returns statistics for workshops within a specified date range (next 5 days by default).

**Authentication:** Required (Admin role)

**Query Parameters:**
```typescript
{
  startDate?: string;  // Format: "2026-04-26" (defaults to today)
  days?: number;      // Number of days from start date (default: 5)
}
```

**Response:**
```typescript
{
  period: {
    startDate: string;     // "2026-04-26"
    endDate: string;       // "2026-05-01"
    days: number;          // 5
  };
  summary: {
    totalWorkshops: number;
    totalActiveSeats: number;
    totalFilledSeats: number;
    totalRefundRequests: number;
    overallOccupancyRate: number;  // Percentage
  };
  workshops: [
    {
      workshopId: string;
      title: string;
      startDate: string;      // "2026-04-28"
      endDate: string;        // "2026-04-29"
      totalActiveSeats: number;  // Workshop capacity
      totalFilledSeats: number;  // Total enrolled
      totalRefundRequests: number;
      availableSeats: number;   // Active - Filled
      occupancyRate: number;    // Percentage for this workshop
    }
  ];
}
```

**Examples:**
```bash
# Next 5 days from today (default)
curl "/admin/workshops/stats"

# Next 7 days from April 26, 2026
curl "/admin/workshops/stats?startDate=2026-04-26&days=7"

# Next 3 days from today
curl "/admin/workshops/stats?days=3"
```

**Features:**
- Only includes **published** workshops
- Shows workshops with at least one session in the date range
- Calculates occupancy rates and refund statistics
- Sorted by workshop start date
- Includes both individual workshop and overall summary statistics

---

## Public Workshop Endpoints

### 1. List Public Workshops
**Endpoint:** `GET /workshops`

**Description:** Returns list of published workshops for public viewing.

**Authentication:** Not required

**Query Parameters:** Same as admin list endpoint (except admin-only filters)

**Response:**
```typescript
{
  workshops: {
    id: string;
    title: string;
    shortBlurb?: string;
    deliveryMode: 'online' | 'in_person';
    registrationDeadline: Date | null;  // Always returned
    workshopPhoto?: string;
    totalHours: string;               // "8 hours"
    cmeCredits: boolean;
    totalEnrolled: number;
    availableSeats: number;
    startDate: string;
    endDate: string;
    numberOfDays: number;
    facility: string;
    price: string;
    groupDiscount: boolean;
  }[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

---

### 2. Get Workshop Details
**Endpoint:** `GET /workshops/:id`

**Description:** Returns detailed workshop information for public viewing.

**Authentication:** Not required

**Response:**
```typescript
{
  id: string;
  title: string;
  description?: string;
  deliveryMode: 'online' | 'in_person';
  registrationDeadline: Date | null;  // Always returned
  workshopPhoto?: string;
  totalHours: string;
  cmeCredits: boolean;
  startDate: string;
  endDate: string;
  numberOfDays: number;
  
  // Detailed schedule
  days: {
    date: string;
    dayNumber: number;
    segments: {
      startTime: string;
      endTime: string;
      topic: string;
      details?: string;
    }[];
  }[];
  
  // Faculty information
  faculty: {
    name: string;
    title?: string;
    bio?: string;
    photo?: string;
  }[];
  
  // Pricing
  price: string;
  groupDiscount: boolean;
  groupDiscounts?: {
    minimumAttendees: number;
    ratePerPerson: string;
  }[];
  
  // Location/Online details
  facility?: string;
  onlineDetails?: {
    platform: string;
    link?: string;
  };
  
  // Availability
  totalEnrolled: number;
  availableSeats: number;
  alertAt: number;
}
```

---

## Workshop Purchase Flow

### 1. Create Order Summary
**Endpoint:** `POST /workshops/checkout/order-summary`

**Description:** Creates an order summary for workshop purchase. Validates registration deadline.

**Authentication:** Required

**Request Body:**
```typescript
{
  workshopId: string;
  attendees: {
    fullName: string;
    professionalRole?: string;
    npiNumber?: string;
    email: string;
  }[];
}
```

**Response:**
```typescript
{
  id: string;
  workshopId: string;
  userId: string;
  numberOfSeats: number;
  pricePerSeat: string;
  totalPrice: string;
  discountApplied: boolean;
  discountInfo?: string;
  status: 'PENDING' | 'COMPLETED' | 'EXPIRED';
  expiresAt: Date;
  workshop: {
    id: string;
    title: string;
    registrationDeadline: Date | null;  // Always returned
    deliveryMode: string;
    coverImageUrl?: string;
  };
  attendees: {
    fullName: string;
    professionalRole?: string;
    npiNumber?: string;
    email: string;
  }[];
  createdAt: Date;
}
```

---

### 2. Get Order Summary
**Endpoint:** `GET /workshops/checkout/order-summary/:id`

**Description:** Retrieves an existing order summary.

**Authentication:** Required

**Response:** Same as create order summary response.

---

### 3. Create Reservation
**Endpoint:** `POST /workshops/reservations`

**Description:** Creates a reservation from an order summary. Validates registration deadline.

**Authentication:** Required

**Request Body:**
```typescript
{
  workshopId: string;
  attendeeIds: string[];              // Attendee UUIDs from order summary
}
```

**Response:**
```typescript
{
  id: string;
  workshopId: string;
  userId: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  totalAmount: string;
  numberOfAttendees: number;
  attendees: {
    id: string;
    fullName: string;
    email: string;
    professionalRole?: string;
    npiNumber?: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Registration Deadline Behavior

The `registrationDeadline` field is enforced throughout the system:

### **Validation Points:**
1. **Order Summary Creation** - Prevents creating order summaries after deadline
2. **Reservation Creation** - Prevents creating reservations after deadline  
3. **Payment Processing** - Prevents payments after deadline

### **Deadline Format:**
- **Input:** ISO datetime string: `"2026-04-20T15:00:00Z"`
- **Output:** Date object or `null` if not set
- **Timezone:** UTC (handled by backend)

### **Frontend Integration:**
```typescript
// Check if registration is still open
const isRegistrationOpen = (deadline: Date | null) => {
  if (!deadline) return true; // No deadline set
  return new Date() < new Date(deadline);
};

// Format deadline for display
const formatDeadline = (deadline: Date | null) => {
  if (!deadline) return 'No deadline';
  return new Intl.DateTimeFormat('en-US', {
    date: 'full',
    time: 'long'
  }).format(new Date(deadline));
};
```

### **Error Messages:**
When registration deadline has passed:
```json
{
  "message": "Registration for this workshop has closed. You cannot create or modify reservations.",
  "error": "BadRequestException"
}
```

---

## Common Response Fields

Every workshop endpoint returns the `registrationDeadline` field consistently:

```typescript
{
  // ... other fields
  registrationDeadline: Date | null,  // Always included
  // ... other fields
}
```

- **`null`** - No registration deadline set
- **`Date`** - Registration deadline in UTC
- **Format:** ISO datetime in API responses

---

## Error Handling

### **Common Error Codes:**
- `400 Bad Request` - Validation errors, registration deadline passed
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Admin access required
- `404 Not Found` - Workshop/resource not found
- `409 Conflict` - Duplicate resource, capacity exceeded

### **Registration Deadline Errors:**
```json
{
  "message": "Registration for this workshop has closed. You cannot purchase this course anymore.",
  "error": "BadRequestException"
}
```

---

## Rate Limits & Constraints

- **Maximum capacity:** Enforced per workshop
- **Registration deadline:** Hard cutoff for all registration activities
- **Group discounts:** Applied automatically based on attendee count
- **Faculty assignment:** Multiple faculty can be assigned to one workshop

---

## Testing Examples

### **Test Registration Deadline:**
```bash
# Create workshop with deadline
curl -X POST /admin/workshops \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Deadline Test Workshop",
    "registrationDeadline": "2026-04-20T15:00:00Z",
    "status": "published"
  }'

# Try to register after deadline (will fail)
curl -X POST /workshops/checkout/order-summary \
  -H "Content-Type: application/json" \
  -d '{"workshopId": "uuid", "attendees": [...]}'
```

### **Test Upsert Functionality:**
```bash
# Create draft
curl -X POST /admin/workshops \
  -H "Content-Type: application/json" \
  -d '{"title": "Draft Workshop"}'

# Update with more data
curl -X POST /admin/workshops \
  -H "Content-Type: application/json" \
  -d '{"id": "returned-uuid", "deliveryMode": "online"}'

# Publish
curl -X POST /admin/workshops \
  -H "Content-Type: application/json" \
  -d '{"id": "returned-uuid", "status": "published"}'
```

---

*Last updated: April 2026*
