const Stripe = require('stripe');
const { Client } = require('pg');

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_local';
const stripeKeyForHeader = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const stripe = new Stripe(stripeKeyForHeader);

function ts() {
  return Date.now();
}

function safeJsonParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function pick(obj, paths, fallback = undefined) {
  for (const path of paths) {
    const parts = path.split('.');
    let cur = obj;
    let ok = true;
    for (const part of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, part)) {
        cur = cur[part];
      } else {
        ok = false;
        break;
      }
    }
    if (ok && cur !== undefined && cur !== null) return cur;
  }
  return fallback;
}

async function api(method, path, { token, body, headers: extraHeaders } = {}) {
  const headers = {
    ...(extraHeaders || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let payload = undefined;
  if (body !== undefined) {
    if (typeof body === 'string') {
      payload = body;
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
    } else {
      payload = JSON.stringify(body);
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
    }
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: payload,
  });

  const text = await res.text();
  const data = safeJsonParse(text);

  return {
    ok: res.ok,
    status: res.status,
    data,
    text,
  };
}

function expectOk(step, response) {
  if (!response.ok) {
    const message = pick(response.data || {}, ['message']) || response.text;
    throw new Error(`${step} failed [${response.status}]: ${message}`);
  }
}

function expectStatus(step, response, expectedStatus) {
  if (response.status !== expectedStatus) {
    const message = pick(response.data || {}, ['message']) || response.text;
    throw new Error(
      `${step} expected status ${expectedStatus} but got ${response.status}: ${message}`,
    );
  }
}

async function registerVerifyAndLogin({ name, roleTitle, email, password }) {
  let r = await api('POST', '/auth/register', {
    body: {
      fullLegalName: name,
      medicalEmail: email,
      professionalRole: roleTitle,
      password,
      forgetPassword: false,
    },
  });
  expectOk('register', r);

  r = await api('POST', '/auth/send-otp', {
    body: { email },
  });
  expectOk('send otp', r);

  r = await api('POST', '/auth/verify-otp', {
    body: { email, otp: '123456' },
  });
  expectOk('verify otp', r);

  r = await api('POST', '/auth/login', {
    body: { email, password },
  });
  expectOk('login', r);

  const accessToken = pick(r.data || {}, ['accessToken']);
  if (!accessToken) {
    throw new Error('login response missing accessToken');
  }

  return accessToken;
}

async function setUserRole(email, role) {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'medical',
  });

  await client.connect();
  try {
    const result = await client.query(
      'UPDATE users SET role = $1 WHERE "medicalEmail" = $2',
      [role, email],
    );

    if (!result.rowCount) {
      throw new Error(`No user found to update role for ${email}`);
    }
  } finally {
    await client.end();
  }
}

function emitProgress(step, response, details) {
  const msg = pick(response?.data || {}, ['message']) || '';
  const suffix = details ? ` | ${details}` : '';
  console.log(`[OK] ${step} -> ${response.status}${msg ? ` | ${msg}` : ''}${suffix}`);
}

async function sendSignedWebhookEvent(event) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
  });

  const response = await api('POST', '/payments/webhooks/stripe', {
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signature,
    },
    body: payload,
  });

  expectOk('stripe webhook', response);
  return response;
}

async function main() {
  const stamp = ts();
  const password = 'SecurePass123';

  const adminEmail = `admin.flow.${stamp}@example.com`;
  const buyerEmail = `buyer.flow.${stamp}@example.com`;

  const summary = {
    product: {},
    workshop: {},
  };

  console.log('--- AUTH + SETUP ---');

  await registerVerifyAndLogin({
    name: 'Flow Admin',
    roleTitle: 'Administrator',
    email: adminEmail,
    password,
  });

  await setUserRole(adminEmail, 'admin');

  const adminToken = await registerVerifyAndLogin({
    name: 'Flow Admin',
    roleTitle: 'Administrator',
    email: adminEmail,
    password,
  }).catch(async () => {
    const login = await api('POST', '/auth/login', {
      body: { email: adminEmail, password },
    });
    expectOk('admin relogin', login);
    return pick(login.data || {}, ['accessToken']);
  });

  const buyerToken = await registerVerifyAndLogin({
    name: 'Flow Buyer',
    roleTitle: 'Nurse',
    email: buyerEmail,
    password,
  });

  console.log('--- ADMIN DATA CREATION ---');

  let r = await api('POST', '/admin/product-categories', {
    token: adminToken,
    body: {
      name: `Flow Category ${stamp}`,
    },
  });
  expectOk('create product category', r);
  const categoryId = pick(r.data || {}, ['id', 'data.id']);
  if (!categoryId) throw new Error('category id missing');
  emitProgress('create product category', r, `categoryId=${categoryId}`);

  const productSku = `FLOW-SKU-${stamp}`;
  r = await api('POST', '/admin/products', {
    token: adminToken,
    body: {
      name: `Flow Product ${stamp}`,
      clinicalDescription: 'Flow test product description',
      brand: 'FlowBrand',
      clinicalBenefits: [
        {
          icon: 'check-circle',
          title: 'Reliable',
          description: 'Used for integration testing',
        },
      ],
      technicalSpecifications: [
        {
          name: 'Material',
          value: 'Composite',
        },
      ],
      images: ['https://example.com/flow-product.jpg'],
      categoryId: [categoryId],
      actualPrice: '120.00',
      offerPrice: '99.00',
      bulkPriceTiers: [
        {
          minQty: 5,
          price: '89.00',
        },
      ],
      sku: productSku,
      stockQuantity: 25,
      lowStockAlert: 5,
      isActive: true,
      tags: ['flow-test'],
    },
  });
  expectOk('create product', r);
  const productId = pick(r.data || {}, ['id', 'data.id']);
  if (!productId) throw new Error('product id missing');
  emitProgress('create product', r, `productId=${productId}`);

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  r = await api('POST', '/admin/workshops', {
    token: adminToken,
    body: {
      deliveryMode: 'online',
      status: 'published',
      title: `Flow Workshop ${stamp}`,
      shortBlurb: 'Workshop for flow test',
      offersCmeCredits: true,
      facilityIds: [],
      webinarPlatform: 'Zoom',
      meetingLink: 'https://zoom.us/j/123456789',
      autoRecordSession: false,
      capacity: 50,
      alertAt: 5,
      standardBaseRate: '150.00',
      groupDiscountEnabled: false,
      groupDiscounts: [],
      days: [
        {
          date: tomorrow,
          dayNumber: 1,
          segments: [
            {
              segmentNumber: 1,
              courseTopic: 'Flow Topic',
              topicDetails: 'Testing workshop end-to-end flow',
              startTime: '08:00 AM',
              endTime: '10:00 AM',
            },
          ],
        },
      ],
    },
  });
  expectOk('create workshop', r);
  const workshopId = pick(r.data || {}, ['id', 'data.id']);
  if (!workshopId) throw new Error('workshop id missing');
  emitProgress('create workshop', r, `workshopId=${workshopId}`);

  console.log('--- PRODUCT FULL BUY FLOW ---');

  r = await api('POST', '/public/orders/summary', {
    body: {
      items: [
        {
          productId,
          quantity: 2,
        },
      ],
      currency: 'usd',
    },
  });
  expectOk('product order summary', r);
  emitProgress('product order summary', r);

  r = await api('GET', '/public/orders/shipping-address', {
    token: buyerToken,
  });
  expectOk('get shipping address', r);
  emitProgress('get shipping address', r);

  r = await api('PATCH', '/public/orders/shipping-address', {
    token: buyerToken,
    body: {
      fullName: 'Flow Buyer',
      addressLine1: '100 Main Street',
      addressLine2: 'Suite 10',
      city: 'Houston',
      state: 'TX',
      zipCode: '77001',
      country: 'US',
    },
  });
  expectOk('update shipping address', r);
  emitProgress('update shipping address', r);

  r = await api('POST', '/payments/checkout-session', {
    token: buyerToken,
    body: {
      domainType: 'product',
      items: [
        {
          productId,
          quantity: 2,
        },
      ],
      successUrl:
        'http://localhost:5173/checkout/success?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'http://localhost:5173/checkout/cancel',
    },
  });
  expectOk('create product checkout session', r);
  const productPaymentId = pick(r.data || {}, ['data.paymentId']);
  const productSessionId = pick(r.data || {}, ['data.sessionId']);
  if (!productPaymentId || !productSessionId) {
    throw new Error('product checkout session response missing payment/session id');
  }
  emitProgress(
    'create product checkout session',
    r,
    `paymentId=${productPaymentId} sessionId=${productSessionId}`,
  );

  r = await api('GET', `/payments/session-status/${productSessionId}`, {
    token: buyerToken,
  });
  expectOk('product session status pending', r);
  const productStatusBefore = pick(r.data || {}, ['data.status']);
  emitProgress('product session status before webhook', r, `status=${productStatusBefore}`);

  const productWebhookEvent = {
    id: `evt_product_${stamp}`,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: productSessionId,
        object: 'checkout.session',
        payment_intent: `pi_product_${stamp}`,
        metadata: {
          paymentId: productPaymentId,
        },
      },
    },
  };

  r = await sendSignedWebhookEvent(productWebhookEvent);
  emitProgress('product webhook completed event', r);

  r = await api('GET', `/payments/session-status/${productSessionId}`, {
    token: buyerToken,
  });
  expectOk('product session status paid', r);
  const productStatusAfter = pick(r.data || {}, ['data.status']);
  const productOrderId = pick(r.data || {}, ['data.finalizedRefId']);
  if (productStatusAfter !== 'paid' || !productOrderId) {
    throw new Error(
      `product session expected paid + finalizedRefId, got status=${productStatusAfter} finalizedRefId=${productOrderId}`,
    );
  }
  emitProgress(
    'product session status after webhook',
    r,
    `status=${productStatusAfter} orderId=${productOrderId}`,
  );

  r = await api('GET', `/admin/orders/${productOrderId}`, {
    token: adminToken,
  });
  expectOk('get finalized product order', r);
  emitProgress('get finalized product order', r);

  summary.product = {
    productId,
    paymentId: productPaymentId,
    sessionId: productSessionId,
    statusBeforeWebhook: productStatusBefore,
    statusAfterWebhook: productStatusAfter,
    orderId: productOrderId,
  };

  console.log('--- WORKSHOP FULL BUY FLOW ---');

  r = await api('POST', '/workshops/checkout/order-summary', {
    token: buyerToken,
    body: {
      workshopId,
      attendees: [
        {
          fullName: 'Flow Attendee One',
          professionalRole: 'Nurse',
          npiNumber: `${String(stamp).slice(-10)}`,
          email: `attendee1.${stamp}@example.com`,
        },
        {
          fullName: 'Flow Attendee Two',
          professionalRole: 'Resident',
          email: `attendee2.${stamp}@example.com`,
        },
      ],
    },
  });
  expectOk('workshop order summary', r);
  const workshopOrderSummaryId = pick(r.data || {}, ['data.orderSummaryId']);
  const attendeeIds = (pick(r.data || {}, ['data.attendees'], []) || []).map(
    (a) => a.id,
  );
  if (!workshopOrderSummaryId || attendeeIds.length < 1) {
    throw new Error('workshop order summary missing id or attendees');
  }
  emitProgress(
    'workshop order summary',
    r,
    `orderSummaryId=${workshopOrderSummaryId} attendees=${attendeeIds.length}`,
  );

  r = await api('GET', `/workshops/checkout/order-summary/${workshopOrderSummaryId}`, {
    token: buyerToken,
  });
  expectOk('get workshop order summary', r);
  emitProgress('get workshop order summary', r);

  r = await api('POST', '/payments/checkout-session', {
    token: buyerToken,
    body: {
      domainType: 'workshop',
      orderSummaryId: workshopOrderSummaryId,
      successUrl:
        'http://localhost:5173/workshops/checkout/success?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'http://localhost:5173/workshops/checkout/cancel',
    },
  });
  expectOk('create workshop checkout session', r);
  const workshopPaymentId = pick(r.data || {}, ['data.paymentId']);
  const workshopSessionId = pick(r.data || {}, ['data.sessionId']);
  if (!workshopPaymentId || !workshopSessionId) {
    throw new Error('workshop checkout session response missing payment/session id');
  }
  emitProgress(
    'create workshop checkout session',
    r,
    `paymentId=${workshopPaymentId} sessionId=${workshopSessionId}`,
  );

  r = await api('GET', `/payments/session-status/${workshopSessionId}`, {
    token: buyerToken,
  });
  expectOk('workshop session status pending', r);
  const workshopStatusBefore = pick(r.data || {}, ['data.status']);
  emitProgress('workshop session status before webhook', r, `status=${workshopStatusBefore}`);

  const workshopWebhookEvent = {
    id: `evt_workshop_${stamp}`,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: workshopSessionId,
        object: 'checkout.session',
        payment_intent: `pi_workshop_${stamp}`,
        metadata: {
          paymentId: workshopPaymentId,
        },
      },
    },
  };

  r = await sendSignedWebhookEvent(workshopWebhookEvent);
  emitProgress('workshop webhook completed event', r);

  r = await api('GET', `/payments/session-status/${workshopSessionId}`, {
    token: buyerToken,
  });
  expectOk('workshop session status paid', r);
  const workshopStatusAfter = pick(r.data || {}, ['data.status']);
  const workshopFinalizedRefId = pick(r.data || {}, ['data.finalizedRefId']);
  if (workshopStatusAfter !== 'paid' || !workshopFinalizedRefId) {
    throw new Error(
      `workshop session expected paid + finalizedRefId, got status=${workshopStatusAfter} finalizedRefId=${workshopFinalizedRefId}`,
    );
  }
  emitProgress(
    'workshop session status after webhook',
    r,
    `status=${workshopStatusAfter} finalizedRefId=${workshopFinalizedRefId}`,
  );

  r = await api('POST', '/workshops/reservations', {
    token: buyerToken,
    body: {
      workshopId,
      attendeeIds,
    },
  });
  expectOk('create workshop reservation after payment', r);
  const reservationId = pick(r.data || {}, ['data.reservationId']);
  if (!reservationId) {
    throw new Error('workshop reservation missing reservationId');
  }
  emitProgress('create workshop reservation', r, `reservationId=${reservationId}`);

  summary.workshop = {
    workshopId,
    orderSummaryId: workshopOrderSummaryId,
    paymentId: workshopPaymentId,
    sessionId: workshopSessionId,
    statusBeforeWebhook: workshopStatusBefore,
    statusAfterWebhook: workshopStatusAfter,
    reservationId,
  };

  console.log('\n=== FLOW TEST SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('\nFLOW TEST FAILED');
  console.error(error.message || error);
  process.exit(1);
});
