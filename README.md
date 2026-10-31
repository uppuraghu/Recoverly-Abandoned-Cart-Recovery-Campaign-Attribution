<<<<<<< HEAD
# Recoverly-Abandoned-Cart-Recovery-Campaign-Attribution
A full-stack JavaScript project that simulates an e-commerce abandoned cart recovery workflow using 50,000 synthetic shopping carts.  Recoverly identifies abandoned carts, checks customer communication consent, simulates recovery campaigns, tracks customer interactions, and attributes qualifying purchases to campaigns.  
=======
# Recoverly – Abandoned Cart Recovery & Campaign Attribution

A full-stack JavaScript project that simulates an e-commerce abandoned cart recovery workflow using 50,000 synthetic shopping carts.

Recoverly identifies abandoned carts, checks customer communication consent, simulates recovery campaigns, tracks customer interactions, and attributes qualifying purchases to campaigns.

The project includes a deterministic data generator, validation scripts, a Node.js API, and an interactive operations dashboard.

---

## 1. Make It Run

### Requirements

- Node.js 18 or later
- npm
- VS Code or another code editor
- Windows, macOS, or Linux

No third-party npm packages or external services are required.

### Installation and Setup

1. Clone or download this repository.
2. Open the `abandoned-cart-recovery` folder in VS Code.
3. Open the terminal.
4. Install dependencies:

```bash
npm install
```

5. Start the application:

```bash
npm start
```

6. Open the dashboard:

http://localhost:3000

Keep the terminal running while using the application.

To stop the server, press `Ctrl + C`.

**If port 3000 is already in use:**

Windows PowerShell:

```powershell
$env:PORT=3001
npm start
```

Windows Command Prompt:

```cmd
set PORT=3001 && npm start
```

Then open http://localhost:3001.

### Generate and Verify Data

Run the following commands to generate and verify the synthetic dataset:

```bash
npm run all
npm run validate
npm run report
npm run reproduce
```

| Command | Purpose |
|---|---|
| `npm run all` | Generate data, validate it and produce reports |
| `npm run validate` | Execute data-quality checks |
| `npm run report` | Generate KPI reports |
| `npm run reproduce` | Compare independent generated outputs |
| `npm run reset-demo` | Clear interactive demo state |

The fixed random seed is `20261022`.

**Important:** `npm run all` regenerates baseline data. Run it before a clean assessment demonstration if you want to start with a fresh dataset.

To clear only interactive dashboard actions:

```bash
npm run reset-demo
```

This removes `output/runtime_state.json` and preserves the generated baseline data.

---

## 2. What the Application Does

### Overview Dashboard

Displays:

- Total carts and abandoned carts
- Total orders
- Recovery funnel
- Delivery, open and click-through rates
- Channel distribution
- Cart lifecycle metrics
- Suppression reasons
- Attributed revenue

### Cart Recovery

- Search and filter 50,000 shopping carts.
- Inspect cart items and customer information.
- View customer communication consent.
- Check recovery eligibility.
- Understand why a recovery attempt is allowed or suppressed.

### Campaign Management

- Create email and SMS campaign variants.
- Configure attribution windows.
- Configure frequency caps.
- Inspect campaign performance.

### Customers and Consent

- Search customer records.
- Inspect communication preferences.
- Append effective-dated opt-in and opt-out changes.
- Retain previous consent records.

### Recovery Simulation

The application allows a simulated recovery message only when:

1. The cart is abandoned.
2. The customer has active consent for the selected channel.
3. The cart has not already been purchased.
4. The campaign frequency cap is respected.
5. The campaign and channel match.

It also supports simulated message opening, clicking and purchasing.

### Campaign Attribution

Uses last-click attribution.

A purchase is attributed to the latest qualifying campaign click within the campaign's configured attribution window, provided the customer and cart match.

Purchases without a qualifying click remain unattributed.

### Event Activity and Data Quality

- Inspect message and cart events.
- Review four labelled ground-truth anomaly cases.
- Export source tables and runtime activity as CSV files.

**Note:** Email and SMS delivery, opens and clicks are simulated. No real messages are sent.

---

## 3. Recommended Demonstration Workflow

Use the following steps during the assessment:

1. Open **Cart Recovery**.
2. Filter the carts by `Abandoned`.
3. Select a cart and inspect its customer, items and eligibility.
4. Open **Campaigns** and create an email campaign if required.
5. Configure a 168-hour attribution window and frequency cap of 2.
6. Return to the eligible cart and select **Send Email Recovery**.
7. Simulate an open event.
8. Simulate a click event.
9. Simulate a purchase.
10. Open Overview and Campaigns to inspect updated metrics.
11. Check Event Activity for the recorded events.
12. Open Customers & Consent, opt a customer out, and verify that recovery sending is blocked.

---

## 4. Show Your Work – GitHub Repository

This project is maintained as a public GitHub repository.

The repository contains:

- Executable source code
- Data-generation and validation scripts
- Dashboard and API implementation
- Documentation
- Generated reports and validation results

### Suggested Commit Organization

Use meaningful commits that describe actual development changes.

Examples:

```text
Initialize project structure
Implement synthetic data generation
Add entity relationships and validation
Implement recovery eligibility rules
Add campaign attribution logic
Build operations dashboard
Add KPI reporting and reproducibility checks
Document architecture and AI usage
```

Commits should reflect the actual development history. Do not create artificial historical commits.

---

## 5. Use LLMs Transparently – AI Usage

ChatGPT was used as a development assistant during selected technical challenges.

AI assistance was particularly useful for:

- Understanding parent-child entity relationships during large-scale data generation.
- Understanding deterministic random generation and reproducibility.
- Designing consent-based recovery eligibility and suppression rules.
- Understanding last-click campaign attribution and validation scenarios.

I reviewed relevant suggestions, integrated applicable changes, and tested the implementation through project execution and validation.

The following supporting document records the critical AI-assisted development challenges:

**`AI_USAGE.md`**

It includes representative prompts, how AI helped, and what I personally reviewed or tested.

The prompts are documented examples of the development challenges, not claimed as verbatim historical transcripts.

---

## 6. Make Your Reasoning Visible – Design Decisions

### Data Generation Strategy

The project uses synthetic data instead of real customer information.

Records are generated in dependency order:

1. Customer
2. Consent
3. Session
4. Cart
5. CartLine
6. Campaign and MessageTemplate
7. SendAttempt
8. MessageEvent
9. Order
10. Attribution

Parent records are generated before dependent records to maintain valid relationships.

### Primary Keys and Foreign Keys

Each entity has unique identifiers.

Foreign keys connect related records, such as customers with carts, sessions, consent records and orders.

### Cart Abandonment

A cart is considered abandoned after 60 minutes of inactivity, subject to the project's lifecycle rules.

A cart with a completed purchase should not be treated as an eligible abandoned cart.

### Consent and Frequency Caps

Communication eligibility is checked using channel-specific consent and campaign frequency limits.

This prevents recovery messages from being sent to customers without valid permission or beyond configured limits.

### Campaign Attribution

Attribution uses the latest qualifying campaign click within the configured attribution window.

The customer and cart must match the purchase.

### Reproducibility

A fixed seed of `20261022` is used for deterministic synthetic data generation.

The reproducibility script compares two independent generated outputs.

### Data Validation

The validation process checks:

- Primary key uniqueness
- Foreign key integrity
- Missing references
- Allowed values
- Date consistency
- Cart and order calculations
- Lifecycle consistency
- Duplicate attribution records
- Expected anomaly cases

### Ground-Truth Anomalies

Four deliberate data-quality anomalies are included:

1. A message sent after customer opt-out.
2. A cart marked abandoned despite a completed purchase.
3. Duplicate campaign attribution for an order.
4. A stale cart total after cart-line changes.

These cases are separately labelled for validation and assessment.

---

## 7. Project Structure

```text
abandoned-cart-recovery/
│
├── src/
│   ├── generate.js
│   ├── validate.js
│   ├── report.js
│   ├── reproduce.js
│   ├── server.js
│   └── reset-demo.js
│
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
│
├── docs/
│   └── data_dictionary.md
│
├── output/
│   ├── data/
│   ├── ground_truth.csv
│   ├── ground_truth.json
│   ├── seed.sql
│   ├── kpi_report.json
│   ├── validation_summary.json
│   └── manifest.json
│
├── AI_USAGE.md
├── DESIGN_DECISIONS.md
├── README.md
└── package.json
```

---

## 8. API Overview

### GET Endpoints

```text
GET /api/health
GET /api/summary
GET /api/carts
GET /api/carts/:cartId
GET /api/customers
GET /api/campaigns
GET /api/anomalies
GET /api/activity
GET /api/export?table=cart
```

### POST Endpoints

```text
POST /api/campaigns
POST /api/consent
POST /api/recovery/send
POST /api/recovery/event
POST /api/orders
POST /api/reset-demo
```

---

## 9. Data Generation Results

The generated synthetic dataset contains:

| Entity | Records |
|---|---:|
| Customers | 31,000 |
| Consents | 62,592 |
| Sessions | 50,000 |
| Carts | 50,000 |
| Cart Lines | 124,618 |
| Campaigns | 10,000 |
| Message Templates | 20 |
| Send Attempts | 10,000 |
| Message Events | 2,351 |
| Orders | 29,859 |

### Validation Results

- Validation checks: 1,455,162
- Unexpected issues: 0
- Ground-truth anomaly cases: 4
- Reproducibility: Passed
- Generated files compared: 28

These results correspond to the recorded execution of the project with seed `20261022`.

---

## 10. Limitations and Future Improvements

This is a local demonstration project, not a production messaging platform.

Current limitations:

- Synthetic customer and transaction data only.
- Email and SMS delivery are simulated.
- Runtime actions are stored locally in `output/runtime_state.json`.
- No production multi-user database or authentication.

Possible future improvements:

- Integrate a transactional database.
- Add authentication and authorization.
- Connect real email and SMS providers.
- Process provider webhooks.
- Implement rate limiting and secrets management.
- Strengthen production-grade consent and audit controls.

---

## 11. Synthetic Data and Privacy

All customer records and contact details are synthetic.

- Email addresses use the reserved `example.test` domain.
- No confidential customer information is imported.
- No real customer messages are sent.
- Generated data is used exclusively to demonstrate and test the application.

---

## 12. Project Objective

The objective of Recoverly is to demonstrate how an e-commerce business can identify abandoned carts, respect customer communication preferences, simulate targeted recovery campaigns, and measure campaign-driven purchases.

The project demonstrates practical implementation of synthetic data generation, entity relationships, JavaScript business logic, API development, validation, reproducibility, and campaign attribution.
>>>>>>> dcbcc9b (https://github.com/uppuraghu/Recoverly-Abandoned-Cart-Recovery-Campaign-Attribution.git)
