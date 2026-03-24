// update_postman.js - Maps test results to Postman collection and adds response bodies
const fs = require('fs');
const path = require('path');

const collectionPath = path.join(__dirname, 'Medical-Backend-API.postman_collection.json');
const resultsPath = path.join(__dirname, 'test_results.json');
const idsPath = path.join(__dirname, 'test_ids.json');

const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
const resultsRaw = fs.readFileSync(resultsPath, 'utf8').replace(/^\uFEFF/, '');
const results = JSON.parse(resultsRaw);
const idsRaw = fs.readFileSync(idsPath, 'utf8').replace(/^\uFEFF/, '');
const ids = JSON.parse(idsRaw);

// Map: Postman endpoint name -> test result key(s)
const mapping = {
  // Auth
  'Register': ['01_register_admin'],
  'Login': ['04_login_admin'],
  'Send OTP': ['02_send_otp_admin'],
  'Verify OTP': ['03_verify_otp_admin'],
  'Reset Password': ['13_reset_password'],
  // File Upload
  'Get Upload Url': ['68_get_upload_url'],
  // Admin Blog Posts
  'Create Post – Scheduled (full payload)': ['29_create_blog_published', '30_create_blog_draft', '31_create_blog_scheduled'],
  'List Posts – All (paginated)': ['32_list_blog_all'],
  'List Posts – Filter by status=draft': ['33_list_blog_drafts'],
  'List Posts – Search': ['34_search_blogs'],
  'List Posts – Filter by categoryId': ['35_filter_blog_by_category'],
  'Get Post by ID': ['36_get_blog_byid'],
  'Update Post – Patch SEO and excerpt': ['37_update_blog_seo'],
  'Update Post – Transition to Published': ['38_publish_blog'],
  'Update Post – Replace relations (authors/tags/categories)': ['39_update_blog_relations'],
  'Delete Post': ['69_delete_blog'],
  // Blog Categories
  'Create Blog Category': ['23_create_blog_category'],
  'List Blog Categories': ['24_list_blog_categories'],
  'Get Blog Category by ID': ['25_get_blog_category_byid'],
  'Update Blog Category': ['26_update_blog_category'],
  'Delete Blog Category': ['70_delete_blog_category'],
  // Tags
  'Create Tag': ['27_create_tag'],
  'List Tags': ['28_list_tags'],
  // Workshops
  'Create Workshop [ In Person ]': ['40_create_workshop_inperson'],
  'Create Workshop [ Online ]': ['41_create_workshop_online'],
  'List Workshops': ['42_list_workshops'],
  'Statues Update': ['43_publish_workshop'],
  // Facilities
  'Create Facility': ['16_create_facility'],
  'List Facilities': ['17_list_facilities'],
  // Faculty
  'Create Faculty': ['18_create_faculty'],
  'List Faculty': ['19_list_faculty'],
  // Products Admin
  'Create Product': ['20_create_product'],
  'List Products': ['21_list_products'],
  'Update Product': ['22_update_product'],
  // Categories Admin
  'Create Category': ['14_create_category'],
  'List Categories': ['15_list_categories'],
  // Users Admin
  'List All Users': ['44_list_users'],
  'Update Admin Email': ['50_update_admin_email'],
  'Change Admin Password': ['51_change_admin_password'],
  'Master User Directory': ['45_master_directory'],
  // Public Products
  'Get Categories with Product Count': ['52_public_product_categories'],
  'List Products with Filters': ['53_public_products_list'],
  'Get Product Details': ['54_public_product_detail'],
  'Calculate Cart': ['55_public_cart_calculate'],
  // Public Blogs
  'List Latest Blogs': ['56_public_blogs_list'],
  'Get Blog Post Details': ['57_public_blog_detail'],
  // Public Workshops
  'Get Workshops Lists': ['58_public_workshops_list'],
  'Get Single Work shops': ['59_public_workshop_detail'],
  // Private - Order Workshop
  'Order Summary': ['60_create_order_summary'],
  'Get Order Summary': ['61_get_order_summary'],
  'Order Reservation': [],
};

function createResponseExample(testKey, result, requestItem) {
  const statusCode = result.statusCode;
  const responseBody = result.response ? JSON.stringify(result.response, null, 2) : '';
  
  // Determine response name
  let responseName = `${statusCode} - Success`;
  if (statusCode >= 400) {
    responseName = `${statusCode} - Error`;
  }
  
  const headers = [
    { key: 'Content-Type', value: 'application/json' },
    { key: 'X-Test-Key', value: testKey }
  ];

  return {
    name: responseName,
    originalRequest: requestItem ? JSON.parse(JSON.stringify(requestItem)) : undefined,
    status: statusCode >= 200 && statusCode < 300 ? 'OK' : 'Error',
    code: statusCode,
    _postman_previewlanguage: 'json',
    header: headers,
    body: responseBody
  };
}

function processItems(items) {
  let updated = 0;
  for (const item of items) {
    if (item.item) {
      updated += processItems(item.item);
      continue;
    }
    
    if (!item.request) continue;
    
    // Normalize name for matching (remove special chars issues with encoding)
    const itemName = item.name.replace(/[^\x20-\x7E]/g, '').trim();
    
    // Find matching result keys
    let matchedKeys = null;
    for (const [pmName, keys] of Object.entries(mapping)) {
      // Normalize comparison name too
      const normalizedPmName = pmName.replace(/[^\x20-\x7E]/g, '').trim();
      if (itemName === normalizedPmName || itemName.includes(normalizedPmName) || normalizedPmName.includes(itemName)) {
        matchedKeys = keys;
        break;
      }
    }
    
    if (!matchedKeys || matchedKeys.length === 0) {
      continue;
    }
    
    // Clear existing responses and add new ones
    if (!item.response) item.response = [];
    
    for (const testKey of matchedKeys) {
      const result = results[testKey];
      if (!result) continue;
      
      // Check if we already have a response with this status code
      const existingIdx = item.response.findIndex(r => r.code === result.statusCode && r.name && r.name.includes(testKey));
      
      const newResp = createResponseExample(testKey, result, item.request);
      newResp.name = `${result.statusCode} - ${testKey}`;
      
      if (existingIdx >= 0) {
        item.response[existingIdx] = newResp;
      } else {
        item.response.push(newResp);
      }
      updated++;
    }
  }
  return updated;
}

const updatedCount = processItems(collection.item);
console.log(`Updated ${updatedCount} response entries in Postman collection`);

// Also update collection variables with test values
if (collection.variable) {
  for (const v of collection.variable) {
    if (v.key === 'admin_jwt' && ids.adminJwt) v.value = ids.adminJwt;
    if (v.key === 'user_jwt' && ids.userJwt) v.value = ids.userJwt;
    if (v.key === 'category_id' && ids.categoryId) v.value = ids.categoryId;
    if (v.key === 'tag_id' && ids.tagId) v.value = ids.tagId;
    if (v.key === 'author_id') v.value = '';
    if (v.key === 'blogPostId' && ids.blogPostId) v.value = ids.blogPostId;
  }
  console.log('Updated collection variables');
}

// Write updated collection
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2), 'utf8');
console.log('Postman collection saved successfully');
