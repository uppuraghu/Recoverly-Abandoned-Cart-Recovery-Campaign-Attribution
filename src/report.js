
const fs = require('fs');
const path = require('path');

// 1. Set the input folder
const inputPath = process.argv.find(arg => arg.startsWith('--in='));

const root = path.resolve(
    inputPath ? inputPath.split('=')[1] : 'output'
);

// 2. Read JSON files
const readJson = (fileName) => {
    const filePath = path.join(root, 'data', `${fileName}.json`);

    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

// 3. Load dataset files
const carts = readJson('cart');
const sends = readJson('sendattempt');
const events = readJson('messageevent');
const orders = readJson('order');
const attributions = readJson('attribution');

const groundTruth = JSON.parse(
    fs.readFileSync(
        path.join(root, 'ground_truth.json'),
        'utf8'
    )
);

// 4. Separate sent and suppressed messages
const sentMessages = sends.filter(
    item => item.send_status === 'sent'
);

const suppressedMessages = sends.filter(
    item => item.send_status === 'suppressed'
);

// 5. Identify delivery, open, and click events
const deliveredMessages = new Set(
    events
        .filter(item => item.event_type === 'delivered')
        .map(item => item.send_id)
);

const openedMessages = new Set(
    events
        .filter(item => item.event_type === 'opened')
        .map(item => item.send_id)
);

const clickedMessages = new Set(
    events
        .filter(item => item.event_type === 'clicked')
        .map(item => item.send_id)
);

// 6. Calculate attribution metrics
const primaryAttributions = attributions.filter(
    item => item.is_primary === 1
);

const attributedOrderIds = new Set(
    primaryAttributions.map(item => item.order_id)
);

const attributedRevenue = primaryAttributions.reduce(
    (total, item) => total + item.attributed_revenue,
    0
);

// 7. Generate KPI report
const report = {
    generated_for: 'synthetic abandoned cart recovery dataset',

    seed: JSON.parse(
        fs.readFileSync(
            path.join(root, 'manifest.json'),
            'utf8'
        )
    ).seed,

    metrics: {
        cart_count: carts.length,

        abandoned_timestamp_count: carts.filter(
            item => item.abandoned_at
        ).length,

        orders: orders.length,

        send_attempts: sends.length,

        sent: sentMessages.length,

        suppressed: suppressedMessages.length,

        delivery_rate: sentMessages.length
            ? deliveredMessages.size / sentMessages.length
            : 0,

        open_rate: deliveredMessages.size
            ? openedMessages.size / deliveredMessages.size
            : 0,

        click_through_rate: deliveredMessages.size
            ? clickedMessages.size / deliveredMessages.size
            : 0,

        attributed_orders: attributedOrderIds.size,

        attributed_revenue: Math.round(
            attributedRevenue * 100
        ) / 100,

        attribution_rate: orders.length
            ? attributedOrderIds.size / orders.length
            : 0,

        ground_truth_anomalies: groundTruth.length
    },

    // 8. Count suppression reasons
    suppression_reasons: suppressedMessages.reduce(
        (result, item) => {
            const reason = item.suppression_reason;

            result[reason] = (result[reason] || 0) + 1;

            return result;
        },
        {}
    )
};

// 9. Save KPI report as JSON
const outputFile = path.join(root, 'kpi_report.json');

fs.writeFileSync(
    outputFile,
    JSON.stringify(report, null, 2) + '\n'
);

// 10. Display report in the terminal
console.log(JSON.stringify(report, null, 2));
