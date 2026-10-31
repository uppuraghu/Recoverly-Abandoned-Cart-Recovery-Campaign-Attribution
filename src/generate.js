
const fs = require('fs');
const path = require('path');

const {
    rng,
    pick,
    int,
    money,
    iso,
    mkdir,
    writeCsv,
    writeJson,
    sha256,
    writeSql
} = require('./lib');

// Configuration
const SEED = Number(process.env.SEED || 20261022);
const CART_COUNT = Number(process.env.CARTS || 50000);

const ABANDONED_COUNT = Math.floor(CART_COUNT * 0.4);
const CAMPAIGN_COUNT = Math.floor(CART_COUNT * 0.2);
const SEND_COUNT = Math.floor(CART_COUNT * 0.2);

const ROOT = path.resolve(
    process.argv.find(a => a.startsWith('--out='))?.split('=')[1] || 'output'
);

const r = rng(SEED);

const now = Date.parse('2026-10-22T12:00:00.000Z');
const days = 120;
const msDay = 86400000;

// Available devices and communication channels
const devices = [
    'desktop',
    'mobile_web',
    'ios_app',
    'android_app'
];

const channels = [
    'email',
    'sms'
];

// Product catalogue
const products = [
    ['SKU-001', 'Everyday Backpack', 49.99],
    ['SKU-002', 'Wireless Earbuds', 79.50],
    ['SKU-003', 'Steel Water Bottle', 22.00],
    ['SKU-004', 'Running Shoes', 89.00],
    ['SKU-005', 'Desk Lamp', 34.75],
    ['SKU-006', 'Cotton Hoodie', 42.00],
    ['SKU-007', 'Travel Mug', 18.50],
    ['SKU-008', 'Yoga Mat', 29.99],
    ['SKU-009', 'Phone Stand', 12.99],
    ['SKU-010', 'Bluetooth Speaker', 59.00]
];

// Initialize empty arrays for all database tables
const customers = [];
const consents = [];
const sessions = [];
const carts = [];
const cartLines = [];
const campaigns = [];
const templates = [];
const sends = [];
const events = [];
const orders = [];
const attributions = [];
const cartEvents = [];
const groundTruth = [];

// Calculate customer count
const customerCount = Math.max(
    10000,
    Math.ceil(CART_COUNT * 0.62)
);

// Generate unique IDs
const id = (prefix, n, width = 6) =>
    `${prefix}${String(n).padStart(width, '0')}`;


// ==================================================
// 1. PARENT / MASTER RECORDS
// Customer, Consent, Session, Cart, CartLine
// ==================================================

for (let i = 1; i <= customerCount; i++) {

    const customerId = id('CUS-', i);

    // Generate customer details
    customers.push({
        customer_id: customerId,
        created_at: iso(now - int(r, 1, days) * msDay),
        country: pick(r, ['IN', 'US', 'GB', 'AU', 'CA']),
        segment: pick(r, [
            'new',
            'returning',
            'high_value',
            'discount_sensitive'
        ]),
        lifecycle_state: pick(r, [
            'active',
            'active',
            'active',
            'dormant'
        ]),
        email: `${customerId.toLowerCase()}@example.test`,
        phone: `+1555${String(int(r, 1000000, 9999999))}`
    });

    // Generate email and SMS consent preferences
    const emailOpt = r() > 0.22;
    const smsOpt = r() > 0.48;

    const consentAt = now - int(r, 1, days) * msDay;

    // Email consent record
    consents.push({
        consent_id: `CON-${String(i).padStart(6, '0')}-E`,
        customer_id: customerId,
        channel: 'email',
        status: emailOpt ? 'opt_in' : 'opt_out',
        effective_from: iso(consentAt),
        effective_to: null,
        source: 'preference_center',
        captured_at: iso(consentAt)
    });

    // SMS consent record
    consents.push({
        consent_id: `CON-${String(i).padStart(6, '0')}-S`,
        customer_id: customerId,
        channel: 'sms',
        status: smsOpt ? 'opt_in' : 'opt_out',
        effective_from: iso(consentAt),
        effective_to: null,
        source: 'preference_center',
        captured_at: iso(consentAt)
    });
}


// Generate shopping carts and sessions
for (let i = 1; i <= CART_COUNT; i++) {

    const customer = customers[int(r, 0, customerCount - 1)];

    const cartId = `CART-2026-${String(i).padStart(6, '0')}`;
    const sessionId = `SES-2026-${String(i).padStart(6, '0')}`;

    const created =
        now -
        int(r, 1, days) * msDay -
        int(r, 0, 86399) * 1000;

    const device = pick(r, devices);

    // Generate session
    sessions.push({
        session_id: sessionId,
        customer_id: customer.customer_id,
        device_type: device,
        started_at: iso(created - int(r, 0, 1800) * 1000),
        ended_at: iso(created + int(r, 600, 7200) * 1000),
        source: pick(r, [
            'organic',
            'paid_search',
            'email',
            'direct',
            'affiliate'
        ]),
        session_state: 'completed'
    });

    // Generate cart items
    const nLines = int(r, 1, 4);

    let subtotal = 0;

    const chosen = [];

    for (let j = 0; j < nLines; j++) {

        const p = pick(r, products);
        const qty = int(r, 1, 3);

        const lineTotal = money(p[2] * qty);

        subtotal += lineTotal;

        chosen.push({
            cart_line_id: `${cartId}-L${j + 1}`,
            cart_id: cartId,
            sku: p[0],
            product_name: p[1],
            quantity: qty,
            unit_price: p[2],
            line_total: lineTotal
        });
    }

    const updated = created + int(r, 60, 5400) * 1000;

    const isAbandoned = i <= ABANDONED_COUNT;

    let status = isAbandoned
        ? 'abandoned'
        : (i % 10 === 0 ? 'active' : 'converted');

    let purchasedAt = null;

    if (status === 'converted') {
        purchasedAt = updated + int(r, 300, 5 * 86400) * 1000;
    }

    if (status === 'active') {
        status = 'active';
    }

    const lastActivity = updated;

    // Generate cart record
    carts.push({
        cart_id: cartId,
        customer_id: customer.customer_id,
        session_id: sessionId,
        created_at: iso(created),
        updated_at: iso(updated),
        last_activity_at: iso(lastActivity),
        abandonment_threshold_minutes: 60,
        abandoned_at: isAbandoned
            ? iso(lastActivity + 60 * 60000)
            : null,
        status,
        subtotal: money(subtotal),
        discount_amount: 0,
        tax_amount: money(subtotal * 0.08),
        cart_total: money(subtotal * 1.08),
        currency: 'USD',
        purchased_at: purchasedAt ? iso(purchasedAt) : null
    });

    // Add cart line items
    cartLines.push(...chosen);

    // Record cart creation event
    cartEvents.push({
        cart_event_id: `CE-${String(i).padStart(7, '0')}-01`,
        cart_id: cartId,
        event_type: 'created',
        event_at: iso(created),
        old_status: null,
        new_status: 'open',
        details: 'Cart created from session'
    });

    // Record cart update event
    cartEvents.push({
        cart_event_id: `CE-${String(i).padStart(7, '0')}-02`,
        cart_id: cartId,
        event_type: 'updated',
        event_at: iso(updated),
        old_status: 'open',
        new_status: isAbandoned ? 'abandoned' : status,
        details: 'Cart line activity recorded'
    });
}


// ==================================================
// 2. CONSENT WITHDRAWAL EVENTS
// ==================================================

// Consent withdrawal events are applied after cart creation
// to test send-time consent.

// Explicit opt-out fixture for the first send.
const firstSendCustomer = carts[4].customer_id;

consents.push({
    consent_id: 'CON-WD-EDGE-0001',
    customer_id: firstSendCustomer,
    channel: 'email',
    status: 'opt_out',
    effective_from: iso(now - 2 * msDay),
    effective_to: null,
    source: 'unsubscribe_link',
    captured_at: iso(now - 2 * msDay)
});

// Store customers who have withdrawn consent.
const withdrawalCustomers = new Set();

for (let i = 0; i < 600; i++) {

    const c = customers[int(r, 0, customers.length - 1)];

    if (withdrawalCustomers.has(c.customer_id)) {
        continue;
    }

    withdrawalCustomers.add(c.customer_id);

    const channel = pick(r, channels);
    const t = now - int(r, 1, 20) * msDay;

    consents.push({
        consent_id: `CON-WD-${String(i + 1).padStart(4, '0')}`,
        customer_id: c.customer_id,
        channel,
        status: 'opt_out',
        effective_from: iso(t),
        effective_to: null,
        source: 'unsubscribe_link',
        captured_at: iso(t)
    });
}


// ==================================================
// 3. CAMPAIGNS AND MESSAGE TEMPLATES
// ==================================================

// Generate message templates.
for (let i = 1; i <= 20; i++) {

    templates.push({
        template_id: `TPL-${String(i).padStart(3, '0')}`,
        channel: i % 2 ? 'email' : 'sms',
        variant: i % 2 ? 'benefit_reminder' : 'product_reminder',
        subject: i % 2
            ? 'Your cart is waiting'
            : 'Still thinking it over?',
        body_text: i % 2
            ? 'A friendly reminder: items are waiting in your cart.'
            : 'Your selected items are still available. Return when ready.',
        personalization_fields: 'first_name,cart_items,cart_total'
    });
}

// Generate campaigns.
for (let i = 1; i <= CAMPAIGN_COUNT; i++) {

    const channel = i % 2 ? 'email' : 'sms';

    campaigns.push({
        campaign_id: `CMP-2026-${String(i).padStart(6, '0')}`,
        campaign_name: `Cart Recovery ${
            i % 4 === 0
                ? 'Incentive'
                : i % 4 === 1
                    ? 'Reminder'
                    : i % 4 === 2
                        ? 'Product Highlight'
                        : 'Last Chance'
        }`,
        channel,
        variant: i % 4 === 0
            ? 'discount'
            : i % 4 === 1
                ? 'simple_reminder'
                : i % 4 === 2
                    ? 'recommendation'
                    : 'urgency',
        template_id: `TPL-${String(((i - 1) % 20) + 1).padStart(3, '0')}`,
        scheduled_at: iso(now - int(r, 1, 14) * msDay),
        attribution_window_hours: 168,
        frequency_cap: 2,
        campaign_state: 'completed'
    });
}


// ==================================================
// 4. RECOVERY MESSAGE SEND ATTEMPTS
// ==================================================

const sentCartSet = new Set();

const consentByCustomerChannel = new Map();

// Group consent records by customer and channel.
for (const c of consents) {

    const k = `${c.customer_id}:${c.channel}`;

    if (!consentByCustomerChannel.has(k)) {
        consentByCustomerChannel.set(k, []);
    }

    consentByCustomerChannel.get(k).push(c);
}

// Sort consent records by effective date.
for (const rows of consentByCustomerChannel.values()) {
    rows.sort((a, b) =>
        a.effective_from.localeCompare(b.effective_from)
    );
}

// Generate send attempts.
for (let i = 1; i <= SEND_COUNT; i++) {

    const cartIndex = (i * 5 - 1) % CART_COUNT;

    const cart = carts[cartIndex];
    const customerId = cart.customer_id;

    const campaign = campaigns[(i - 1) % campaigns.length];

    const channel = campaign.channel;

    const sendId = `SEND-2026-${String(i).padStart(6, '0')}`;

    let sendAt =
        Date.parse(cart.abandoned_at || cart.updated_at) +
        int(r, 5, 180) * 60000;

    const isOptoutAnomaly = i === 1;

    if (isOptoutAnomaly) {
        sendAt = Math.max(
            sendAt,
            now - 2 * msDay + 60000
        );
    }

    const consentRows =
        consentByCustomerChannel.get(`${customerId}:${channel}`) || [];

    const effectiveRows = consentRows.filter(x =>
        Date.parse(x.effective_from) <= sendAt &&
        (!x.effective_to || Date.parse(x.effective_to) > sendAt)
    );

    const latest = effectiveRows
        .sort((a, b) =>
            a.effective_from.localeCompare(b.effective_from)
        )
        .at(-1);

    let suppressionReason = null;

    if (cart.status !== 'abandoned') {
        suppressionReason = 'cart_not_abandoned';
    } else if (!latest || latest.status !== 'opt_in') {
        suppressionReason = 'no_active_consent';
    } else if (sentCartSet.has(`${customerId}:${channel}`)) {
        suppressionReason = 'frequency_cap';
    }

    const isSent = !suppressionReason || isOptoutAnomaly;

    if (isSent) {
        sentCartSet.add(`${customerId}:${channel}`);
    }

    // Store send attempt.
    sends.push({
        send_id: sendId,
        campaign_id: campaign.campaign_id,
        customer_id: customerId,
        cart_id: cart.cart_id,
        channel,
        template_id: campaign.template_id,
        message_id: `MSG-${cart.cart_id}-01`,
        attempted_at: iso(sendAt),
        send_status: isSent ? 'sent' : 'suppressed',
        suppression_reason: isOptoutAnomaly
            ? 'none'
            : (isSent ? 'none' : suppressionReason),
        idempotency_key: `${campaign.campaign_id}:${cart.cart_id}:${channel}`
    });

    // Generate message events for successful sends.
    if (isSent) {

        events.push({
            message_event_id: `ME-${String(i).padStart(7, '0')}-D`,
            send_id: sendId,
            event_type: 'delivered',
            event_at: iso(sendAt + int(r, 1, 90) * 1000),
            event_source: 'synthetic_provider'
        });

        // Generate open events randomly.
        if (r() < 0.58) {

            events.push({
                message_event_id: `ME-${String(i).padStart(7, '0')}-O`,
                send_id: sendId,
                event_type: 'opened',
                event_at: iso(sendAt + int(r, 2, 720) * 60000),
                event_source: 'synthetic_provider'
            });
        }

        // Generate click events randomly.
        if (r() < 0.27) {

            events.push({
                message_event_id: `ME-${String(i).padStart(7, '0')}-C`,
                send_id: sendId,
                event_type: 'clicked',
                event_at: iso(sendAt + int(r, 3, 900) * 60000),
                event_source: 'synthetic_provider'
            });
        }
    }

    // Record the intentional opt-out anomaly.
    if (isOptoutAnomaly) {

        groundTruth.push({
            issue_id: 'GT-001',
            entity_type: 'SendAttempt',
            entity_id: sendId,
            issue_type: 'message_sent_after_opt_out',
            ground_truth: 'violation',
            expected_decision: 'Suppress send because latest effective consent is opt_out',
            severity: 'critical'
        });
    }
}


// ==================================================
// 5. ORDER GENERATION
// ==================================================

let orderN = 0;

for (let i = 0; i < CART_COUNT; i++) {

    const cart = carts[i];

    const naturalConverted = cart.status === 'converted';

    const recovered = cart.status === 'abandoned' && i % 7 === 0;

    if (!naturalConverted && !recovered) {
        continue;
    }

    orderN++;

    const latePurchase = recovered && i % 35 === 0;

    const orderAt = naturalConverted
        ? Date.parse(cart.purchased_at)
        : Date.parse(cart.abandoned_at) +
            (latePurchase
                ? int(r, 169, 240)
                : int(r, 1, 36)) * 3600000;

    const orderId = `ORD-2026-${String(orderN).padStart(6, '0')}`;

    const orderTotal = cart.cart_total;

    orders.push({
        order_id: orderId,
        customer_id: cart.customer_id,
        cart_id: cart.cart_id,
        ordered_at: iso(orderAt),
        order_status: 'paid',
        subtotal: cart.subtotal,
        tax_amount: cart.tax_amount,
        order_total: orderTotal,
        currency: cart.currency,
        is_late_purchase: latePurchase ? 1 : 0
    });

    if (recovered) {

        cart.status = 'recovered';
        cart.purchased_at = iso(orderAt);

        cartEvents.push({
            cart_event_id: `CE-REC-${String(orderN).padStart(7, '0')}`,
            cart_id: cart.cart_id,
            event_type: 'recovered_purchase',
            event_at: iso(orderAt),
            old_status: 'abandoned',
            new_status: 'recovered',
            details: 'Order placed after abandonment'
        });
    }
}


// ==================================================
// 6. ATTRIBUTION CALCULATION
// ==================================================

// Deterministic attribution:
// Last eligible clicked send within 7 days before order.

const clickedAtBySend = new Map();

for (const e of events) {

    if (e.event_type === 'clicked') {
        clickedAtBySend.set(
            e.send_id,
            Date.parse(e.event_at)
        );
    }
}

const sendsByCart = new Map();

for (const s of sends) {

    const k = `${s.customer_id}:${s.cart_id}`;

    if (!sendsByCart.has(k)) {
        sendsByCart.set(k, []);
    }

    sendsByCart.get(k).push(s);
}

// Find eligible campaign clicks for each order.
for (const order of orders) {

    const orderedMs = Date.parse(order.ordered_at);

    const candidates = (
        sendsByCart.get(`${order.customer_id}:${order.cart_id}`) || []
    ).filter(s => {

        const clickAt = clickedAtBySend.get(s.send_id);

        return (
            s.send_status === 'sent' &&
            clickAt !== undefined &&
            clickAt <= orderedMs &&
            clickAt >= orderedMs - 168 * 3600000 &&
            Date.parse(s.attempted_at) <= orderedMs
        );

    }).sort((a, b) =>
        b.attempted_at.localeCompare(a.attempted_at)
    );

    if (candidates.length) {

        attributions.push({
            attribution_id: `ATT-${String(attributions.length + 1).padStart(6, '0')}`,
            order_id: order.order_id,
            send_id: candidates[0].send_id,
            campaign_id: candidates[0].campaign_id,
            attribution_model: 'last_click',
            attributed_at: order.ordered_at,
            attributed_revenue: order.order_total,
            attribution_window_hours: 168,
            is_primary: 1
        });
    }
}


// ==================================================
// 7. INTENTIONAL ANOMALY INJECTION
// ==================================================

// Anomaly 1: Purchased cart marked as abandoned.

const gtCart2 = carts[1];

const anomalyPurchaseAt =
    Date.parse(gtCart2.updated_at) + 2 * 3600000;

const anomalyOrderId =
    `ORD-2026-${String(orders.length + 1).padStart(6, '0')}`;

orders.push({
    order_id: anomalyOrderId,
    customer_id: gtCart2.customer_id,
    cart_id: gtCart2.cart_id,
    ordered_at: iso(anomalyPurchaseAt),
    order_status: 'paid',
    subtotal: gtCart2.subtotal,
    tax_amount: gtCart2.tax_amount,
    order_total: gtCart2.cart_total,
    currency: gtCart2.currency,
    is_late_purchase: 0
});

gtCart2.purchased_at = iso(anomalyPurchaseAt);
gtCart2.status = 'abandoned';
gtCart2.abandoned_at = iso(
    Date.parse(gtCart2.updated_at) + 3600000
);

cartEvents.push({
    cart_event_id: 'CE-ANOMALY-0001',
    cart_id: gtCart2.cart_id,
    event_type: 'purchase_then_bad_abandonment',
    event_at: iso(anomalyPurchaseAt + 60000),
    old_status: 'converted',
    new_status: 'abandoned',
    details: 'Intentional lifecycle anomaly; see ground truth GT-002'
});

groundTruth.push({
    issue_id: 'GT-002',
    entity_type: 'Cart',
    entity_id: gtCart2.cart_id,
    issue_type: 'cart_abandoned_after_purchase',
    ground_truth: 'violation',
    expected_decision: 'Purchase timestamp must close cart before abandonment evaluation',
    severity: 'high'
});


// Anomaly 2: Duplicate campaign attribution.

if (attributions.length) {

    const a = attributions[0];

    const order = orders.find(
        o => o.order_id === a.order_id
    );

    const secondTouch = sends.find(s =>
        s.send_status === 'sent' &&
        s.customer_id === order.customer_id &&
        s.campaign_id !== a.campaign_id
    ) || sends.find(s =>
        s.send_status === 'sent' &&
        s.campaign_id !== a.campaign_id
    );

    attributions.push({
        ...a,
        attribution_id: `ATT-${String(attributions.length + 1).padStart(6, '0')}`,
        campaign_id: secondTouch.campaign_id,
        send_id: secondTouch.send_id,
        is_primary: 0
    });

    groundTruth.push({
        issue_id: 'GT-003',
        entity_type: 'Attribution',
        entity_id: a.order_id,
        issue_type: 'attribution_double_counted_across_campaigns',
        ground_truth: 'violation',
        expected_decision: 'Only one campaign may receive primary last-click credit per order; secondary duplicate credit must be rejected',
        severity: 'high'
    });
}


// Anomaly 3: Cart total remains stale after quantity update.

const staleCart = carts[2];

const staleLine = cartLines.find(
    x => x.cart_id === staleCart.cart_id
);

if (staleLine) {

    staleLine.quantity += 1;

    staleLine.line_total = money(
        staleLine.quantity * staleLine.unit_price
    );
}

groundTruth.push({
    issue_id: 'GT-004',
    entity_type: 'Cart',
    entity_id: staleCart.cart_id,
    issue_type: 'cart_total_stale_after_quantity_update',
    ground_truth: 'violation',
    expected_decision: 'Recalculate cart subtotal/tax/total from current CartLine records',
    severity: 'medium'
});


// ==================================================
// 8. DATABASE TABLE COLLECTION
// ==================================================

const tables = {
    Customer: customers,
    Consent: consents,
    Session: sessions,
    Cart: carts,
    CartLine: cartLines,
    MessageTemplate: templates,
    Campaign: campaigns,
    SendAttempt: sends,
    MessageEvent: events,
    Order: orders,
    Attribution: attributions,
    CartEvent: cartEvents
};


// ==================================================
// 9. SQL DATABASE SCHEMA
// ==================================================

const schema = `
CREATE TABLE Customer(
    customer_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    country TEXT NOT NULL,
    segment TEXT NOT NULL,
    lifecycle_state TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL
);

CREATE TABLE Consent(
    consent_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES Customer(customer_id),
    channel TEXT NOT NULL,
    status TEXT NOT NULL,
    effective_from TEXT NOT NULL,
    effective_to TEXT,
    source TEXT NOT NULL,
    captured_at TEXT NOT NULL
);

CREATE TABLE Session(
    session_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES Customer(customer_id),
    device_type TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    source TEXT NOT NULL,
    session_state TEXT NOT NULL
);

CREATE TABLE Cart(
    cart_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES Customer(customer_id),
    session_id TEXT NOT NULL REFERENCES Session(session_id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_activity_at TEXT NOT NULL,
    abandonment_threshold_minutes INTEGER NOT NULL,
    abandoned_at TEXT,
    status TEXT NOT NULL,
    subtotal REAL NOT NULL,
    discount_amount REAL NOT NULL,
    tax_amount REAL NOT NULL,
    cart_total REAL NOT NULL,
    currency TEXT NOT NULL,
    purchased_at TEXT
);

CREATE TABLE CartLine(
    cart_line_id TEXT PRIMARY KEY,
    cart_id TEXT NOT NULL REFERENCES Cart(cart_id),
    sku TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    line_total REAL NOT NULL
);

CREATE TABLE Campaign(
    campaign_id TEXT PRIMARY KEY,
    campaign_name TEXT NOT NULL,
    channel TEXT NOT NULL,
    variant TEXT NOT NULL,
    template_id TEXT NOT NULL REFERENCES MessageTemplate(template_id),
    scheduled_at TEXT NOT NULL,
    attribution_window_hours INTEGER NOT NULL,
    frequency_cap INTEGER NOT NULL,
    campaign_state TEXT NOT NULL
);

CREATE TABLE MessageTemplate(
    template_id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    variant TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_text TEXT NOT NULL,
    personalization_fields TEXT NOT NULL
);

CREATE TABLE SendAttempt(
    send_id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES Campaign(campaign_id),
    customer_id TEXT NOT NULL REFERENCES Customer(customer_id),
    cart_id TEXT NOT NULL REFERENCES Cart(cart_id),
    channel TEXT NOT NULL,
    template_id TEXT NOT NULL REFERENCES MessageTemplate(template_id),
    message_id TEXT NOT NULL,
    attempted_at TEXT NOT NULL,
    send_status TEXT NOT NULL,
    suppression_reason TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE
);

CREATE TABLE MessageEvent(
    message_event_id TEXT PRIMARY KEY,
    send_id TEXT NOT NULL REFERENCES SendAttempt(send_id),
    event_type TEXT NOT NULL,
    event_at TEXT NOT NULL,
    event_source TEXT NOT NULL
);

CREATE TABLE "Order"(
    order_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES Customer(customer_id),
    cart_id TEXT NOT NULL REFERENCES Cart(cart_id),
    ordered_at TEXT NOT NULL,
    order_status TEXT NOT NULL,
    subtotal REAL NOT NULL,
    tax_amount REAL NOT NULL,
    order_total REAL NOT NULL,
    currency TEXT NOT NULL,
    is_late_purchase INTEGER NOT NULL
);

CREATE TABLE Attribution(
    attribution_id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES "Order"(order_id),
    send_id TEXT NOT NULL REFERENCES SendAttempt(send_id),
    campaign_id TEXT NOT NULL REFERENCES Campaign(campaign_id),
    attribution_model TEXT NOT NULL,
    attributed_at TEXT NOT NULL,
    attributed_revenue REAL NOT NULL,
    attribution_window_hours INTEGER NOT NULL,
    is_primary INTEGER NOT NULL
);

CREATE TABLE CartEvent(
    cart_event_id TEXT PRIMARY KEY,
    cart_id TEXT NOT NULL REFERENCES Cart(cart_id),
    event_type TEXT NOT NULL,
    event_at TEXT NOT NULL,
    old_status TEXT,
    new_status TEXT NOT NULL,
    details TEXT NOT NULL
);
`;


// ==================================================
// 10. CREATE OUTPUT DIRECTORIES AND FILES
// ==================================================

mkdir(ROOT);

const dataDir = path.join(ROOT, 'data');

mkdir(dataDir);

// Generate CSV and JSON files for each table.
for (const [name, rows] of Object.entries(tables)) {

    const file = path.join(
        dataDir,
        `${name.toLowerCase()}.csv`
    );

    writeCsv(file, rows);

    writeJson(
        path.join(dataDir, `${name.toLowerCase()}.json`),
        rows
    );
}


// Generate ground truth files.
writeCsv(
    path.join(ROOT, 'ground_truth.csv'),
    groundTruth
);

writeJson(
    path.join(ROOT, 'ground_truth.json'),
    groundTruth
);


// Generate SQL seed file.
writeSql(
    path.join(ROOT, 'seed.sql'),
    tables,
    schema
);


// ==================================================
// 11. GENERATE MANIFEST AND FILE CHECKSUMS
// ==================================================

// Calculate total records in each table.
const counts = Object.fromEntries(
    Object.entries(tables).map(([k, v]) => [k, v.length])
);

// Store file information and SHA-256 checksums.
const files = [];

for (const f of fs.readdirSync(dataDir).sort()) {

    const p = path.join(dataDir, f);

    files.push({
        file: `data/${f}`,
        bytes: fs.statSync(p).size,
        sha256: sha256(p)
    });
}

// Include the additional output files.
for (const f of [
    'ground_truth.csv',
    'ground_truth.json',
    'seed.sql'
]) {

    const p = path.join(ROOT, f);

    files.push({
        file: f,
        bytes: fs.statSync(p).size,
        sha256: sha256(p)
    });
}


// Generate project manifest.
writeJson(
    path.join(ROOT, 'manifest.json'),
    {
        project: 'abandoned-cart-recovery',

        generated_at: '2026-10-22T12:00:00.000Z',

        seed: SEED,

        parameters: {
            carts: CART_COUNT,
            abandoned_carts: ABANDONED_COUNT,
            campaigns: CAMPAIGN_COUNT,
            send_attempts: SEND_COUNT,
            customers: customerCount
        },

        counts,

        files,

        provenance: 'Entirely synthetic records; no external personal data or public dataset used.'
    }
);


// ==================================================
// 12. DISPLAY FINAL GENERATION SUMMARY
// ==================================================

console.log(
    JSON.stringify(
        {
            output: ROOT,
            seed: SEED,
            counts,
            ground_truth: groundTruth.length
        },
        null,
        2
    )
);
