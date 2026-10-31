# Data Dictionary and Relational Model

All timestamps are ISO-8601 UTC strings. Currency amounts are decimal USD values rounded to cents. IDs are immutable strings. Empty values in CSV represent SQL NULL.

## Entity dictionary

| Entity / field | Type | Req. | Allowed values / unit | Unique | Validation / meaning |
|---|---|---:|---|---:|---|
| **Customer** |||||
| customer_id | string | yes | `CUS-000001` | PK | Stable customer identifier |
| created_at | timestamp | yes | UTC | no | Must be valid timestamp |
| country | string | yes | IN, US, GB, AU, CA | no | Synthetic country code |
| segment | enum | yes | new, returning, high_value, discount_sensitive | no | Customer segment |
| lifecycle_state | enum | yes | active, dormant | no | Customer lifecycle |
| email | string | yes | `.example.test` | yes | Synthetic contact address |
| phone | string | yes | `+1555` plus 7 digits | no | Synthetic phone |
| **Consent** |||||
| consent_id | string | yes | `CON-*` | PK | Immutable consent event ID |
| customer_id | string | yes | Customer FK | no | Must reference Customer |
| channel | enum | yes | email, sms | no | Consent is channel-specific |
| status | enum | yes | opt_in, opt_out | no | Effective consent state |
| effective_from | timestamp | yes | UTC | no | Start of consent state |
| effective_to | timestamp | no | UTC/null | no | End of state; if set must be after effective_from |
| source | enum/string | yes | preference_center, unsubscribe_link | no | Capture source |
| captured_at | timestamp | yes | UTC | no | Must be at/after effective_from in production |
| **Session** |||||
| session_id | string | yes | `SES-2026-000001` | PK | Session identifier |
| customer_id | string | yes | Customer FK | no | Session owner |
| device_type | enum | yes | desktop, mobile_web, ios_app, android_app | no | Device context |
| started_at | timestamp | yes | UTC | no | Must be <= ended_at |
| ended_at | timestamp | yes | UTC | no | Session end |
| source | enum | yes | organic, paid_search, email, direct, affiliate | no | Acquisition source |
| session_state | enum | yes | completed | no | Lifecycle state |
| **Cart** |||||
| cart_id | string | yes | `CART-2026-000001` | PK | Cart identifier |
| customer_id | string | yes | Customer FK | no | Cart owner |
| session_id | string | yes | Session FK | no | Originating session |
| created_at | timestamp | yes | UTC | no | Cart creation |
| updated_at | timestamp | yes | UTC | no | Last cart mutation |
| last_activity_at | timestamp | yes | UTC | no | Last observed activity |
| abandonment_threshold_minutes | integer | yes | positive minutes | no | Default 60 |
| abandoned_at | timestamp | no | UTC/null | no | Derived inactivity threshold crossing |
| status | enum | yes | abandoned, active, converted, recovered | no | Current lifecycle status |
| subtotal | decimal | yes | USD >= 0 | no | Sum of CartLine line_total at generation time |
| discount_amount | decimal | yes | USD >= 0 | no | Discount |
| tax_amount | decimal | yes | USD >= 0 | no | 8% of subtotal in fixture |
| cart_total | decimal | yes | USD >= 0 | no | subtotal - discount + tax |
| currency | string | yes | USD | no | ISO currency code |
| purchased_at | timestamp | no | UTC/null | no | Purchase timestamp if converted/recovered |
| **CartLine** |||||
| cart_line_id | string | yes | `<cart-id>-L<n>` | PK | Immutable line identifier |
| cart_id | string | yes | Cart FK | no | Parent cart |
| sku | string | yes | SKU-001..SKU-010 | no | Synthetic product key |
| product_name | string | yes | synthetic catalog | no | Product label |
| quantity | integer | yes | 1+ | no | Must be positive |
| unit_price | decimal | yes | USD >= 0 | no | Price per unit |
| line_total | decimal | yes | USD | no | quantity * unit_price |
| **Campaign** |||||
| campaign_id | string | yes | `CMP-2026-000001` | PK | Campaign ID |
| campaign_name | string | yes | string | no | Human-readable name |
| channel | enum | yes | email, sms | no | Channel |
| variant | enum | yes | discount, simple_reminder, recommendation, urgency | no | Experiment variant |
| template_id | string | yes | MessageTemplate FK | no | Template used |
| scheduled_at | timestamp | yes | UTC | no | Planned schedule |
| attribution_window_hours | integer | yes | positive hours | no | 168 hours |
| frequency_cap | integer | yes | positive count | no | Maximum campaign frequency |
| campaign_state | enum | yes | completed | no | Campaign lifecycle |
| **MessageTemplate** |||||
| template_id | string | yes | `TPL-001` | PK | Template identifier |
| channel | enum | yes | email, sms | no | Channel |
| variant | enum | yes | benefit_reminder, product_reminder | no | Template variant |
| subject | string | yes | text | no | Message subject (SMS still has a generic subject field) |
| body_text | string | yes | text | no | Synthetic message body |
| personalization_fields | string | yes | comma-separated field names | no | Allowed personalization tokens |
| **SendAttempt** |||||
| send_id | string | yes | `SEND-2026-000001` | PK | Attempt identifier |
| campaign_id | string | yes | Campaign FK | no | Campaign reference |
| customer_id | string | yes | Customer FK | no | Recipient |
| cart_id | string | yes | Cart FK | no | Cart being recovered |
| channel | enum | yes | email, sms | no | Delivery channel |
| template_id | string | yes | MessageTemplate FK | no | Template reference |
| message_id | string | yes | `MSG-<cart-id>-01` | no | Stable logical message ID |
| attempted_at | timestamp | yes | UTC | no | Decision/attempt time |
| send_status | enum | yes | sent, suppressed, failed | no | Outcome |
| suppression_reason | enum/string | yes | none, cart_not_abandoned, no_active_consent, frequency_cap | no | Explicit decision reason |
| idempotency_key | string | yes | campaign/cart/channel | yes | Prevents duplicate sends |
| **MessageEvent** |||||
| message_event_id | string | yes | `ME-*` | PK | Event ID |
| send_id | string | yes | SendAttempt FK | no | Related send |
| event_type | enum | yes | delivered, opened, clicked, bounced | no | Provider event |
| event_at | timestamp | yes | UTC | no | Must be >= attempted_at in valid baseline |
| event_source | string | yes | synthetic_provider | no | Event provenance |
| **Order** |||||
| order_id | string | yes | `ORD-2026-000001` | PK | Order ID |
| customer_id | string | yes | Customer FK | no | Buyer |
| cart_id | string | yes | Cart FK | no | Source cart |
| ordered_at | timestamp | yes | UTC | no | Purchase time |
| order_status | enum | yes | paid | no | Order lifecycle |
| subtotal | decimal | yes | USD >= 0 | no | Derived from cart |
| tax_amount | decimal | yes | USD >= 0 | no | Tax amount |
| order_total | decimal | yes | USD >= 0 | no | subtotal + tax - discount |
| currency | string | yes | USD | no | Currency |
| is_late_purchase | boolean/int | yes | 0, 1 | no | Purchase after attribution window |
| **Attribution** |||||
| attribution_id | string | yes | `ATT-000001` | PK | Attribution row |
| order_id | string | yes | Order FK | no | Converted order |
| send_id | string | yes | SendAttempt FK | no | Touchpoint |
| campaign_id | string | yes | Campaign FK | no | Campaign credit |
| attribution_model | enum | yes | last_click | no | Attribution rule |
| attributed_at | timestamp | yes | UTC | no | Order timestamp |
| attributed_revenue | decimal | yes | USD >= 0 | no | Revenue credited |
| attribution_window_hours | integer | yes | positive hours | no | 168 |
| is_primary | boolean/int | yes | 0, 1 | no | Primary credit flag |
| **CartEvent** |||||
| cart_event_id | string | yes | `CE-*` | PK | Immutable cart event ID |
| cart_id | string | yes | Cart FK | no | Cart reference |
| event_type | enum | yes | created, updated | no | Lifecycle event |
| event_at | timestamp | yes | UTC | no | Event time |
| old_status | enum/string | no | nullable | no | Previous state |
| new_status | enum/string | yes | open, abandoned, active, converted | no | New state |
| details | string | yes | text | no | Event explanation |

## Relationships and cardinality

| Parent | Child | Cardinality | Optionality / notes |
|---|---|---|---|
| Customer | Consent | 1:N | A customer has consent history per channel; multiple effective-dated records |
| Customer | Session | 1:N | A customer can use multiple devices and sessions |
| Customer | Cart | 1:N | A customer can own many carts |
| Session | Cart | 1:N | A session can create multiple carts; each cart references one session |
| Cart | CartLine | 1:N | A cart has one or more lines |
| Campaign | MessageTemplate | N:1 | A campaign uses one template; a template can be reused by campaigns |
| Campaign | SendAttempt | 1:N | Campaign has many recipient attempts |
| Customer | SendAttempt | 1:N | Customer may receive attempts over time |
| Cart | SendAttempt | 1:N | A cart may have multiple attempts/campaign touches |
| SendAttempt | MessageEvent | 1:N | Delivery/open/click events are append-only; zero events for suppressed sends |
| Customer | Order | 1:N | A customer can place many orders |
| Cart | Order | 1:0..N | A cart may have no order; normally one order, anomaly fixture tests lifecycle integrity |
| Order | Attribution | 1:0..N | Normal algorithm produces at most one primary row; anomaly fixture intentionally creates duplicate credit |
| SendAttempt | Attribution | 1:N | A send can be credited across orders only if rule allows; this fixture is cart/order scoped |
| Campaign | Attribution | 1:N | Campaign receives attributed conversion credit |
| Cart | CartEvent | 1:N | Append-only lifecycle history |

## Many-to-many and bridge semantics

Campaign-to-Customer and Campaign-to-Cart exposure is represented by `SendAttempt`, which acts as the bridge table and also captures attempt lifecycle/decision state. No separate bridge table is needed because the relationship has meaningful attributes (channel, template, attempted_at, status, suppression reason, idempotency key).

## Derived fields and lifecycle

- `Cart.abandoned_at = Cart.updated_at + abandonment_threshold_minutes` for carts that cross the inactivity threshold and have no purchase before that threshold.
- `Cart.cart_total = subtotal - discount_amount + tax_amount`; baseline tax is 8%.
- `CartLine.line_total = quantity * unit_price`.
- `Order.order_total = subtotal + tax_amount` in this fixture (discount is zero).
- Attribution requires a click timestamp in `[ordered_at - 168h, ordered_at]` from a sent attempt for the same customer and cart. The latest qualifying click is the primary last-click touch.
- Consent decision is channel-specific and effective-dated. Latest effective record wins.

## Anomaly ground truth
The four intentional issues are enumerated in `ground_truth.csv/json`; they must be excluded from model input features and used only for validation/evaluation.
