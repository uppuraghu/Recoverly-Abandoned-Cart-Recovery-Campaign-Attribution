
const fs = require('fs');
const path = require('path');

// Get the input folder from command-line arguments.
// Default folder is "output".
const root = path.resolve(
    process.argv.find(a => a.startsWith('--in='))?.split('=')[1] || 'output'
);

// Read JSON files from the data folder.
const read = n => JSON.parse(
    fs.readFileSync(
        path.join(root, 'data', `${n.toLowerCase()}.json`),
        'utf8'
    )
);

// Load all project data tables.
const tables = {
    Customer: read('Customer'),
    Consent: read('Consent'),
    Session: read('Session'),
    Cart: read('Cart'),
    CartLine: read('CartLine'),
    Campaign: read('Campaign'),
    MessageTemplate: read('MessageTemplate'),
    SendAttempt: read('SendAttempt'),
    MessageEvent: read('MessageEvent'),
    Order: read('Order'),
    Attribution: read('Attribution'),
    CartEvent: read('CartEvent')
};

// Store validation issues and total checks.
const issues = [];
let checks = 0;

// Read ground truth anomaly records.
const gt = JSON.parse(
    fs.readFileSync(
        path.join(root, 'ground_truth.json'),
        'utf8'
    )
);

// Validation helper function.
function check(ok, msg) {
    checks++;

    if (!ok) {
        issues.push(msg);
    }
}

// Check whether primary keys are unique.
function unique(rows, key, name) {
    const s = new Set();

    for (const x of rows) {
        check(
            !s.has(x[key]),
            `${name}: duplicate ${key}=${x[key]}`
        );

        s.add(x[key]);
    }
}

// Check whether foreign keys reference existing records.
function fk(rows, key, parent, parentKey, name) {
    const s = new Set(
        parent.map(x => x[parentKey])
    );

    for (const x of rows) {
        check(
            s.has(x[key]),
            `${name}: orphan ${key}=${x[key]}`
        );
    }
}

// Validate unique primary keys for every table.
for (const [n, rows] of Object.entries(tables)) {
    const k = Object.keys(rows[0] || {})[0];

    if (k) {
        unique(rows, k, n);
    }
}

// Validate foreign key relationships.
fk(tables.Consent, 'customer_id', tables.Customer, 'customer_id', 'Consent');

fk(tables.Session, 'customer_id', tables.Customer, 'customer_id', 'Session');

fk(tables.Cart, 'customer_id', tables.Customer, 'customer_id', 'Cart');

fk(tables.Cart, 'session_id', tables.Session, 'session_id', 'Cart');

fk(tables.CartLine, 'cart_id', tables.Cart, 'cart_id', 'CartLine');

fk(tables.SendAttempt, 'campaign_id', tables.Campaign, 'campaign_id', 'SendAttempt');

fk(tables.SendAttempt, 'customer_id', tables.Customer, 'customer_id', 'SendAttempt');

fk(tables.SendAttempt, 'cart_id', tables.Cart, 'cart_id', 'SendAttempt');

fk(tables.SendAttempt, 'template_id', tables.MessageTemplate, 'template_id', 'SendAttempt');

fk(tables.MessageEvent, 'send_id', tables.SendAttempt, 'send_id', 'MessageEvent');

fk(tables.Order, 'customer_id', tables.Customer, 'customer_id', 'Order');

fk(tables.Order, 'cart_id', tables.Cart, 'cart_id', 'Order');

fk(tables.Attribution, 'order_id', tables.Order, 'order_id', 'Attribution');

fk(tables.Attribution, 'send_id', tables.SendAttempt, 'send_id', 'Attribution');

fk(tables.Attribution, 'campaign_id', tables.Campaign, 'campaign_id', 'Attribution');

fk(tables.CartEvent, 'cart_id', tables.Cart, 'cart_id', 'CartEvent');

// Create a map of carts using cart_id as the key.
const cartMap = new Map(
    tables.Cart.map(x => [x.cart_id, x])
);

// Store calculated line totals for each cart.
const lineTotals = new Map();

for (const l of tables.CartLine) {
    lineTotals.set(
        l.cart_id,
        (lineTotals.get(l.cart_id) || 0) + l.line_total
    );
}

// Validate cart timestamps and abandonment thresholds.
for (const c of tables.Cart) {
    check(
        Date.parse(c.created_at) <= Date.parse(c.updated_at),
        `Cart ${c.cart_id}: created after updated`
    );

    check(
        c.abandonment_threshold_minutes > 0,
        `Cart ${c.cart_id}: invalid abandonment threshold`
    );
}

// Validate consent channel and status values.
for (const c of tables.Consent) {
    check(
        ['email', 'sms'].includes(c.channel) &&
        ['opt_in', 'opt_out'].includes(c.status),
        `Consent ${c.consent_id}: invalid enum`
    );
}

// Validate message sending status.
for (const s of tables.SendAttempt) {
    check(
        ['sent', 'suppressed', 'failed'].includes(s.send_status),
        `Send ${s.send_id}: invalid status`
    );
}

// Validate message event types.
for (const e of tables.MessageEvent) {
    check(
        ['delivered', 'opened', 'clicked', 'bounced'].includes(e.event_type),
        `MessageEvent ${e.message_event_id}: invalid type`
    );
}

// Arithmetic reconciliation.
// Exclude the specifically labelled stale-cart fixture.
const staleCartIds = new Set(
    gt
        .filter(x => x.issue_type === 'cart_total_stale_after_quantity_update')
        .map(x => x.entity_id)
);

// Compare two monetary values with a small tolerance.
const moneyClose = (a, b) =>
    Math.abs(Number(a) - Number(b)) < 0.011;

// Validate cart line quantity and line total.
for (const l of tables.CartLine) {
    check(
        l.quantity > 0 &&
        moneyClose(l.line_total, l.quantity * l.unit_price),
        `CartLine ${l.cart_line_id}: quantity/line total mismatch`
    );
}

// Validate cart subtotal and total calculations.
for (const c of tables.Cart) {

    if (!staleCartIds.has(c.cart_id)) {

        check(
            moneyClose(
                c.subtotal,
                lineTotals.get(c.cart_id) || 0
            ),
            `Cart ${c.cart_id}: subtotal does not reconcile to lines`
        );

        check(
            moneyClose(
                c.cart_total,
                c.subtotal - c.discount_amount + c.tax_amount
            ),
            `Cart ${c.cart_id}: cart total arithmetic mismatch`
        );
    }
}

// Validate order total calculations.
for (const o of tables.Order) {
    check(
        moneyClose(
            o.order_total,
            o.subtotal + o.tax_amount
        ),
        `Order ${o.order_id}: order total arithmetic mismatch`
    );
}

// Evaluate consent at the exact message decision time.
// The labelled opt-out send is intentionally exempt.
const consentByKey = new Map();

for (const c of tables.Consent) {
    const k = `${c.customer_id}:${c.channel}`;

    if (!consentByKey.has(k)) {
        consentByKey.set(k, []);
    }

    consentByKey.get(k).push(c);
}

// Get the send IDs associated with the opt-out anomaly.
const gtOptoutSend = new Set(
    gt
        .filter(x => x.issue_type === 'message_sent_after_opt_out')
        .map(x => x.entity_id)
);

// Collect all send IDs that have message events.
const eventSendIds = new Set(
    tables.MessageEvent.map(e => e.send_id)
);

// Validate send attempts against consent records.
for (const s of tables.SendAttempt) {

    const t = Date.parse(s.attempted_at);

    const active = (
        consentByKey.get(`${s.customer_id}:${s.channel}`) || []
    )
        .filter(c =>
            Date.parse(c.effective_from) <= t &&
            (!c.effective_to || Date.parse(c.effective_to) > t)
        )
        .sort((a, b) =>
            a.effective_from.localeCompare(b.effective_from)
        );

    const latest = active.at(-1);

    // A sent message must have an active opt-in.
    if (s.send_status === 'sent' && !gtOptoutSend.has(s.send_id)) {
        check(
            !!latest && latest.status === 'opt_in',
            `Send ${s.send_id}: sent without active opt-in`
        );
    }

    // Suppressed attempts should not have message events.
    if (s.send_status === 'suppressed') {
        check(
            !eventSendIds.has(s.send_id),
            `Send ${s.send_id}: suppressed attempt has message events`
        );
    }
}

// Validate primary attribution counts.
const primaryCounts = new Map();

for (const a of tables.Attribution) {

    if (a.is_primary === 1) {

        primaryCounts.set(
            a.order_id,
            (primaryCounts.get(a.order_id) || 0) + 1
        );
    }
}

for (const [orderId, n] of primaryCounts) {
    check(
        n <= 1,
        `Order ${orderId}: multiple primary attribution rows`
    );
}

// Create lookup maps for orders and send attempts.
const orderById = new Map(
    tables.Order.map(x => [x.order_id, x])
);

const sendById = new Map(
    tables.SendAttempt.map(x => [x.send_id, x])
);

// Identify orders with intentional double-attribution anomalies.
const anomalyOrderIds = new Set(
    gt
        .filter(x => x.issue_type === 'attribution_double_counted_across_campaigns')
        .map(x => x.entity_id)
);

// Validate attribution relationships.
for (const a of tables.Attribution) {

    const o = orderById.get(a.order_id);
    const s = sendById.get(a.send_id);

    check(
        !!o && !!s && a.campaign_id === s.campaign_id,
        `Attribution ${a.attribution_id}: campaign/send mismatch`
    );

    // Skip the order/send scope check for the intentional anomaly.
    if (!anomalyOrderIds.has(a.order_id)) {

        check(
            !!o &&
            !!s &&
            o.customer_id === s.customer_id &&
            o.cart_id === s.cart_id,
            `Attribution ${a.attribution_id}: order/send scope mismatch`
        );
    }
}

// Confirm that intentional double-attribution exists.
for (const orderId of anomalyOrderIds) {

    const rows = tables.Attribution.filter(
        x => x.order_id === orderId
    );

    check(
        rows.length > 1 &&
        new Set(rows.map(x => x.campaign_id)).size > 1,
        `Ground-truth order ${orderId}: duplicate campaign attribution not present`
    );
}

// Calculate expected abandoned carts.
const expectedAbandoned = Math.floor(
    Number(
        require(path.join(root, 'manifest.json')).parameters.carts
    ) * 0.4
);

// Validate source data volumes.
check(
    tables.Cart.length === Number(
        require(path.join(root, 'manifest.json')).parameters.carts
    ),
    'Cart volume does not match manifest'
);

check(
    tables.Campaign.length === Math.floor(tables.Cart.length * 0.2),
    'Campaign volume target mismatch'
);

check(
    tables.SendAttempt.length === Math.floor(tables.Cart.length * 0.2),
    'Send volume target mismatch'
);

// Count carts with abandonment timestamps.
const abandonedAtGeneration = tables.Cart.filter(
    c => c.abandoned_at !== null
).length;

check(
    abandonedAtGeneration === expectedAbandoned,
    `Expected ${expectedAbandoned} abandoned timestamp records, found ${abandonedAtGeneration}`
);

// Validate ground truth anomaly records.
check(
    gt.length === 4,
    'Expected four labelled edge cases'
);

check(
    gt.map(x => x.issue_type).includes('message_sent_after_opt_out'),
    'Missing opt-out anomaly label'
);

check(
    gt.map(x => x.issue_type).includes('cart_abandoned_after_purchase'),
    'Missing purchased-cart anomaly label'
);

check(
    gt.map(x => x.issue_type).includes('attribution_double_counted_across_campaigns'),
    'Missing double-attribution anomaly label'
);

check(
    gt.map(x => x.issue_type).includes('cart_total_stale_after_quantity_update'),
    'Missing stale-total anomaly label'
);

// Prepare the final validation report.
const report = {
    status: issues.length ? 'FAIL' : 'PASS',

    checks,

    issue_count: issues.length,

    issues: issues.slice(0, 100),

    row_counts: Object.fromEntries(
        Object.entries(tables).map(([k, v]) => [k, v.length])
    ),

    ground_truth_count: gt.length,

    notes: [
        'Four deliberate anomalies are expected and labelled separately.',
        'This validator checks structural integrity and baseline volumes; the four labelled anomaly records are not treated as accidental generator failures.'
    ]
};

// Save the validation report as JSON.
fs.writeFileSync(
    path.join(root, 'validation_summary.json'),
    JSON.stringify(report, null, 2) + '\n'
);

// Display the validation report in the terminal.
console.log(
    JSON.stringify(report, null, 2)
);

// Exit with error code 1 if validation fails.
if (issues.length) {
    process.exit(1);
}
