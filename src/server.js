
const http = require('http');
const fs = require('fs');
const path = require('path');

// ==================================================
// 1. PROJECT CONFIGURATION
// ==================================================

const ROOT = path.resolve(__dirname, '..');

const OUT = path.join(ROOT, 'output');
const DATA = path.join(OUT, 'data');
const PUBLIC = path.join(ROOT, 'public');

const PORT = Number(process.env.PORT || 3000);

const STATE_FILE = path.join(OUT, 'runtime_state.json');

// Available database table names
const names = [
    'customer',
    'consent',
    'session',
    'cart',
    'cartline',
    'campaign',
    'messagetemplate',
    'sendattempt',
    'messageevent',
    'order',
    'attribution',
    'cartevent'
];

// ==================================================
// 2. LOAD DATABASE JSON FILES
// ==================================================

const base = {};

for (const n of names) {

    base[n] = JSON.parse(
        fs.readFileSync(
            path.join(DATA, `${n}.json`),
            'utf8'
        )
    );
}

// Load existing runtime state or initialize empty state.
let state = fs.existsSync(STATE_FILE)
    ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    : {
        consents: [],
        consentClosures: {},
        campaigns: [],
        sends: [],
        events: [],
        orders: [],
        attributions: [],
        cartEvents: [],
        cartStatus: {},
        purchases: {}
    };

// ==================================================
// 3. SAVE RUNTIME STATE
// ==================================================

const save = () => {

    const tmp = STATE_FILE + '.tmp';

    fs.writeFileSync(
        tmp,
        JSON.stringify(state)
    );

    fs.renameSync(tmp, STATE_FILE);
};

// ==================================================
// 4. COMBINE BASE DATA WITH LIVE DATA
// ==================================================

const all = (name) => [

    ...base[name],

    ...(
        name === 'consent' ? state.consents :
        name === 'campaign' ? state.campaigns :
        name === 'sendattempt' ? state.sends :
        name === 'messageevent' ? state.events :
        name === 'order' ? state.orders :
        name === 'attribution' ? state.attributions :
        name === 'cartevent' ? state.cartEvents :
        []
    )
];

// Generate the next available ID number.
const idNum = (rows, field, prefix) => {

    return rows.reduce((m, r) => {

        const x = String(r[field] || '').match(/(\d+)$/);

        return x
            ? Math.max(m, Number(x[1]))
            : m;

    }, 0) + 1;
};

// Current date and time.
const now = () => new Date().toISOString();

// Cache for calculated indexes.
let derivedCache = null;


// ==================================================
// 5. BUILD DATA INDEXES
// ==================================================

function indexes() {

    if (derivedCache) {
        return derivedCache;
    }

    const at = Date.now();

    const consentMap = new Map();
    const sent7d = new Map();
    const purchaseMap = new Map();

    const customerMap = new Map(
        base.customer.map(c => [c.customer_id, c])
    );

    // Build active consent records.
    for (const c of all('consent')) {

        const key = c.customer_id + '|' + c.channel;

        const from = new Date(c.effective_from).getTime();

        const closedAt =
            state.consentClosures?.[c.consent_id] || c.effective_to;

        const to = closedAt
            ? new Date(closedAt).getTime()
            : Infinity;

        if (from <= at && to > at) {

            const old = consentMap.get(key);

            if (
                !old ||
                from > new Date(old.effective_from).getTime()
            ) {
                consentMap.set(key, c);
            }
        }
    }

    // Count sent messages in the last seven days.
    for (const s of all('sendattempt')) {

        if (
            s.send_status === 'sent' &&
            new Date(s.attempted_at).getTime() >= at - 7 * 86400000
        ) {

            const k = s.customer_id + '|' + s.channel;

            sent7d.set(
                k,
                (sent7d.get(k) || 0) + 1
            );
        }
    }

    // Identify carts that already have purchases.
    for (const o of all('order')) {

        if (
            ['paid', 'complete', 'completed'].includes(
                String(o.order_status).toLowerCase()
            )
        ) {
            purchaseMap.set(o.cart_id, o.order_id);
        }
    }

    // Add live purchase records.
    for (const [k, v] of Object.entries(state.purchases)) {

        purchaseMap.set(k, v);
    }

    derivedCache = {
        consentMap,
        sent7d,
        purchaseMap,
        customerMap
    };

    return derivedCache;
}

// Clear cached data after updates.
const invalidate = () => {
    derivedCache = null;
};


// ==================================================
// 6. HELPER FUNCTIONS
// ==================================================

// Get the latest active consent.
const latestConsent = (customerId, channel) => {

    return indexes().consentMap.get(
        customerId + '|' + channel
    );
};

// Check whether a cart has been purchased.
const purchased = (cartId) => {

    return indexes().purchaseMap.has(cartId);
};

// Get the current cart status.
const statusOf = c => {

    return state.cartStatus[c.cart_id] ||
        (purchased(c.cart_id) ? 'recovered' : c.status);
};

// Convert values into numbers.
const money = n => Number(n || 0);

// Send JSON responses.
const json = (res, data, status = 200) => {

    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });

    res.end(JSON.stringify(data));
};

// Read and parse incoming request body.
const body = req => new Promise((resolve, reject) => {

    let s = '';

    req.on('data', c => {

        s += c;

        if (s.length > 1e6) {
            reject(new Error('Request too large'));
        }
    });

    req.on('end', () => {

        try {

            resolve(s ? JSON.parse(s) : {});

        } catch (e) {

            reject(new Error('Invalid JSON body'));
        }
    });
});

// Escape special characters for CSV.
const csvEscape = v => {

    const s = v == null ? '' : String(v);

    return /[",\n\r]/.test(s)
        ? `"${s.replace(/"/g, '""')}"`
        : s;
};

// Convert records into CSV format.
const toCsv = rows => {

    if (!rows.length) {
        return '';
    }

    return [
        Object.keys(rows[0]).join(','),

        ...rows.map(r =>
            Object.keys(rows[0])
                .map(k => csvEscape(r[k]))
                .join(',')
        )

    ].join('\n');
};

// Find cart using cart ID.
const cartById = id => {

    return base.cart.find(c => c.cart_id === id);
};

// Find customer using customer ID.
const customerById = id => {

    return base.customer.find(c => c.customer_id === id);
};


// ==================================================
// 7. RECOVERY ELIGIBILITY CHECK
// ==================================================

function eligible(c, channel, at = now(), cap = 2) {

    if (!c) {
        return {
            ok: false,
            reason: 'cart_not_found'
        };
    }

    if (purchased(c.cart_id)) {
        return {
            ok: false,
            reason: 'already_purchased'
        };
    }

    if (statusOf(c) !== 'abandoned') {
        return {
            ok: false,
            reason: 'cart_not_abandoned'
        };
    }

    const consent = latestConsent(c.customer_id, channel);

    if (!consent || consent.status !== 'opt_in') {
        return {
            ok: false,
            reason: 'no_active_consent'
        };
    }

    const recent =
        indexes().sent7d.get(c.customer_id + '|' + channel) || 0;

    if (recent >= Number(cap || 2)) {
        return {
            ok: false,
            reason: 'frequency_cap'
        };
    }

    return {
        ok: true,
        reason: 'eligible'
    };
}


// ==================================================
// 8. DASHBOARD SUMMARY
// ==================================================

function summary() {

    const carts = base.cart;

    const sends = all('sendattempt');
    const orders = all('order');
    const atts = all('attribution');

    const sent = sends.filter(
        s => s.send_status === 'sent'
    );

    const suppressed = sends.filter(
        s => s.send_status === 'suppressed'
    );

    const events = all('messageevent');

    const delivered = events.filter(
        e => e.event_type === 'delivered'
    ).length;

    const opened = events.filter(
        e => e.event_type === 'opened'
    ).length;

    const clicked = events.filter(
        e => e.event_type === 'clicked'
    ).length;

    const primary = atts.filter(
        a => a.is_primary === 1 || a.is_primary === true
    );

    const revenue = primary.reduce(
        (a, x) => a + money(x.attributed_revenue),
        0
    );

    // Calculate cart status counts.
    const statusCounts = {};

    carts.forEach(c => {

        const s = statusOf(c);

        statusCounts[s] = (statusCounts[s] || 0) + 1;
    });

    // Calculate email and SMS counts.
    const channelCounts = {
        email: 0,
        sms: 0
    };

    sent.forEach(s => {

        channelCounts[s.channel] =
            (channelCounts[s.channel] || 0) + 1;
    });

    // Calculate suppression reasons.
    const suppressionReasons = {};

    suppressed.forEach(s => {

        suppressionReasons[s.suppression_reason] =
            (suppressionReasons[s.suppression_reason] || 0) + 1;
    });

    const campaigns = all('campaign');

    // Calculate campaign performance.
    const campaignPerformance = campaigns
        .slice(-100)
        .map(c => {

            const ss = sends.filter(
                s => s.campaign_id === c.campaign_id
            );

            const ids = new Set(
                ss.map(s => s.send_id)
            );

            return {
                ...c,

                sent: ss.filter(
                    s => s.send_status === 'sent'
                ).length,

                suppressed: ss.filter(
                    s => s.send_status === 'suppressed'
                ).length,

                opens: events.filter(
                    e => ids.has(e.send_id) &&
                        e.event_type === 'opened'
                ).length,

                clicks: events.filter(
                    e => ids.has(e.send_id) &&
                        e.event_type === 'clicked'
                ).length,

                conversions: atts.filter(
                    a => a.campaign_id === c.campaign_id &&
                        a.is_primary === 1
                ).length
            };
        });

    // Return dashboard summary.
    return {

        generated_at: now(),

        seed: 20261022,

        metrics: {

            cart_count: carts.length,

            abandoned_timestamp_count:
                carts.filter(c => c.abandoned_at).length,

            abandoned_current: statusCounts.abandoned || 0,

            recovered: statusCounts.recovered || 0,

            orders: orders.length,

            send_attempts: sends.length,

            sent: sent.length,

            suppressed: suppressed.length,

            delivery_rate:
                sent.length ? delivered / sent.length : 0,

            open_rate:
                delivered ? opened / delivered : 0,

            click_through_rate:
                sent.length ? clicked / sent.length : 0,

            attributed_orders: primary.length,

            attributed_revenue: Number(revenue.toFixed(2)),

            ground_truth_anomalies:
                JSON.parse(
                    fs.readFileSync(
                        path.join(OUT, 'ground_truth.json'),
                        'utf8'
                    )
                ).length
        },

        statusCounts,

        byChannel: channelCounts,

        suppression_reasons: suppressionReasons,

        campaignPerformance
    };
}


// ==================================================
// 9. MAIN HTTP REQUEST HANDLER
// ==================================================

async function handler(req, res) {

    const u = new URL(
        req.url,
        `http://${req.headers.host || 'localhost'}`
    );

    try {

        // ------------------------------------------
        // API HEALTH CHECK
        // ------------------------------------------

        if (
            req.method === 'GET' &&
            u.pathname === '/api/health'
        ) {

            return json(res, {
                ok: true,
                service: 'recoverly-api',
                dataset: 'synthetic',
                cart_count: base.cart.length,
                state_persisted: fs.existsSync(STATE_FILE)
            });
        }


        // ------------------------------------------
        // DASHBOARD SUMMARY
        // ------------------------------------------

        if (
            req.method === 'GET' &&
            u.pathname === '/api/summary'
        ) {

            return json(res, summary());
        }


        // ------------------------------------------
        // GET CARTS WITH SEARCH AND PAGINATION
        // ------------------------------------------

        if (
            req.method === 'GET' &&
            u.pathname === '/api/carts'
        ) {

            const q = (
                u.searchParams.get('q') || ''
            ).toLowerCase();

            const status =
                u.searchParams.get('status') || 'all';

            const page = Math.max(
                1,
                Number(u.searchParams.get('page') || 1)
            );

            const limit = Math.min(
                100,
                Math.max(
                    1,
                    Number(u.searchParams.get('limit') || 25)
                )
            );

            const channel =
                u.searchParams.get('channel') || '';

            // Filter carts.
            let rows = base.cart.filter(c => {

                const st = statusOf(c);

                if (status !== 'all' && st !== status) {
                    return false;
                }

                if (q) {

                    const cust = indexes().customerMap.get(
                        c.customer_id
                    );

                    if (
                        ![
                            c.cart_id,
                            c.customer_id,
                            c.session_id,
                            st,
                            cust?.email
                        ].some(v =>
                            String(v || '').toLowerCase().includes(q)
                        )
                    ) {
                        return false;
                    }
                }

                return true;
            });

            // Filter by recovery eligibility.
            if (channel === 'eligible_email') {

                rows = rows.filter(
                    c => eligible(c, 'email').ok
                );
            }

            if (channel === 'eligible_sms') {

                rows = rows.filter(
                    c => eligible(c, 'sms').ok
                );
            }

            const total = rows.length;

            // Apply pagination and add customer details.
            const pageRows = rows
                .slice((page - 1) * limit, page * limit)
                .map(c => {

                    const cust = indexes().customerMap.get(
                        c.customer_id
                    );

                    const ec = latestConsent(
                        c.customer_id,
                        'email'
                    );

                    const sc = latestConsent(
                        c.customer_id,
                        'sms'
                    );

                    return {

                        ...c,

                        status: statusOf(c),

                        email_consent: ec?.status || 'unknown',

                        sms_consent: sc?.status || 'unknown',

                        email: cust?.email || '',

                        eligible_email: eligible(c, 'email').ok,

                        eligible_sms: eligible(c, 'sms').ok,

                        purchased: purchased(c.cart_id)
                    };
                });

            return json(res, {
                total,
                page,
                limit,
                rows: pageRows
            });
        }


        // ------------------------------------------
        // GET INDIVIDUAL CART DETAILS
        // ------------------------------------------

        if (
            req.method === 'GET' &&
            u.pathname.startsWith('/api/carts/')
        ) {

            const id = decodeURIComponent(
                u.pathname.split('/').pop()
            );

            const c = cartById(id);

            if (!c) {
                return json(res, {
                    error: 'Cart not found'
                }, 404);
            }

            const sends = all('sendattempt').filter(
                x => x.cart_id === id
            );

            const sendIds = new Set(
                sends.map(x => x.send_id)
            );

            return json(res, {

                ...c,

                status: statusOf(c),

                purchased: purchased(id),

                customer: customerById(c.customer_id),

                lines: base.cartline.filter(
                    x => x.cart_id === id
                ),

                consents: all('consent')
                    .filter(x => x.customer_id === c.customer_id)
                    .map(x => ({
                        ...x,

                        effective_to:
                            state.consentClosures?.[x.consent_id] ||
                            x.effective_to ||
                            null
                    })),

                sends,

                messageEvents: all('messageevent').filter(
                    e => sendIds.has(e.send_id)
                ),

                events: all('cartevent')
                    .filter(x => x.cart_id === id)
                    .concat(
                        state.cartEvents.filter(
                            x => x.cart_id === id
                        )
                    ),

                eligibility: {
                    email: eligible(c, 'email'),
                    sms: eligible(c, 'sms')
                }
            });
        }


        // ------------------------------------------
        // GET CUSTOMERS
        // ------------------------------------------

        if (
            req.method === 'GET' &&
            u.pathname === '/api/customers'
        ) {

            const q = (
                u.searchParams.get('q') || ''
            ).toLowerCase();

            const limit = Math.min(
                100,
                Number(u.searchParams.get('limit') || 30)
            );

            let rows = base.customer;

            if (q) {

                rows = rows.filter(c =>
                    [
                        c.customer_id,
                        c.email,
                        c.phone,
                        c.segment
                    ].some(v =>
                        String(v || '').toLowerCase().includes(q)
                    )
                );
            }

            return json(res, {

                total: rows.length,

                rows: rows.slice(0, limit).map(c => ({

                    ...c,

                    email_consent:
                        latestConsent(c.customer_id, 'email')?.status ||
                        'unknown',

                    sms_consent:
                        latestConsent(c.customer_id, 'sms')?.status ||
                        'unknown'
                }))
            });
        }


        // ------------------------------------------
        // GET CAMPAIGNS
        // ------------------------------------------

        if (
            req.method === 'GET' &&
            u.pathname === '/api/campaigns'
        ) {

            return json(res, {

                total: all('campaign').length,

                rows: all('campaign')
                    .slice(-100)
                    .reverse()
            });
        }


        // ------------------------------------------
        // GET DATA QUALITY ANOMALIES
        // ------------------------------------------

        if (
            req.method === 'GET' &&
            u.pathname === '/api/anomalies'
        ) {

            return json(
                res,
                JSON.parse(
                    fs.readFileSync(
                        path.join(OUT, 'ground_truth.json'),
                        'utf8'
                    )
                )
            );
        }


        // ------------------------------------------
        // GET ACTIVITY LOGS
        // ------------------------------------------

        if (
            req.method === 'GET' &&
            u.pathname === '/api/activity'
        ) {

            const rows = [

                ...state.events.map(x => ({
                    ...x,
                    record_type: 'message'
                })),

                ...state.cartEvents.map(x => ({
                    ...x,
                    record_type: 'cart'
                }))

            ].sort(
                (a, b) =>
                    new Date(b.event_at) - new Date(a.event_at)
            );

            return json(res, {
                rows: rows.slice(0, 100)
            });
        }


        // ==================================================
        // 10. UPDATE CUSTOMER CONSENT
        // ==================================================

        if (
            req.method === 'POST' &&
            u.pathname === '/api/consent'
        ) {

            const b = await body(req);

            const cust = customerById(b.customer_id);

            const channel = b.channel;
            const status = b.status;

            if (
                !cust ||
                !['email', 'sms'].includes(channel) ||
                !['opt_in', 'opt_out'].includes(status)
            ) {

                return json(res, {
                    error: 'Valid customer_id, channel and opt_in/opt_out status are required'
                }, 400);
            }

            const at = now();

            const prev = all('consent')
                .filter(c =>
                    c.customer_id === cust.customer_id &&
                    c.channel === channel &&
                    !(state.consentClosures?.[c.consent_id] || c.effective_to)
                )
                .sort((a, b) =>
                    new Date(b.effective_from) -
                    new Date(a.effective_from)
                )[0];

            // Close previous consent record.
            if (prev) {

                state.consentClosures =
                    state.consentClosures || {};

                state.consentClosures[prev.consent_id] = at;
            }

            const id = `CON-R${String(
                state.consents.length + 1
            ).padStart(7, '0')}`;

            // Add new consent record.
            state.consents.push({

                consent_id: id,

                customer_id: cust.customer_id,

                channel,

                status,

                effective_from: at,

                effective_to: null,

                source: 'dashboard_preference_center',

                captured_at: at
            });

            invalidate();

            save();

            return json(res, {

                success: true,

                message: `${channel.toUpperCase()} consent updated to ${status}`,

                consent_id: id
            });
        }


        // ==================================================
        // 11. CREATE CAMPAIGN
        // ==================================================

        if (
            req.method === 'POST' &&
            u.pathname === '/api/campaigns'
        ) {

            const b = await body(req);

            if (
                !b.campaign_name ||
                !['email', 'sms'].includes(b.channel)
            ) {

                return json(res, {
                    error: 'Campaign name and valid channel are required'
                }, 400);
            }

            const id = `CMP-LIVE-${String(
                state.campaigns.length + 1
            ).padStart(5, '0')}`;

            const template = base.messagetemplate.find(
                t => t.channel === b.channel
            ) || base.messagetemplate[0];

            const c = {

                campaign_id: id,

                campaign_name: String(
                    b.campaign_name
                ).slice(0, 100),

                channel: b.channel,

                variant: b.variant || 'personalized_reminder',

                template_id: template.template_id,

                scheduled_at: b.scheduled_at || now(),

                attribution_window_hours: Math.min(
                    720,
                    Math.max(
                        1,
                        Number(b.attribution_window_hours || 168)
                    )
                ),

                frequency_cap: Math.min(
                    10,
                    Math.max(
                        1,
                        Number(b.frequency_cap || 2)
                    )
                ),

                campaign_state: 'active',

                created_at: now()
            };

            state.campaigns.push(c);

            invalidate();

            save();

            return json(res, {
                success: true,
                campaign: c
            });
        }


        // ==================================================
        // 12. SEND CART RECOVERY MESSAGE
        // ==================================================

        if (
            req.method === 'POST' &&
            u.pathname === '/api/recovery/send'
        ) {

            const b = await body(req);

            const c = cartById(b.cart_id);

            const channel = b.channel || 'email';

            let camp = all('campaign').find(
                x => x.campaign_id === b.campaign_id
            );

            if (!camp) {

                camp = all('campaign')
                    .filter(x => x.channel === channel)
                    .slice(-1)[0];
            }

            if (!camp || camp.channel !== channel) {

                return json(res, {
                    error: 'No active campaign for this channel. Create a campaign first.'
                }, 400);
            }

            const decision = eligible(
                c,
                channel,
                now(),
                camp.frequency_cap
            );

            const seq = idNum(
                all('sendattempt'),
                'send_id',
                'SEND'
            );

            const sendId = `SEND-LIVE-${String(seq).padStart(7, '0')}`;

            const attempted = now();

            const idempotencyKey =
                `${camp.campaign_id}:${c?.cart_id || b.cart_id}:${channel}`;

            // Prevent duplicate successful sends.
            if (
                decision.ok &&
                all('sendattempt').some(s =>
                    s.idempotency_key === idempotencyKey &&
                    s.send_status === 'sent'
                )
            ) {

                return json(res, {
                    error: 'This campaign has already sent a recovery message for this cart (idempotency protection).'
                }, 409);
            }

            // Record suppression if the cart is not eligible.
            if (!decision.ok) {

                const suppressed = {

                    send_id: sendId,

                    campaign_id: camp.campaign_id,

                    customer_id: c?.customer_id || '',

                    cart_id: c?.cart_id || b.cart_id,

                    channel,

                    template_id: camp.template_id,

                    message_id: `MSG-${b.cart_id}-SUPPRESSED`,

                    attempted_at: attempted,

                    send_status: 'suppressed',

                    suppression_reason: decision.reason,

                    idempotency_key:
                        `${idempotencyKey}:suppressed:${decision.reason}`
                };

                state.sends.push(suppressed);

                state.cartEvents.push({

                    cart_event_id: `CE-LIVE-${state.cartEvents.length + 1}`,

                    cart_id: b.cart_id,

                    event_type: 'recovery_suppressed',

                    event_at: attempted,

                    old_status: c ? statusOf(c) : 'unknown',

                    new_status: c ? statusOf(c) : 'unknown',

                    details: `${channel} recovery suppressed: ${decision.reason}`
                });

                save();

                return json(res, {

                    success: false,

                    suppressed: true,

                    reason: decision.reason,

                    send: suppressed,

                    message: `Recovery suppressed: ${decision.reason.replaceAll('_', ' ')}. The decision was recorded.`
                });
            }

            // Build personalized message.
            const customer = customerById(c.customer_id);

            const lines = base.cartline.filter(
                x => x.cart_id === c.cart_id
            );

            const items = lines.map(
                x => `${x.quantity} × ${x.product_name}`
            ).join(', ');

            const cartValue = money(c.cart_total);

            const itemText = items || 'your selected items';

            const preview = channel === 'email'

                ? {
                    subject: 'Your cart is waiting',

                    body: `Hello ${customer?.customer_id || 'there'}, you left ${itemText} in your cart (total ${c.currency || 'USD'} ${cartValue.toFixed(2)}). Return when you are ready to complete your purchase.`
                }

                : {
                    subject: '',

                    body: `${customer?.customer_id || 'Hi'}, your cart with ${itemText} (${c.currency || 'USD'} ${cartValue.toFixed(2)}) is waiting. Continue when ready.`
                };

            // Create successful send record.
            const send = {

                send_id: sendId,

                campaign_id: camp.campaign_id,

                customer_id: c.customer_id,

                cart_id: c.cart_id,

                channel,

                template_id: camp.template_id,

                message_id: `MSG-${c.cart_id}-LIVE`,

                attempted_at: attempted,

                send_status: 'sent',

                suppression_reason: 'none',

                idempotency_key: idempotencyKey,

                message_preview: preview
            };

            state.sends.push(send);

            // Record sent and delivered events.
            state.events.push(

                {
                    message_event_id: `ME-LIVE-${state.events.length + 1}-S`,

                    send_id: sendId,

                    event_type: 'sent',

                    event_at: attempted,

                    event_source: 'simulated_provider'
                },

                {
                    message_event_id: `ME-LIVE-${state.events.length + 2}-D`,

                    send_id: sendId,

                    event_type: 'delivered',

                    event_at: attempted,

                    event_source: 'simulated_provider'
                }
            );

            // Record cart activity.
            state.cartEvents.push({

                cart_event_id: `CE-LIVE-${state.cartEvents.length + 1}`,

                cart_id: c.cart_id,

                event_type: 'recovery_message_sent',

                event_at: attempted,

                old_status: statusOf(c),

                new_status: statusOf(c),

                details: ` ${channel} recovery message simulated under ${camp.campaign_id}`
            });

            invalidate();

            save();

            return json(res, {

                success: true,

                send,

                campaign: camp,

                message: 'Personalized recovery message simulated and recorded; no real email or SMS was sent.'
            });
        }


        // ==================================================
        // 13. RECORD MESSAGE OPEN AND CLICK EVENTS
        // ==================================================

        if (
            req.method === 'POST' &&
            u.pathname === '/api/recovery/event'
        ) {

            const b = await body(req);

            const send = all('sendattempt').find(
                s => s.send_id === b.send_id
            );

            if (!send) {

                return json(res, {
                    error: 'Send attempt not found'
                }, 404);
            }

            if (send.send_status !== 'sent') {

                return json(res, {
                    error: 'Suppressed attempts cannot receive delivery/open/click events'
                }, 409);
            }

            if (!['opened', 'clicked'].includes(b.event_type)) {

                return json(res, {
                    error: 'Event must be opened or clicked'
                }, 400);
            }

            const prior = all('messageevent').filter(
                e => e.send_id === send.send_id
            );

            // A message must be opened before clicking.
            if (
                b.event_type === 'clicked' &&
                !prior.some(e => e.event_type === 'opened')
            ) {

                return json(res, {
                    error: 'A message must be opened before it can be clicked'
                }, 409);
            }

            // Prevent duplicate events.
            if (
                prior.some(e => e.event_type === b.event_type)
            ) {

                return json(res, {
                    error: `${b.event_type} event already exists`
                }, 409);
            }

            const e = {

                message_event_id: `ME-LIVE-${state.events.length + 1}`,

                send_id: send.send_id,

                event_type: b.event_type,

                event_at: now(),

                event_source: 'dashboard_simulation'
            };

            state.events.push(e);

            invalidate();

            save();

            return json(res, {
                success: true,
                event: e
            });
        }


        // ==================================================
        // 14. SIMULATE PURCHASE AND ATTRIBUTION
        // ==================================================

        if (
            req.method === 'POST' &&
            u.pathname === '/api/orders'
        ) {

            const b = await body(req);

            const c = cartById(b.cart_id);

            if (!c) {

                return json(res, {
                    error: 'Cart not found'
                }, 404);
            }

            if (purchased(c.cart_id)) {

                return json(res, {
                    error: 'This cart already has a purchase'
                }, 409);
            }

            const previousCartStatus = statusOf(c);

            const at = now();

            const orderId = `ORD-LIVE-${String(
                state.orders.length + 1
            ).padStart(7, '0')}`;

            const total = money(c.cart_total);

            const order = {

                order_id: orderId,

                customer_id: c.customer_id,

                cart_id: c.cart_id,

                ordered_at: at,

                order_status: 'paid',

                subtotal: money(c.subtotal),

                tax_amount: money(c.tax_amount),

                order_total: total,

                currency: c.currency || 'USD',

                is_late_purchase: 0
            };

            // Save order and update cart status.
            state.orders.push(order);

            state.purchases[c.cart_id] = orderId;

            state.cartStatus[c.cart_id] = 'recovered';

            invalidate();

            state.cartEvents.push({

                cart_event_id: `CE-LIVE-${state.cartEvents.length + 1}`,

                cart_id: c.cart_id,

                event_type: 'purchase_completed',

                event_at: at,

                old_status: previousCartStatus,

                new_status: 'recovered',

                details: `Order ${orderId} created from dashboard simulation`
            });

            // Find successful campaign sends for this cart.
            const campSends = all('sendattempt').filter(
                s =>
                    s.cart_id === c.cart_id &&
                    s.send_status === 'sent'
            );

            // Find the latest campaign click.
            const clicks = all('messageevent')
                .filter(e =>
                    e.event_type === 'clicked' &&
                    campSends.some(s => s.send_id === e.send_id)
                )
                .sort((a, b) =>
                    new Date(b.event_at) - new Date(a.event_at)
                );

            let attributed = null;

            // Apply last-click attribution.
            if (clicks.length) {

                const click = clicks[0];

                const send = campSends.find(
                    s => s.send_id === click.send_id
                );

                const campaign = all('campaign').find(
                    x => x.campaign_id === send.campaign_id
                );

                const hours = Number(
                    campaign?.attribution_window_hours || 168
                );

                if (
                    new Date(at).getTime() -
                    new Date(click.event_at).getTime() <=
                    hours * 3600000
                ) {

                    const a = {

                        attribution_id: `ATT-LIVE-${String(
                            state.attributions.length + 1
                        ).padStart(6, '0')}`,

                        order_id: orderId,

                        send_id: send.send_id,

                        campaign_id: send.campaign_id,

                        attribution_model: 'last_click',

                        attributed_at: at,

                        attributed_revenue: total,

                        attribution_window_hours: hours,

                        is_primary: 1
                    };

                    state.attributions.push(a);

                    attributed = a;
                }
            }

            save();

            return json(res, {

                success: true,

                order,

                attribution: attributed,

                message: attributed
                    ? 'Purchase recorded and attributed to last eligible click.'
                    : 'Purchase recorded; no eligible campaign click was found, so it is unattributed.'
            });
        }


        // ==================================================
        // 15. EXPORT DATA AS CSV
        // ==================================================

        if (
            req.method === 'GET' &&
            u.pathname === '/api/export'
        ) {

            const name = (
                u.searchParams.get('table') || 'cart'
            ).toLowerCase();

            if (!names.includes(name)) {

                return json(res, {
                    error: 'Unknown table'
                }, 400);
            }

            const rows = all(name);

            res.writeHead(200, {

                'Content-Type': 'text/csv; charset=utf-8',

                'Content-Disposition':
                    `attachment; filename="${name}.csv"`
            });

            return res.end(toCsv(rows));
        }


        // ==================================================
        // 16. RESET DEMO DATA
        // ==================================================

        if (
            req.method === 'POST' &&
            u.pathname === '/api/reset-demo'
        ) {

            state = {

                consents: [],

                consentClosures: {},

                campaigns: [],

                sends: [],

                events: [],

                orders: [],

                attributions: [],

                cartEvents: [],

                cartStatus: {},

                purchases: {}
            };

            invalidate();

            save();

            return json(res, {

                success: true,

                message: 'Live demo activity reset. Original synthetic dataset preserved.'
            });
        }


        // ==================================================
        // 17. SERVE FRONTEND HTML, CSS AND JS FILES
        // ==================================================

        if (
            req.method === 'GET' &&
            (
                u.pathname === '/' ||
                u.pathname.startsWith('/public/')
            )
        ) {

            const rel = u.pathname === '/'
                ? 'index.html'
                : u.pathname.slice('/public/'.length);

            const file = path.resolve(PUBLIC, rel);

            // Prevent access outside public folder.
            if (
                !file.startsWith(PUBLIC + path.sep) &&
                file !== PUBLIC
            ) {

                return json(res, {
                    error: 'Not found'
                }, 404);
            }

            if (
                !fs.existsSync(file) ||
                !fs.statSync(file).isFile()
            ) {

                return json(res, {
                    error: 'Not found'
                }, 404);
            }

            const ext = path.extname(file);

            const types = {

                '.html': 'text/html; charset=utf-8',

                '.css': 'text/css; charset=utf-8',

                '.js': 'text/javascript; charset=utf-8'
            };

            res.writeHead(200, {
                'Content-Type':
                    types[ext] || 'application/octet-stream'
            });

            return fs.createReadStream(file).pipe(res);
        }


        // ==================================================
        // 18. UNKNOWN API ROUTE
        // ==================================================

        return json(res, {
            error: 'Route not found'
        }, 404);

    } catch (e) {

        console.error(e);

        return json(res, {
            error: e.message || 'Internal server error'
        }, 500);
    }
}


// ==================================================
// 19. START HTTP SERVER
// ==================================================

http.createServer(handler).listen(PORT, () => {

    console.log(
        `Recoverly full-stack app running at http://localhost:${PORT}\n` +
        `Dataset: ${base.cart.length.toLocaleString()} carts | ` +
        `persistent demo state: ${STATE_FILE}`
    );
});
