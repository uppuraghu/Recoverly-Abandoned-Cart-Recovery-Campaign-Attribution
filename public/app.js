
const $ = s => document.querySelector(s),
    $$ = s => [...document.querySelectorAll(s)];

const money = n => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
}).format(Number(n || 0));

const num = n => new Intl.NumberFormat('en-US').format(Number(n || 0));

const pct = n => `${(Number(n || 0) * 100).toFixed(1)}%`;

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[c]));

const dt = v => v ? new Date(v).toLocaleString() : '—';

let cartPage = 1,
    cartTotal = 0,
    selectedCart = null,
    summaryData = null;

async function api(url, opts = {}) {
    const r = await fetch(url, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            ...(opts.headers || {})
        }
    });

    let d;

    try {
        d = await r.json();
    } catch {
        throw new Error('Server returned an unreadable response');
    }

    if (!r.ok)
        throw new Error(d.error || `Request failed (${r.status})`);

    return d;
}

function toast(message, error = false) {
    const t = $('#toast');
    t.textContent = message;
    t.className = 'toast' + (error ? ' error' : '');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.add('hidden'), 4200);
}

function setApi(online) {
    $('#apiLabel').textContent = online ? 'API connected' : 'API unavailable';
    $('.api-status').classList.toggle('online', online);
}

const titles = {
    overview: ['Overview', 'Monitor recovery performance and take action on abandoned carts.'],
    carts: ['Cart recovery', 'Inspect cart state, consent eligibility and recovery actions.'],
    campaigns: ['Campaigns', 'Create and measure personalized recovery campaigns.'],
    customers: ['Customers & consent', 'Manage channel preferences and maintain consent history.'],
    activity: ['Event activity', 'Review append-only recovery and cart lifecycle events.'],
    quality: ['Data quality', 'Inspect labelled exceptions and validation evidence.'],
    exports: ['Data exports', 'Download generated source tables for further analysis.']
};

function showView(name) {
    $$('.view').forEach(x => x.classList.toggle('active', x.id === `view-${name}`));

    $$('.nav-link').forEach(x => x.classList.toggle('active', x.dataset.view === name));

    $('#pageTitle').textContent = titles[name][0];
    $('#pageSubtitle').textContent = titles[name][1];

    if (name === 'carts') loadCarts();
    if (name === 'campaigns') loadCampaigns();
    if (name === 'customers') loadCustomers();
    if (name === 'activity') loadActivity();
    if (name === 'quality') loadQuality();
    if (name === 'exports') loadExports();
}

$$('.nav-link').forEach(b =>
    b.addEventListener('click', () => showView(b.dataset.view))
);

$$('[data-goto]').forEach(b =>
    b.addEventListener('click', () => showView(b.dataset.goto))
);

function kpi(label, value, foot, icon) {
    return `<article class="kpi">
        <div class="kpi-label">
            <span>${label}</span>
            <span class="kpi-icon">${icon}</span>
        </div>
        <div class="kpi-value">${value}</div>
        <div class="kpi-foot">${foot}</div>
    </article>`;
}

async function loadOverview() {
    try {
        const d = await api('/api/summary');
        summaryData = d;
        setApi(true);

        const m = d.metrics;

        $('#kpis').innerHTML = [
            kpi('Total carts', num(m.cart_count), 'All generated shopping carts', '▣'),
            kpi('Abandoned carts', num(m.abandoned_timestamp_count),
                `${pct(m.abandoned_timestamp_count / m.cart_count)} lifetime abandonment rate`, '◷'),
            kpi('Messages sent', num(m.sent), `${num(m.suppressed)} blocked by policy`, '✉'),
            kpi('Attributed revenue', money(m.attributed_revenue),
                `${num(m.attributed_orders)} attributed orders`, '＄')
        ].join('');

        const funnel = [
            ['Cart created', m.cart_count],
            ['Abandoned timestamp', m.abandoned_timestamp_count],
            ['Messages sent', m.sent],
            ['Attributed orders', m.attributed_orders]
        ];

        $('#funnel').innerHTML = funnel.map(([l, v]) =>
            `<div class="funnel-row">
                <span>${l}</span>
                <div class="funnel-track">
                    <div class="funnel-bar" style="width:${Math.max(.5, v / Math.max(1, m.cart_count) * 100)}%"></div>
                </div>
                <span class="funnel-value">${num(v)}</span>
            </div>`
        ).join('');

        const eng = [
            ['Delivered', m.delivery_rate],
            ['Opened', m.open_rate],
            ['Clicked', m.click_through_rate],
            ['Attribution', m.sent ? m.attributed_orders / m.sent : 0]
        ];

        $('#engagement').innerHTML = eng.map(([l, v]) =>
            `<div class="engage-row">
                <span>${l}</span>
                <div class="engage-track">
                    <div class="engage-fill" style="width:${Math.min(100, Math.max(0, v * 100))}%"></div>
                </div>
                <b>${pct(v)}</b>
            </div>`
        ).join('');

        $('#channelStats').innerHTML = `
            <span class="channel-chip">Email sent <b>${num(d.byChannel.email || 0)}</b></span>
            <span class="channel-chip">SMS sent <b>${num(d.byChannel.sms || 0)}</b></span>
        `;

        const status = d.statusCounts || {};

        $('#lifecycle').innerHTML = ['abandoned', 'active', 'recovered', 'converted'].map(s =>
            `<div class="life-item">
                <b>${num(status[s] || 0)}</b>
                <span>${s[0].toUpperCase() + s.slice(1)}</span>
            </div>`
        ).join('');

        $('#suppression').innerHTML = Object.entries(d.suppression_reasons || {})
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) =>
                `<div class="suppression-row">
                    <span class="suppression-dot"></span>
                    <span>${esc(k.replaceAll('_', ' '))}</span>
                    <b>${num(v)}</b>
                </div>`
            ).join('') || '<div class="empty">No suppressions recorded.</div>';

    } catch (e) {
        setApi(false);
        toast(e.message, true);
    }
}

async function loadCarts() {
    try {
        const q = encodeURIComponent($('#cartSearch').value.trim());
        const status = $('#cartStatus').value;
        const channel = $('#cartEligible').value;

        const d = await api(`/api/carts?q=${q}&status=${status}&channel=${channel}&page=${cartPage}&limit=25`);

        cartTotal = d.total;

        $('#cartTable').innerHTML = d.rows.map(c =>
            `<tr>
                <td>
                    <span class="cell-primary">${esc(c.cart_id)}</span>
                    <span class="cell-sub">${esc(c.customer_id)} · ${esc(c.email)}</span>
                </td>
                <td><span class="status ${esc(c.status)}">${esc(c.status)}</span></td>
                <td>
                    ${dt(c.last_activity_at)}
                    <span class="cell-sub">Abandoned: ${dt(c.abandoned_at)}</span>
                </td>
                <td class="cell-primary">${money(c.cart_total)}</td>
                <td>
                    <span class="status ${c.email_consent === 'opt_in' ? 'opt_in' : 'opt_out'}">E: ${esc(c.email_consent)}</span>
                    <span class="status ${c.sms_consent === 'opt_in' ? 'opt_in' : 'opt_out'}">S: ${esc(c.sms_consent)}</span>
                </td>
                <td><button class="action-link" data-cart="${esc(c.cart_id)}">Inspect →</button></td>
            </tr>`
        ).join('') || '<tr><td colspan="6" class="empty">No matching carts. Try another filter.</td></tr>';

        $('#cartMeta').textContent =
            `Showing ${d.rows.length ? ((cartPage - 1) * 25 + 1) : 0}–${Math.min(cartPage * 25, d.total)} of ${num(d.total)} carts`;

        $('#prevPage').disabled = cartPage <= 1;
        $('#nextPage').disabled = cartPage * 25 >= d.total;

        $$('[data-cart]').forEach(b =>
            b.addEventListener('click', () => openCart(b.dataset.cart))
        );

    } catch (e) {
        toast(e.message, true);
    }
}

async function openCart(id) {
    try {
        const c = await api('/api/carts/' + encodeURIComponent(id));

        selectedCart = c;

        $('#modalTitle').textContent = 'Cart ' + c.cart_id;

        const lines = c.lines.map(x =>
            `<tr>
                <td>${esc(x.product_name || x.product_id || 'Product')}</td>
                <td>${esc(x.quantity)}</td>
                <td>${money(x.unit_price)}</td>
                <td>${money(x.line_total)}</td>
            </tr>`
        ).join('');

        const eligibility = ['email', 'sms'].map(ch =>
            `<div class="decision ${c.eligibility[ch].ok ? 'ok' : 'no'}">
                <strong>${ch.toUpperCase()} · ${c.eligibility[ch].ok ? 'Eligible' : 'Blocked'}</strong>
                ${esc(c.eligibility[ch].reason.replaceAll('_', ' '))}
            </div>`
        ).join('');

        const sends = c.sends.map(s => {
            const ev = c.messageEvents.filter(e => e.send_id === s.send_id).map(e => e.event_type);
            const opened = ev.includes('opened');
            const clicked = ev.includes('clicked');

            return `<div class="decision">
                <strong>${esc(s.send_id)} · ${esc(s.send_status)}</strong>
                ${esc(s.channel)} · ${dt(s.attempted_at)}<br>
                <small>${esc(s.campaign_id)} · Events: ${esc(ev.join(', ') || 'none')}</small>
                ${s.message_preview ? `<p class="cell-sub">
                    <b>Personalized preview:</b>
                    ${esc(s.message_preview.subject)} ${esc(s.message_preview.body)}
                </p>` : ''}
                <div class="action-row">
                    ${s.send_status === 'sent' && !opened ?
                        `<button class="btn btn-small" data-message-event="opened" data-send="${esc(s.send_id)}">Simulate open</button>` : ''}
                    ${s.send_status === 'sent' && opened && !clicked ?
                        `<button class="btn btn-small" data-message-event="clicked" data-send="${esc(s.send_id)}">Simulate click</button>` : ''}
                </div>
            </div>`;
        }).join('') || '<p class="cell-sub">No recovery attempts for this cart yet.</p>';

        $('#modalBody').innerHTML = `
            <div class="detail-grid">
                <div class="detail-item"><small>Customer</small><b>${esc(c.customer_id)}</b></div>
                <div class="detail-item"><small>Cart status</small><b>${esc(c.status)}</b></div>
                <div class="detail-item"><small>Cart total</small><b>${money(c.cart_total)}</b></div>
                <div class="detail-item"><small>Last activity</small><b>${dt(c.last_activity_at)}</b></div>
            </div>

            <h3 class="modal-section-title">Cart lines</h3>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr><th>ITEM</th><th>QTY</th><th>UNIT PRICE</th><th>TOTAL</th></tr>
                    </thead>
                    <tbody>${lines || '<tr><td colspan="4">No lines</td></tr>'}</tbody>
                </table>
            </div>

            <h3 class="modal-section-title">Recovery eligibility</h3>
            ${eligibility}

            <div class="action-row">
                <button class="btn btn-primary" id="sendEmail">${c.eligibility.email.ok ? 'Send email recovery' : 'Record email suppression'}</button>
                <button class="btn btn-primary" id="sendSms">${c.eligibility.sms.ok ? 'Send SMS recovery' : 'Record SMS suppression'}</button>
            </div>

            <h3 class="modal-section-title">Purchase simulation</h3>
            <p class="cell-sub">Record a test purchase for this cart. If a qualifying campaign click exists, last-click attribution is recorded.</p>
            <button class="btn" id="purchaseBtn" ${c.purchased ? 'disabled' : ''}>＋ Simulate purchase</button>

            <h3 class="modal-section-title">Recovery attempts</h3>
            ${sends}
        `;

        $('#sendEmail').addEventListener('click', () => sendRecovery(id, 'email'));
        $('#sendSms').addEventListener('click', () => sendRecovery(id, 'sms'));
        $('#purchaseBtn').addEventListener('click', () => simulatePurchase(id));

        $$('[data-message-event]').forEach(b =>
            b.addEventListener('click', () =>
                simulateMessageEvent(b.dataset.send, b.dataset.messageEvent, id)
            )
        );

        showModal();

    } catch (e) {
        toast(e.message, true);
    }
}

async function sendRecovery(cartId, channel) {
    try {
        const r = await api('/api/recovery/send', {
            method: 'POST',
            body: JSON.stringify({ cart_id: cartId, channel })
        });

        toast(r.message, !r.success);

        await Promise.all([loadOverview(), loadCarts()]);
        await openCart(cartId);

    } catch (e) {
        toast(e.message, true);
    }
}

async function simulateMessageEvent(sendId, eventType, cartId) {
    try {
        const r = await api('/api/recovery/event', {
            method: 'POST',
            body: JSON.stringify({ send_id: sendId, event_type: eventType })
        });

        toast(`${eventType} event recorded`);

        await loadOverview();
        await openCart(cartId);

    } catch (e) {
        toast(e.message, true);
    }
}

async function simulatePurchase(cartId) {
    if (!confirm('Create a synthetic paid order for this cart?')) return;

    try {
        const r = await api('/api/orders', {
            method: 'POST',
            body: JSON.stringify({ cart_id: cartId })
        });

        toast(r.message);

        await Promise.all([loadOverview(), loadCarts()]);
        await openCart(cartId);

    } catch (e) {
        toast(e.message, true);
    }
}

function showModal() {
    $('#modalBackdrop').classList.remove('hidden');
}

function closeModal() {
    $('#modalBackdrop').classList.add('hidden');
}

$('#modalClose').addEventListener('click', closeModal);

$('#modalBackdrop').addEventListener('click', e => {
    if (e.target === $('#modalBackdrop')) closeModal();
});

async function loadCampaigns() {
    try {
        const d = await api('/api/campaigns');
        const all = d.rows;

        const total = summaryData?.metrics || (await api('/api/summary')).metrics;

        $('#campaignKpis').innerHTML = [
            kpi('Campaign records', num(d.total), 'Generated and live campaigns', '▤'),
            kpi('Messages sent', num(total.sent), 'Consent-compliant sends plus seed history', '✉'),
            kpi('Attributed revenue', money(total.attributed_revenue), 'Primary last-click attribution', '＄')
        ].join('');

        $('#campaignTable').innerHTML = all.map(c => {
            const p = summaryData?.campaignPerformance?.find(x => x.campaign_id === c.campaign_id) || {};

            return `<tr>
                <td>
                    <span class="cell-primary">${esc(c.campaign_name)}</span>
                    <span class="cell-sub">${esc(c.campaign_id)}</span>
                </td>
                <td>${esc(c.channel)}</td>
                <td>${esc(c.variant)}</td>
                <td><span class="status active">${esc(c.campaign_state)}</span></td>
                <td>${num(p.sent || 0)}</td>
                <td>${num(p.opens || 0)}</td>
                <td>${num(p.clicks || 0)}</td>
                <td>${num(p.conversions || 0)}</td>
            </tr>`;
        }).join('') || '<tr><td colspan="8" class="empty">No campaigns available.</td></tr>';

    } catch (e) {
        toast(e.message, true);
    }
}

function campaignModal() {
    $('#modalTitle').textContent = 'Create recovery campaign';

    $('#modalBody').innerHTML = `
        <form id="campaignForm">
            <div class="form-grid">
                <div class="field full">
                    <label>Campaign name</label>
                    <input name="campaign_name" required placeholder="e.g. Weekend cart recovery" maxlength="100">
                </div>

                <div class="field">
                    <label>Channel</label>
                    <select name="channel">
                        <option value="email">Email</option>
                        <option value="sms">SMS</option>
                    </select>
                </div>

                <div class="field">
                    <label>Variant</label>
                    <select name="variant">
                        <option value="personalized_reminder">Personalized reminder</option>
                        <option value="product_recommendation">Product recommendation</option>
                        <option value="limited_time_offer">Limited-time offer</option>
                    </select>
                </div>

                <div class="field">
                    <label>Attribution window (hours)</label>
                    <input name="attribution_window_hours" type="number" min="1" max="720" value="168">
                </div>

                <div class="field">
                    <label>Frequency cap / 7 days</label>
                    <input name="frequency_cap" type="number" min="1" max="10" value="2">
                </div>
            </div>

            <p class="cell-sub">
                Campaign creation does not send messages. Every send is checked against active consent, cart state and frequency caps.
            </p>

            <div class="modal-actions">
                <button type="button" class="btn" id="cancelCampaign">Cancel</button>
                <button class="btn btn-primary" type="submit">Create campaign</button>
            </div>
        </form>
    `;

    showModal();

    $('#cancelCampaign').onclick = closeModal;

    $('#campaignForm').onsubmit = async e => {
        e.preventDefault();

        const f = new FormData(e.target);
        const b = Object.fromEntries(f.entries());

        try {
            const r = await api('/api/campaigns', {
                method: 'POST',
                body: JSON.stringify(b)
            });

            toast(`Campaign ${r.campaign.campaign_id} created`);

            closeModal();
            await loadCampaigns();

        } catch (err) {
            toast(err.message, true);
        }
    };
}

$('#newCampaignBtn').addEventListener('click', campaignModal);

async function loadCustomers() {
    try {
        const q = encodeURIComponent($('#customerSearch').value.trim());
        const d = await api('/api/customers?q=' + q + '&limit=40');

        $('#customerTable').innerHTML = d.rows.map(c =>
            `<tr>
                <td>
                    <span class="cell-primary">${esc(c.customer_id)}</span>
                    <span class="cell-sub">${esc(c.email)}</span>
                </td>
                <td>${esc(c.segment)}</td>
                <td>${esc(c.lifecycle_state)}</td>
                <td>
                    <span class="status ${c.email_consent === 'opt_in' ? 'opt_in' : 'opt_out'}">
                        ${esc(c.email_consent)}
                    </span>
                </td>
                <td>
                    <span class="status ${c.sms_consent === 'opt_in' ? 'opt_in' : 'opt_out'}">
                        ${esc(c.sms_consent)}
                    </span>
                </td>
                <td>
                    <button class="action-link" data-consent="${esc(c.customer_id)}">Manage consent →</button>
                </td>
            </tr>`
        ).join('') || '<tr><td colspan="6" class="empty">No customers found.</td></tr>';

        $$('[data-consent]').forEach(b =>
            b.addEventListener('click', () => consentModal(b.dataset.consent))
        );

    } catch (e) {
        toast(e.message, true);
    }
}

function consentModal(customerId) {
    $('#modalTitle').textContent = 'Manage contact consent';

    $('#modalBody').innerHTML = `
        <p class="cell-sub">
            Customer ${esc(customerId)}. Changes are appended as new effective-dated consent records; historical records are retained.
        </p>

        <form id="consentForm">
            <input type="hidden" name="customer_id" value="${esc(customerId)}">

            <div class="form-grid">
                <div class="field">
                    <label>Channel</label>
                    <select name="channel">
                        <option value="email">Email</option>
                        <option value="sms">SMS</option>
                    </select>
                </div>

                <div class="field">
                    <label>New preference</label>
                    <select name="status">
                        <option value="opt_in">Opt in</option>
                        <option value="opt_out">Opt out</option>
                    </select>
                </div>
            </div>

            <div class="modal-actions">
                <button type="button" class="btn" id="cancelConsent">Cancel</button>
                <button type="submit" class="btn btn-primary">Save consent change</button>
            </div>
        </form>
    `;

    showModal();

    $('#cancelConsent').onclick = closeModal;

    $('#consentForm').onsubmit = async e => {
        e.preventDefault();

        const b = Object.fromEntries(new FormData(e.target).entries());

        try {
            const r = await api('/api/consent', {
                method: 'POST',
                body: JSON.stringify(b)
            });

            toast(r.message);
            closeModal();
            loadCustomers();

        } catch (err) {
            toast(err.message, true);
        }
    };
}

async function loadActivity() {
    try {
        const d = await api('/api/activity');

        $('#activityTable').innerHTML = d.rows.map(e =>
            `<tr>
                <td>${dt(e.event_at)}</td>
                <td><span class="status">${esc(e.record_type)}</span></td>
                <td class="cell-primary">${esc(e.event_type)}</td>
                <td>${esc(e.send_id || e.cart_id || '—')}</td>
                <td>${esc(e.event_source || e.details || 'dashboard')}</td>
            </tr>`
        ).join('') || '<tr><td colspan="5" class="empty">No dashboard events yet. Send a test recovery message to create activity.</td></tr>';

    } catch (e) {
        toast(e.message, true);
    }
}

async function loadQuality() {
    try {
        const [a, v, s] = await Promise.all([
            api('/api/anomalies'),
            api('/api/summary'),
            api('/api/health')
        ]);

        $('#qualitySummary').innerHTML = `
            <div class="quality-box"><b>${num(v.metrics.cart_count)}</b><span>Source carts</span></div>
            <div class="quality-box"><b>4</b><span>Ground-truth anomalies</span></div>
            <div class="quality-box"><b>${s.state_persisted ? 'ACTIVE' : 'READY'}</b><span>Runtime state persistence</span></div>
        `;

        const labels = {
            message_sent_after_opt_out: 'Message sent after opt-out',
            cart_abandoned_after_purchase: 'Cart abandoned after purchase',
            attribution_double_counted_across_campaigns: 'Attribution double-counted across campaigns',
            cart_total_stale_after_quantity_update: 'Stale cart total after quantity update'
        };

        $('#anomalyCards').innerHTML = a.map((x, i) =>
            `<article class="anomaly">
                <div class="issue">LABELLED EXCEPTION 0${i + 1} · ${esc(x.issue_type)}</div>
                <h4>${esc(labels[x.issue_type] || x.issue_type)}</h4>
                <p>${esc(x.description || x.expected_decision || 'Deliberate test case stored separately from input features.')}</p>
            </article>`
        ).join('');

    } catch (e) {
        toast(e.message, true);
    }
}

const exportTables = [
    ['customer', 'Customers', 'Customer master records'],
    ['consent', 'Consent history', 'Channel permissions and effective dates'],
    ['session', 'Sessions', 'Customer browsing sessions'],
    ['cart', 'Carts', 'Cart lifecycle and totals'],
    ['cartline', 'Cart lines', 'Items, quantities and line totals'],
    ['campaign', 'Campaigns', 'Recovery campaign definitions'],
    ['messagetemplate', 'Message templates', 'Personalized message templates'],
    ['sendattempt', 'Send attempts', 'Sent and suppressed attempts'],
    ['messageevent', 'Message events', 'Delivery, open and click events'],
    ['order', 'Orders', 'Purchases and revenue'],
    ['attribution', 'Attribution', 'Campaign conversion attribution'],
    ['cartevent', 'Cart events', 'Append-only cart lifecycle events']
];

function loadExports() {
    $('#exportGrid').innerHTML = exportTables.map(([id, label, desc]) =>
        `<article class="export-card">
            <div class="export-icon">⇩</div>
            <div>
                <b>${label}</b>
                <small>${desc}</small>
            </div>
            <button class="action-link" onclick="exportTable('${id}')">CSV ↓</button>
        </article>`
    ).join('');
}

window.exportTable = name => {
    window.location.href = '/api/export?table=' + encodeURIComponent(name);
};

$('#refreshBtn').onclick = async () => {
    await loadOverview();

    const active = $('.view.active')?.id.replace('view-', '');

    if (active && active !== 'overview') showView(active);

    toast('Workspace data refreshed');
};

$('#cartSearchBtn').onclick = () => {
    cartPage = 1;
    loadCarts();
};

$('#cartSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        cartPage = 1;
        loadCarts();
    }
});

$('#cartStatus').onchange = () => {
    cartPage = 1;
    loadCarts();
};

$('#cartEligible').onchange = () => {
    cartPage = 1;
    loadCarts();
};

$('#prevPage').onclick = () => {
    if (cartPage > 1) {
        cartPage--;
        loadCarts();
    }
};

$('#nextPage').onclick = () => {
    if (cartPage * 25 < cartTotal) {
        cartPage++;
        loadCarts();
    }
};

$('#customerSearchBtn').onclick = loadCustomers;

$('#customerSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') loadCustomers();
});

$('#activityRefresh').onclick = loadActivity;

setInterval(() => {
    loadOverview();

    const active = $('.view.active')?.id.replace('view-', '');

    if (active === 'carts') loadCarts();
    if (active === 'campaigns') loadCampaigns();
    if (active === 'activity') loadActivity();

}, 15000);

(async () => {
    try {
        await api('/api/health');
        setApi(true);
        await loadOverview();

    } catch (e) {
        setApi(false);
        toast('Could not connect to local API. Start the app using npm start.', true);
    }
})();
