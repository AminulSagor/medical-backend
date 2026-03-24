$ErrorActionPreference = "Continue"
$base = "http://localhost:3000"
$ts = [DateTimeOffset]::Now.ToUnixTimeSeconds()
$allResults = [ordered]@{}

function Api($method, $uri, $jsonBody, $token) {
    $headers = @{}
    if ($token) { $headers["Authorization"] = "Bearer $token" }
    $params = @{ Uri = $uri; Method = $method; ContentType = "application/json"; UseBasicParsing = $true }
    if ($headers.Count -gt 0) { $params["Headers"] = $headers }
    if ($jsonBody) { $params["Body"] = [System.Text.Encoding]::UTF8.GetBytes($jsonBody) }
    try {
        $response = Invoke-WebRequest @params
        $parsed = $response.Content | ConvertFrom-Json
        return @{ statusCode = [int]$response.StatusCode; body = $parsed; success = $true; raw = $response.Content }
    } catch {
        $statusCode = 0
        $errBody = $null
        $rawErr = ""
        try {
            $statusCode = [int]$_.Exception.Response.StatusCode
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $rawErr = $reader.ReadToEnd()
            $reader.Close()
            if ($rawErr) { $errBody = $rawErr | ConvertFrom-Json }
        } catch {}
        return @{ statusCode = $statusCode; body = $errBody; success = $false; error = $_.Exception.Message; raw = $rawErr }
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MEDICAL BACKEND API - FULL TEST SUITE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# =============================================
# PHASE 1: AUTH - Register, OTP, Login for each role
# =============================================
Write-Host "`n--- PHASE 1: AUTHENTICATION ---" -ForegroundColor Yellow

# 1. Register fresh admin
$adminEmail = "admin.test$ts@hospital.com"
$r = Api "POST" "$base/auth/register" "{`"fullLegalName`":`"Dr. Test Admin`",`"medicalEmail`":`"$adminEmail`",`"professionalRole`":`"Chief Surgeon`",`"password`":`"SecurePass123`",`"forgetPassword`":false}"
$allResults["01_register_admin"] = $r
Write-Host "01. Register Admin [$($r.statusCode)]: $($r.body.message)"

# 2. Send OTP for admin
$r = Api "POST" "$base/auth/send-otp" "{`"email`":`"$adminEmail`"}"
$allResults["02_send_otp_admin"] = $r
Write-Host "02. Send OTP Admin [$($r.statusCode)]: $($r.body.message)"

# 3. Verify OTP for admin
$r = Api "POST" "$base/auth/verify-otp" "{`"email`":`"$adminEmail`",`"otp`":`"123456`"}"
$allResults["03_verify_otp_admin"] = $r
Write-Host "03. Verify OTP Admin [$($r.statusCode)]: $($r.body.message)"

# Now set this user to admin role in DB
node set_role.js $adminEmail admin 2>$null

# 4. Login Admin (get JWT with admin role)
$r = Api "POST" "$base/auth/login" "{`"email`":`"$adminEmail`",`"password`":`"SecurePass123`"}"
$allResults["04_login_admin"] = $r
$adminJwt = $r.body.accessToken
Write-Host "04. Login Admin [$($r.statusCode)]: JWT=$($adminJwt -ne $null)"

# 5. Register student user
$studentEmail = "student.test$ts@hospital.com"
$r = Api "POST" "$base/auth/register" "{`"fullLegalName`":`"Sarah Student`",`"medicalEmail`":`"$studentEmail`",`"professionalRole`":`"Medical Student`",`"password`":`"SecurePass123`",`"forgetPassword`":false}"
$allResults["05_register_student"] = $r
Write-Host "05. Register Student [$($r.statusCode)]: $($r.body.message)"

# 6. Send OTP + Verify for student
$r = Api "POST" "$base/auth/send-otp" "{`"email`":`"$studentEmail`"}"
$allResults["06_send_otp_student"] = $r
Write-Host "06. Send OTP Student [$($r.statusCode)]"
$r = Api "POST" "$base/auth/verify-otp" "{`"email`":`"$studentEmail`",`"otp`":`"123456`"}"
$allResults["07_verify_otp_student"] = $r
Write-Host "07. Verify OTP Student [$($r.statusCode)]"

# Set student role
node set_role.js $studentEmail student 2>$null

# 8. Login student
$r = Api "POST" "$base/auth/login" "{`"email`":`"$studentEmail`",`"password`":`"SecurePass123`"}"
$allResults["08_login_student"] = $r
$studentJwt = $r.body.accessToken
Write-Host "08. Login Student [$($r.statusCode)]: JWT=$($studentJwt -ne $null)"

# 9. Register instructor user
$instructorEmail = "instructor.test$ts@hospital.com"
$r = Api "POST" "$base/auth/register" "{`"fullLegalName`":`"Prof. Mike Instructor`",`"medicalEmail`":`"$instructorEmail`",`"professionalRole`":`"Professor of Surgery`",`"password`":`"SecurePass123`",`"forgetPassword`":false}"
$allResults["09_register_instructor"] = $r
Write-Host "09. Register Instructor [$($r.statusCode)]"

# OTP + Verify for instructor
Api "POST" "$base/auth/send-otp" "{`"email`":`"$instructorEmail`"}" | Out-Null
Api "POST" "$base/auth/verify-otp" "{`"email`":`"$instructorEmail`",`"otp`":`"123456`"}" | Out-Null

# Set instructor role
node set_role.js $instructorEmail instructor 2>$null

# 10. Login instructor
$r = Api "POST" "$base/auth/login" "{`"email`":`"$instructorEmail`",`"password`":`"SecurePass123`"}"
$allResults["10_login_instructor"] = $r
$instructorJwt = $r.body.accessToken
Write-Host "10. Login Instructor [$($r.statusCode)]: JWT=$($instructorJwt -ne $null)"

# 11. Register regular user
$userEmail = "user.test$ts@hospital.com"
$r = Api "POST" "$base/auth/register" "{`"fullLegalName`":`"Bob Regular`",`"medicalEmail`":`"$userEmail`",`"professionalRole`":`"Nurse`",`"password`":`"SecurePass123`",`"forgetPassword`":false}"
$allResults["11_register_user"] = $r
Write-Host "11. Register User [$($r.statusCode)]"

Api "POST" "$base/auth/send-otp" "{`"email`":`"$userEmail`"}" | Out-Null
Api "POST" "$base/auth/verify-otp" "{`"email`":`"$userEmail`",`"otp`":`"123456`"}" | Out-Null

$r = Api "POST" "$base/auth/login" "{`"email`":`"$userEmail`",`"password`":`"SecurePass123`"}"
$allResults["12_login_user"] = $r
$userJwt = $r.body.accessToken
Write-Host "12. Login User [$($r.statusCode)]: JWT=$($userJwt -ne $null)"

# 13. Reset Password flow
$resetEmail = "reset.test$ts@hospital.com"
Api "POST" "$base/auth/register" "{`"fullLegalName`":`"Reset Tester`",`"medicalEmail`":`"$resetEmail`",`"professionalRole`":`"Nurse`",`"password`":`"OldPass123`",`"forgetPassword`":false}" | Out-Null
Api "POST" "$base/auth/send-otp" "{`"email`":`"$resetEmail`"}" | Out-Null
Api "POST" "$base/auth/verify-otp" "{`"email`":`"$resetEmail`",`"otp`":`"123456`"}" | Out-Null
$r = Api "PUT" "$base/auth/reset-password" "{`"email`":`"$resetEmail`",`"password`":`"NewSecurePass456`",`"forgetPassword`":true}"
$allResults["13_reset_password"] = $r
Write-Host "13. Reset Password [$($r.statusCode)]: $($r.body.message)"

# =============================================
# PHASE 2: ADMIN ENDPOINTS (using admin JWT) 
# =============================================
Write-Host "`n--- PHASE 2: ADMIN ENDPOINTS ---" -ForegroundColor Yellow

# 14. Create Category 
$r = Api "POST" "$base/admin/categories" "{`"name`":`"Surgical Instruments $ts`"}" $adminJwt
$allResults["14_create_category"] = $r
$categoryId = if ($r.body.id) { $r.body.id } elseif ($r.body.data.id) { $r.body.data.id } else { $null }
Write-Host "14. Create Category [$($r.statusCode)]: ID=$categoryId"

# 15. List Categories
$r = Api "GET" "$base/admin/categories" $null $adminJwt
$allResults["15_list_categories"] = $r
if (-not $categoryId) {
    $cats = if ($r.body -is [array]) { $r.body } else { $r.body.data }
    if ($cats -and $cats.Count -gt 0) { $categoryId = $cats[0].id }
}
Write-Host "15. List Categories [$($r.statusCode)]: Using=$categoryId"

# 16. Create Facility
$r = Api "POST" "$base/admin/facilities" "{`"name`":`"City Medical Hospital $ts`",`"address`":`"123 Main St, Medical City, MC 12345`"}" $adminJwt
$allResults["16_create_facility"] = $r
$facilityId = if ($r.body.id) { $r.body.id } elseif ($r.body.data.id) { $r.body.data.id } else { $null }
Write-Host "16. Create Facility [$($r.statusCode)]: ID=$facilityId"

# 17. List Facilities
$r = Api "GET" "$base/admin/facilities" $null $adminJwt
$allResults["17_list_facilities"] = $r
if (-not $facilityId) {
    $facs = if ($r.body -is [array]) { $r.body } else { $r.body.data }
    if ($facs -and $facs.Count -gt 0) { $facilityId = $facs[0].id }
}
Write-Host "17. List Facilities [$($r.statusCode)]: Using=$facilityId"

# 18. Create Faculty
$npi = $ts.ToString().Substring(0,10)
$facultyBody = @{
    firstName = "Dr. Sarah"
    lastName = "Johnson"
    phoneNumber = "+1-555-0123"
    email = "sarah.faculty$ts@hospital.com"
    imageUrl = "https://example.com/sarah.jpg"
    primaryClinicalRole = "Cardiologist"
    medicalDesignation = "MD, Cardiology"
    institutionOrHospital = "City Medical Hospital"
    npiNumber = $npi
    assignedRole = "faculty"
} | ConvertTo-Json -Depth 5
$r = Api "POST" "$base/admin/faculty" $facultyBody $adminJwt
$allResults["18_create_faculty"] = $r
$facultyId = if ($r.body.id) { $r.body.id } elseif ($r.body.data.id) { $r.body.data.id } else { $null }
Write-Host "18. Create Faculty [$($r.statusCode)]: ID=$facultyId"

# 19. List Faculty
$r = Api "GET" "$base/admin/faculty" $null $adminJwt
$allResults["19_list_faculty"] = $r
if (-not $facultyId) {
    $fac = if ($r.body.data) { $r.body.data } else { $r.body }
    if ($fac -and $fac.Count -gt 0) { $facultyId = $fac[0].id }
}
Write-Host "19. List Faculty [$($r.statusCode)]: Using=$facultyId"

# 20. Create Product
$productBody = @{
    name = "Surgical Scalpel Set"
    clinicalDescription = "Professional stainless steel surgical scalpel set for general surgery"
    brand = "MedPro"
    clinicalBenefits = @(
        @{ icon = "https://icon.com/precision.png"; title = "Precision Cuts"; description = "Ultra-sharp blade for precise surgical incisions" }
        @{ icon = "https://icon.com/durability.png"; title = "Durability"; description = "Stainless steel construction for long-lasting use" }
    )
    technicalSpecifications = @(
        @{ name = "Material"; value = "Stainless Steel" }
        @{ name = "Blade Length"; value = "15mm" }
    )
    categoryId = @()
    actualPrice = "150.00"
    offerPrice = "120.00"
    sku = "SS-SCALPEL-$ts"
    stockQuantity = 100
    lowStockAlert = 10
    isActive = $true
    tags = @("surgery", "precision", "stainless-steel")
} 
if ($categoryId) { $productBody.categoryId = @($categoryId) }
$r = Api "POST" "$base/admin/products" ($productBody | ConvertTo-Json -Depth 5) $adminJwt
$allResults["20_create_product"] = $r
$productId = if ($r.body.id) { $r.body.id } elseif ($r.body.data.id) { $r.body.data.id } else { $null }
Write-Host "20. Create Product [$($r.statusCode)]: ID=$productId"

# 21. List Products
$r = Api "GET" "$base/admin/products" $null $adminJwt
$allResults["21_list_products"] = $r
if (-not $productId) {
    $prods = if ($r.body.data) { $r.body.data } else { $r.body }
    if ($prods -and $prods.Count -gt 0) { $productId = $prods[0].id }
}
Write-Host "21. List Products [$($r.statusCode)]"

# 22. Update Product
if ($productId) {
    $r = Api "PATCH" "$base/admin/products/$productId" '{"name":"Updated Surgical Scalpel Set","offerPrice":"110.00","stockQuantity":95,"isActive":true}' $adminJwt
    $allResults["22_update_product"] = $r
    Write-Host "22. Update Product [$($r.statusCode)]"
}

# 23. Create Blog Category
$r = Api "POST" "$base/admin/blog-categories" "{`"name`":`"Medical Research $ts`",`"description`":`"Latest medical research articles`",`"isActive`":true}" $adminJwt
$allResults["23_create_blog_category"] = $r
$blogCatId = if ($r.body.id) { $r.body.id } elseif ($r.body.data.id) { $r.body.data.id } else { $null }
Write-Host "23. Create Blog Category [$($r.statusCode)]: ID=$blogCatId"

# 24. List Blog Categories
$r = Api "GET" "$base/admin/blog-categories" $null $adminJwt
$allResults["24_list_blog_categories"] = $r
if (-not $blogCatId) {
    $bcs = if ($r.body -is [array]) { $r.body } else { $r.body.data }
    if ($bcs -and $bcs.Count -gt 0) { $blogCatId = $bcs[0].id }
}
Write-Host "24. List Blog Categories [$($r.statusCode)]: Using=$blogCatId"

# 25. Get Blog Category by ID
if ($blogCatId) {
    $r = Api "GET" "$base/admin/blog-categories/$blogCatId" $null $adminJwt
    $allResults["25_get_blog_category_byid"] = $r
    Write-Host "25. Get Blog Category [$($r.statusCode)]"
}

# 26. Update Blog Category
if ($blogCatId) {
    $r = Api "PATCH" "$base/admin/blog-categories/$blogCatId" '{"description":"Updated medical research description"}' $adminJwt
    $allResults["26_update_blog_category"] = $r
    Write-Host "26. Update Blog Category [$($r.statusCode)]"
}

# 27. Create Tag
$r = Api "POST" "$base/admin/tags" "{`"name`":`"cardiology-$ts`"}" $adminJwt
$allResults["27_create_tag"] = $r
$tagId = if ($r.body.id) { $r.body.id } elseif ($r.body.data.id) { $r.body.data.id } else { $null }
Write-Host "27. Create Tag [$($r.statusCode)]: ID=$tagId"

# 28. List Tags
$r = Api "GET" "$base/admin/tags" $null $adminJwt
$allResults["28_list_tags"] = $r
if (-not $tagId) {
    $tags = if ($r.body -is [array]) { $r.body } else { $r.body.data }
    if ($tags -and $tags.Count -gt 0) { $tagId = $tags[0].id }
}
Write-Host "28. List Tags [$($r.statusCode)]: Using=$tagId"

# Get an author ID (must be a real user, not faculty)
$authorId = $null
$r2 = Api "GET" "$base/admin/users" $null $adminJwt
if ($r2.body) {
    $users = if ($r2.body -is [array]) { $r2.body } else { $r2.body.data }
    if ($users) {
        $realUser = $users | Where-Object { $_.type -ne 'faculty' } | Select-Object -First 1
        if ($realUser) { $authorId = $realUser.id }
    }
}
Write-Host "Author ID for blog: $authorId"

# 29. Create Blog Post (Published)
$blogBody = @{
    title = "Advances in Cardiac Surgery 2026"
    content = "<h1>Cardiac Surgery Advances</h1><p>This is comprehensive article on cardiac surgery advances including minimally invasive techniques.</p>"
    coverImageUrl = "https://example.com/images/cardiac-surgery.jpg"
    publishingStatus = "published"
    isFeatured = $true
    excerpt = "A comprehensive look at cardiac surgery advances in 2026"
    readTimeMinutes = 8
    categoryIds = @()
    tagIds = @()
    authorIds = @()
    seoMetaTitle = "Cardiac Surgery Advances 2026"
    seoMetaDescription = "Explore the latest advances in cardiac surgery techniques and procedures"
}
if ($blogCatId) { $blogBody.categoryIds = @($blogCatId) }
if ($tagId) { $blogBody.tagIds = @($tagId) }
if ($authorId) { $blogBody.authorIds = @($authorId) }
$r = Api "POST" "$base/admin/blog" ($blogBody | ConvertTo-Json -Depth 5) $adminJwt
$allResults["29_create_blog_published"] = $r
$blogPostId = if ($r.body.id) { $r.body.id } elseif ($r.body.data.id) { $r.body.data.id } else { $null }
Write-Host "29. Create Blog Published [$($r.statusCode)]: ID=$blogPostId"

# 30. Create Blog Post (Draft)
$draftBody = @{
    title = "Introduction to Telemedicine"
    content = "<p>Telemedicine is transforming healthcare delivery across the globe.</p>"
    publishingStatus = "draft"
    excerpt = "How telemedicine is changing the healthcare landscape"
    readTimeMinutes = 5
} | ConvertTo-Json -Depth 5
$r = Api "POST" "$base/admin/blog" $draftBody $adminJwt
$allResults["30_create_blog_draft"] = $r
$draftBlogId = if ($r.body.id) { $r.body.id } elseif ($r.body.data.id) { $r.body.data.id } else { $null }
Write-Host "30. Create Blog Draft [$($r.statusCode)]: ID=$draftBlogId"

# 31. Create Blog Post (Scheduled)
$schedDate = (Get-Date).AddDays(7).ToString("yyyy-MM-ddTHH:mm:ssZ")
$schedBody = @{
    title = "Upcoming AI in Medicine Symposium"
    content = "<p>Join us for an in-depth look at AI applications in modern medicine.</p>"
    publishingStatus = "scheduled"
    scheduledPublishDate = $schedDate
    excerpt = "AI applications in medicine symposium preview"
    readTimeMinutes = 6
} | ConvertTo-Json -Depth 5
$r = Api "POST" "$base/admin/blog" $schedBody $adminJwt
$allResults["31_create_blog_scheduled"] = $r
Write-Host "31. Create Blog Scheduled [$($r.statusCode)]"

# 32. List Blog Posts (All)
$r = Api "GET" "$base/admin/blog" $null $adminJwt
$allResults["32_list_blog_all"] = $r
Write-Host "32. List Blog Posts All [$($r.statusCode)]"

# 33. List Blog Posts (filter by draft)
$r = Api "GET" "$base/admin/blog?status=draft" $null $adminJwt
$allResults["33_list_blog_drafts"] = $r
Write-Host "33. List Blog Drafts [$($r.statusCode)]"

# 34. Search Blogs
$r = Api "GET" "$base/admin/blog?search=cardiac" $null $adminJwt
$allResults["34_search_blogs"] = $r
Write-Host "34. Search Blogs [$($r.statusCode)]"

# 35. Filter by blog category
if ($blogCatId) {
    $r = Api "GET" "$base/admin/blog?categoryId=$blogCatId" $null $adminJwt
    $allResults["35_filter_blog_by_category"] = $r
    Write-Host "35. Filter Blog by Category [$($r.statusCode)]"
}

# 36. Get Blog by ID
if ($blogPostId) {
    $r = Api "GET" "$base/admin/blog/$blogPostId" $null $adminJwt
    $allResults["36_get_blog_byid"] = $r
    Write-Host "36. Get Blog by ID [$($r.statusCode)]"
}

# 37. Update Blog (Patch SEO/excerpt)
if ($draftBlogId) {
    $r = Api "PATCH" "$base/admin/blog/$draftBlogId" '{"excerpt":"Updated excerpt for telemedicine article","seoMetaTitle":"Telemedicine Guide 2026","seoMetaDescription":"Complete guide to telemedicine practices"}' $adminJwt
    $allResults["37_update_blog_seo"] = $r
    Write-Host "37. Update Blog SEO [$($r.statusCode)]"
}

# 38. Publish Draft Blog (transition to published)
if ($draftBlogId) {
    $r = Api "PATCH" "$base/admin/blog/$draftBlogId" '{"publishingStatus":"published"}' $adminJwt
    $allResults["38_publish_blog"] = $r
    Write-Host "38. Publish Blog [$($r.statusCode)]"
}

# 39. Update Blog relations 
if ($blogPostId -and $authorId) {
    $updateRelBody = @{ authorIds = @($authorId) } | ConvertTo-Json -Depth 5
    $r = Api "PATCH" "$base/admin/blog/$blogPostId" $updateRelBody $adminJwt
    $allResults["39_update_blog_relations"] = $r
    Write-Host "39. Update Blog Relations [$($r.statusCode)]"
}

# 40. Create Workshop (In Person)
$workshopBody = @{
    deliveryMode = "in_person"
    title = "Advanced Surgical Techniques Workshop"
    shortBlurb = "A comprehensive 2-day hands-on workshop covering advanced surgical techniques for senior practitioners."
    coverImageUrl = "https://example.com/images/surgical-workshop.jpg"
    learningObjectives = "Learn advanced suturing techniques, minimally invasive procedures, and post-operative care protocols."
    offersCmeCredits = $true
    facilityIds = @()
    capacity = 30
    alertAt = 25
    standardBaseRate = "1500.00"
    groupDiscountEnabled = $true
    groupDiscounts = @(
        @{ minimumAttendees = 3; groupRatePerPerson = "1350.00" }
        @{ minimumAttendees = 5; groupRatePerPerson = "1200.00" }
    )
    facultyIds = @()
    days = @(
        @{
            date = "2026-04-15"
            dayNumber = 1
            segments = @(
                @{ segmentNumber = 1; courseTopic = "Introduction and Advanced Suturing"; topicDetails = "Overview of advanced suturing methods with live demonstrations"; startTime = "09:00 AM"; endTime = "12:00 PM" }
                @{ segmentNumber = 2; courseTopic = "Minimally Invasive Procedures"; topicDetails = "Hands-on practice with laparoscopic equipment"; startTime = "01:00 PM"; endTime = "05:00 PM" }
            )
        }
        @{
            date = "2026-04-16"
            dayNumber = 2
            segments = @(
                @{ segmentNumber = 1; courseTopic = "Post-Operative Care Protocols"; topicDetails = "Best practices for patient monitoring and recovery"; startTime = "09:00 AM"; endTime = "12:00 PM" }
            )
        }
    )
}
if ($facilityId) { $workshopBody.facilityIds = @($facilityId) }
if ($facultyId) { $workshopBody.facultyIds = @($facultyId) }
$r = Api "POST" "$base/admin/workshops" ($workshopBody | ConvertTo-Json -Depth 10) $adminJwt
$allResults["40_create_workshop_inperson"] = $r
$workshopId = if ($r.body.id) { $r.body.id } elseif ($r.body.data.id) { $r.body.data.id } else { $null }
Write-Host "40. Create Workshop In-Person [$($r.statusCode)]: ID=$workshopId"

# 41. Create Workshop (Online)
$onlineBody = @{
    deliveryMode = "online"
    title = "Telemedicine and Remote Patient Care"
    shortBlurb = "Master the essentials of telemedicine, virtual consultations, and remote patient monitoring."
    coverImageUrl = "https://example.com/images/telemedicine-workshop.jpg"
    learningObjectives = "Understand best practices for virtual consultations, digital health tools, and remote monitoring systems."
    offersCmeCredits = $false
    facilityIds = @("online")
    webinarPlatform = "Zoom"
    meetingLink = "https://zoom.us/j/1234567890"
    meetingPassword = "Med2026!"
    autoRecordSession = $true
    capacity = 100
    alertAt = 90
    standardBaseRate = "800.00"
    groupDiscountEnabled = $false
    days = @(
        @{
            date = "2026-05-10"
            dayNumber = 1
            segments = @(
                @{ segmentNumber = 1; courseTopic = "Intro to Telemedicine Platforms"; topicDetails = "Overview of popular telemedicine software and setup"; startTime = "10:00 AM"; endTime = "12:00 PM" }
                @{ segmentNumber = 2; courseTopic = "Virtual Consultation Best Practices"; topicDetails = "Effective communication and examination techniques online"; startTime = "02:00 PM"; endTime = "04:00 PM" }
                @{ segmentNumber = 3; courseTopic = "Remote Patient Monitoring Systems"; topicDetails = "Using wearables and monitoring devices for patient care"; startTime = "05:00 PM"; endTime = "07:00 PM" }
            )
        }
    )
}
$r = Api "POST" "$base/admin/workshops" ($onlineBody | ConvertTo-Json -Depth 10) $adminJwt
$allResults["41_create_workshop_online"] = $r
$onlineWsId = if ($r.body.id) { $r.body.id } elseif ($r.body.data.id) { $r.body.data.id } else { $null }
Write-Host "41. Create Workshop Online [$($r.statusCode)]: ID=$onlineWsId"

# 42. List Workshops
$r = Api "GET" "$base/admin/workshops" $null $adminJwt
$allResults["42_list_workshops"] = $r
Write-Host "42. List Workshops [$($r.statusCode)]"

# 43. Publish Workshop (PUT update)
if ($workshopId) {
    $r = Api "PUT" "$base/admin/workshops/$workshopId" '{"status":"published"}' $adminJwt
    $allResults["43_publish_workshop"] = $r
    Write-Host "43. Publish Workshop [$($r.statusCode)]"
}

# 44. List Users
$r = Api "GET" "$base/admin/users" $null $adminJwt
$allResults["44_list_users"] = $r
Write-Host "44. List Users [$($r.statusCode)]"

# 45. Master User Directory (no filter)
$r = Api "GET" "$base/admin/users/directory/master" $null $adminJwt
$allResults["45_master_directory"] = $r
Write-Host "45. Master Directory [$($r.statusCode)]"

# 46. Master Directory - filter by role=student
$r = Api "GET" "$base/admin/users/directory/master?role=student" $null $adminJwt
$allResults["46_directory_role_student"] = $r
Write-Host "46. Directory role=student [$($r.statusCode)]"

# 47. Master Directory - filter by role=admin
$r = Api "GET" "$base/admin/users/directory/master?role=admin" $null $adminJwt
$allResults["47_directory_role_admin"] = $r
Write-Host "47. Directory role=admin [$($r.statusCode)]"

# 48. Master Directory - filter by role=instructor
$r = Api "GET" "$base/admin/users/directory/master?role=instructor" $null $adminJwt
$allResults["48_directory_role_instructor"] = $r
Write-Host "48. Directory role=instructor [$($r.statusCode)]"

# 49. Master Directory - search
$r = Api "GET" "$base/admin/users/directory/master?search=test" $null $adminJwt
$allResults["49_directory_search"] = $r
Write-Host "49. Directory search [$($r.statusCode)]"

# 50. Update Admin Email
$r = Api "PATCH" "$base/admin/users/adminProfile/settings/email" "{`"newEmail`":`"admin.updated$ts@hospital.com`"}" $adminJwt
$allResults["50_update_admin_email"] = $r
Write-Host "50. Update Admin Email [$($r.statusCode)]"

# 51. Change Admin Password
$r = Api "PATCH" "$base/admin/users/adminProfile/settings/password" '{"currentPassword":"SecurePass123","newPassword":"NewSecurePass789"}' $adminJwt
$allResults["51_change_admin_password"] = $r
Write-Host "51. Change Admin Password [$($r.statusCode)]"

# =============================================
# PHASE 3: PUBLIC ENDPOINTS (No Auth)
# =============================================
Write-Host "`n--- PHASE 3: PUBLIC ENDPOINTS ---" -ForegroundColor Yellow

# 52. Public Products - Categories with counts
$r = Api "GET" "$base/public/products/categories"
$allResults["52_public_product_categories"] = $r
Write-Host "52. Public Product Categories [$($r.statusCode)]"

# 53. Public Products - List all
$r = Api "GET" "$base/public/products"
$allResults["53_public_products_list"] = $r
Write-Host "53. Public Products List [$($r.statusCode)]"

# 54. Public Products - Detail
if ($productId) {
    $r = Api "GET" "$base/public/products/$productId"
    $allResults["54_public_product_detail"] = $r
    Write-Host "54. Public Product Detail [$($r.statusCode)]"
}

# 55. Public Products - Cart Calculate
if ($productId) {
    $cartBody = @{ items = @( @{ productId = $productId; quantity = 2 } ) } | ConvertTo-Json -Depth 5
    $r = Api "POST" "$base/public/products/cart/calculate" $cartBody
    $allResults["55_public_cart_calculate"] = $r
    Write-Host "55. Cart Calculate [$($r.statusCode)]"
}

# 56. Public Blogs - List
$r = Api "GET" "$base/public/blogs"
$allResults["56_public_blogs_list"] = $r
Write-Host "56. Public Blogs List [$($r.statusCode)]"

# 57. Public Blogs - Single
if ($blogPostId) {
    $r = Api "GET" "$base/public/blogs/$blogPostId"
    $allResults["57_public_blog_detail"] = $r
    Write-Host "57. Public Blog Detail [$($r.statusCode)]"
}

# 58. Public Workshops - List
$r = Api "GET" "$base/workshops"
$allResults["58_public_workshops_list"] = $r
Write-Host "58. Public Workshops List [$($r.statusCode)]"

# 59. Public Workshops - Single detail
if ($workshopId) {
    $r = Api "GET" "$base/workshops/$workshopId"
    $allResults["59_public_workshop_detail"] = $r
    Write-Host "59. Public Workshop Detail [$($r.statusCode)]"
}

# =============================================
# PHASE 4: USER PRIVATE ENDPOINTS 
# =============================================
Write-Host "`n--- PHASE 4: USER PRIVATE ENDPOINTS ---" -ForegroundColor Yellow

# Need a published workshop for ordering
if ($workshopId -and $userJwt) {
    # 60. Create Order Summary
    $orderBody = @{
        workshopId = $workshopId
        attendees = @(
            @{ fullName = "Bob Regular"; professionalRole = "Registered Nurse"; email = "bob.test@example.com"; npiNumber = "1234567890" }
            @{ fullName = "Alice Student"; professionalRole = "Medical Student"; email = "alice.test@example.com"; npiNumber = "0987654321" }
        )
    } | ConvertTo-Json -Depth 5
    $r = Api "POST" "$base/workshops/checkout/order-summary" $orderBody $userJwt
    $allResults["60_create_order_summary"] = $r
    $orderSummaryId = if ($r.body.data.orderSummaryId) { $r.body.data.orderSummaryId } elseif ($r.body.orderSummaryId) { $r.body.orderSummaryId } elseif ($r.body.id) { $r.body.id } else { $null }
    Write-Host "60. Create Order Summary [$($r.statusCode)]: ID=$orderSummaryId"

    # 61. Get Order Summary
    if ($orderSummaryId) {
        $r = Api "GET" "$base/workshops/checkout/order-summary/$orderSummaryId" $null $userJwt
        $allResults["61_get_order_summary"] = $r
        Write-Host "61. Get Order Summary [$($r.statusCode)]"
    }
} else {
    Write-Host "SKIP: Workshop ordering (no published workshop or user JWT)" -ForegroundColor Yellow
}

# =============================================
# PHASE 5: ROLE-BASED ACCESS CONTROL TESTS
# =============================================
Write-Host "`n--- PHASE 5: RBAC TESTS ---" -ForegroundColor Yellow

# 62. Student trying admin endpoint (should fail 403)
$r = Api "GET" "$base/admin/users" $null $studentJwt
$allResults["62_rbac_student_admin"] = $r
Write-Host "62. Student->Admin endpoint [$($r.statusCode)] (expect 403)"

# 63. Instructor trying admin endpoint (should fail 403)
$r = Api "GET" "$base/admin/users" $null $instructorJwt
$allResults["63_rbac_instructor_admin"] = $r
Write-Host "63. Instructor->Admin endpoint [$($r.statusCode)] (expect 403)"

# 64. User trying admin endpoint (should fail 403)
$r = Api "GET" "$base/admin/users" $null $userJwt
$allResults["64_rbac_user_admin"] = $r
Write-Host "64. User->Admin endpoint [$($r.statusCode)] (expect 403)"

# 65. No auth on admin endpoint (should fail 401)
$r = Api "GET" "$base/admin/users"
$allResults["65_rbac_no_auth_admin"] = $r
Write-Host "65. No auth->Admin endpoint [$($r.statusCode)] (expect 401)"

# 66. No auth on private user endpoint (should fail 401)
$r = Api "POST" "$base/workshops/checkout/order-summary" '{"workshopId":"fake","numberOfSeats":1}'
$allResults["66_rbac_no_auth_private"] = $r
Write-Host "66. No auth->Private endpoint [$($r.statusCode)] (expect 401)"

# =============================================
# PHASE 6: UPLOAD S3 Endpoints
# =============================================
Write-Host "`n--- PHASE 6: UPLOAD S3 ---" -ForegroundColor Yellow

# 67. Health check
$r = Api "GET" "$base/upload/health" $null $adminJwt
$allResults["67_upload_health"] = $r
Write-Host "67. Upload Health [$($r.statusCode)]"

# 68. Get Upload URL (may fail if S3 not configured)
$r = Api "POST" "$base/upload/get-upload-url" '{"fileName":"test-image.jpg","contentType":"image/jpeg","folder":"test"}' $adminJwt
$allResults["68_get_upload_url"] = $r
Write-Host "68. Get Upload URL [$($r.statusCode)]"

# =============================================
# PHASE 7: DELETE TESTS (cleanup)
# =============================================
Write-Host "`n--- PHASE 7: DELETE TESTS ---" -ForegroundColor Yellow

# 69. Create temp blog + delete
$tempBlogBody = '{"title":"Temporary Blog for Delete Test","content":"<p>Temp</p>","publishingStatus":"draft"}'
$r = Api "POST" "$base/admin/blog" $tempBlogBody $adminJwt
$tempBlogId = if ($r.body.id) { $r.body.id } elseif ($r.body.data.id) { $r.body.data.id } else { $null }
if ($tempBlogId) {
    $r = Api "DELETE" "$base/admin/blog/$tempBlogId" $null $adminJwt
    $allResults["69_delete_blog"] = $r
    Write-Host "69. Delete Blog [$($r.statusCode)]"
} else {
    Write-Host "69. SKIP Delete Blog (no temp blog created)"
}

# 70. Create temp blog category + delete
$r = Api "POST" "$base/admin/blog-categories" "{`"name`":`"Temp Category Delete $ts`"}" $adminJwt
$tempCatId = if ($r.body.id) { $r.body.id } elseif ($r.body.data.id) { $r.body.data.id } else { $null }
if ($tempCatId) {
    $r = Api "DELETE" "$base/admin/blog-categories/$tempCatId" $null $adminJwt
    $allResults["70_delete_blog_category"] = $r
    Write-Host "70. Delete Blog Category [$($r.statusCode)]"
} else {
    Write-Host "70. SKIP Delete Blog Category"
}

# =============================================
# FINAL SUMMARY
# =============================================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "          TEST RESULTS SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$passed = 0; $failed = 0; $rbacCorrect = 0
foreach ($key in ($allResults.Keys | Sort-Object)) {
    $r = $allResults[$key]
    $status = $r.statusCode
    
    # RBAC tests: 401/403 is expected success
    $isRbac = $key -match "rbac"
    $ok = $false
    if ($isRbac) {
        $ok = ($status -eq 401 -or $status -eq 403)
        if ($ok) { $rbacCorrect++ }
    } else {
        $ok = ($status -ge 200 -and $status -lt 300)
    }
    
    if ($ok) { $passed++ } else { $failed++ }
    $icon = if ($ok) { "PASS" } else { "FAIL" }
    $color = if ($ok) { "Green" } else { "Red" }
    Write-Host "  $icon [$status] $key" -ForegroundColor $color
}

Write-Host "`n  Total: $($passed + $failed) | Passed: $passed | Failed: $failed | RBAC Correct: $rbacCorrect" -ForegroundColor $(if($failed -eq 0){"Green"}else{"Yellow"})

# =============================================
# SAVE RESULTS TO JSON
# =============================================
$outputData = [ordered]@{}
foreach ($key in ($allResults.Keys | Sort-Object)) {
    $r = $allResults[$key]
    $outputData[$key] = [ordered]@{
        statusCode = $r.statusCode
        success = $r.success
        response = $r.body
    }
}
$outputData | ConvertTo-Json -Depth 15 | Out-File -FilePath "e:\ShafaCode\medical_backend\test_results.json" -Encoding UTF8

# Save IDs
[ordered]@{
    timestamp = $ts
    adminEmail = $adminEmail
    studentEmail = $studentEmail
    instructorEmail = $instructorEmail
    userEmail = $userEmail
    adminJwt = $adminJwt
    studentJwt = $studentJwt
    instructorJwt = $instructorJwt
    userJwt = $userJwt
    categoryId = $categoryId
    facilityId = $facilityId
    facultyId = $facultyId
    productId = $productId
    blogCategoryId = $blogCatId
    tagId = $tagId
    blogPostId = $blogPostId
    draftBlogId = $draftBlogId
    workshopId = $workshopId
    onlineWorkshopId = $onlineWsId
    orderSummaryId = $orderSummaryId
} | ConvertTo-Json -Depth 5 | Out-File -FilePath "e:\ShafaCode\medical_backend\test_ids.json" -Encoding UTF8

Write-Host "`nResults saved to test_results.json and test_ids.json" -ForegroundColor Green
