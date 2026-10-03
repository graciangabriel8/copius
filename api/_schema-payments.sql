-- Copius payments (DESIGN-PAYMENT.md, kairos/copius-step2), MySQL. Imported once in
-- phpMyAdmin, after _schema.sql. Times are Unix seconds set by PHP; dates are Paris
-- dates (YYYY-MM-DD); money is in euro cents. Ids from Stripe are ASCII.
-- Every row about a buyer is kept for the contract and five years after it, payments
-- and refunds for ten years; purge_payments() deletes them after that (DESIGN-PAYMENT
-- section 3). Access comes from these tables (paid_until() in _lib.php), never from
-- grant rows.

CREATE TABLE orders (
  id           CHAR(32) CHARACTER SET ascii NOT NULL PRIMARY KEY,   -- the buyer's reference
  email        VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  plan         VARCHAR(8) CHARACTER SET ascii NOT NULL,             -- monthly | yearly
  lang         CHAR(2) CHARACTER SET ascii NOT NULL DEFAULT 'fr',
  cgv_version  VARCHAR(16) CHARACTER SET ascii NOT NULL,
  cgv_at       INT NOT NULL,                                        -- the CGV box ticked
  created      INT NOT NULL,
  session      VARCHAR(255) CHARACTER SET ascii NULL,                -- cs_...
  status       VARCHAR(8) CHARACTER SET ascii NOT NULL DEFAULT 'pending',   -- pending | paid | expired
  confirmed_at INT NULL,                                            -- the L221-13 confirmation sent
  KEY (email)
) ENGINE=InnoDB;

CREATE TABLE subscriptions (
  id              VARCHAR(255) CHARACTER SET ascii NOT NULL PRIMARY KEY,    -- sub_...
  order_id        CHAR(32) CHARACTER SET ascii NOT NULL,
  email           VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  plan            VARCHAR(8) CHARACTER SET ascii NOT NULL,
  status          VARCHAR(24) CHARACTER SET ascii NOT NULL DEFAULT 'incomplete',
  started         DATE NULL,                                       -- first payment, Paris date
  paid_from       DATE NULL,                                       -- the paid period, Paris dates:
  paid_until      DATE NULL,                                       --   from its start to its end
  retry_until     DATE NULL,                                       -- while past_due
  cancel_at       INT NULL,
  ended_at        INT NULL,
  notice_deadline DATE NULL,
  notice_sent_at  INT NULL,
  notice_missed   TINYINT NOT NULL DEFAULT 0,
  amount          INT NULL,                                        -- cents paid for that period
  withdrawn_at    INT NULL,                                        -- an in-time withdrawal: access ends
  KEY (email), KEY (order_id)
) ENGINE=InnoDB;

CREATE TABLE payments (
  invoice        VARCHAR(255) CHARACTER SET ascii NOT NULL PRIMARY KEY,     -- in_...
  subscription   VARCHAR(255) CHARACTER SET ascii NOT NULL,
  amount         INT NOT NULL,                                    -- cents
  paid_at        INT NOT NULL,
  payment_intent VARCHAR(255) CHARACTER SET ascii NULL,
  KEY (subscription), KEY (payment_intent)
) ENGINE=InnoDB;

CREATE TABLE refunds (
  id      VARCHAR(255) CHARACTER SET ascii NOT NULL PRIMARY KEY,    -- re_..., so one refund counts once
  invoice VARCHAR(255) CHARACTER SET ascii NOT NULL,
  cents   INT NOT NULL,
  status  VARCHAR(16) CHARACTER SET ascii NOT NULL,                 -- Stripe's: pending, succeeded, failed...
  ours    TINYINT NOT NULL DEFAULT 0,                               -- issued by Copius
  copius_key VARCHAR(255) CHARACTER SET ascii NULL,                 -- its Idempotency-Key, when ours
  at      INT NOT NULL,
  KEY (invoice), KEY (copius_key)
) ENGINE=InnoDB;

CREATE TABLE outbox (
  id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kind       VARCHAR(24) CHARACTER SET ascii NOT NULL,
  dedupe     VARCHAR(255) CHARACTER SET ascii NOT NULL UNIQUE,
  to_addr    VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  lang       CHAR(2) CHARACTER SET ascii NOT NULL DEFAULT 'fr',
  ref        VARCHAR(255) CHARACTER SET ascii NULL,
  payload    TEXT NOT NULL,                                       -- JSON
  created    INT NOT NULL,
  claimed_at INT NULL,
  attempts   INT NOT NULL DEFAULT 0,
  sent_at    INT NULL,
  last_error VARCHAR(255) CHARACTER SET ascii NULL,
  KEY (sent_at)
) ENGINE=InnoDB;

CREATE TABLE cancellations (
  id             INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  received_at    INT NOT NULL,
  name           VARCHAR(255) NOT NULL,
  email          VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  ref            VARCHAR(64) CHARACTER SET ascii NOT NULL,
  lang           CHAR(2) CHARACTER SET ascii NOT NULL DEFAULT 'fr',
  choice         VARCHAR(12) CHARACTER SET ascii NOT NULL,         -- period_end | early, as asked
  chosen_date    DATE NULL,
  motif          TEXT NULL,
  outcome        VARCHAR(16) CHARACTER SET ascii NOT NULL DEFAULT 'received',
  subscription   VARCHAR(255) CHARACTER SET ascii NULL,
  holds          VARCHAR(255) CHARACTER SET ascii NULL UNIQUE,     -- the subscription it is THE cancellation of
  applied        VARCHAR(12) CHARACTER SET ascii NULL,           -- now | period_end | early | year_end
  effective_date DATE NULL,
  invoice        VARCHAR(255) CHARACTER SET ascii NULL,           -- the payment an early end refunds
  refund_cents   INT NOT NULL DEFAULT 0,
  refunded_at    INT NULL,
  stripe_tries   INT NOT NULL DEFAULT 0,
  acked          TINYINT NOT NULL DEFAULT 0,                      -- acknowledgement queued
  KEY (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE withdrawals (
  id           INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  received_at  INT NOT NULL,
  name         VARCHAR(255) NOT NULL,
  email        VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  ref          VARCHAR(64) CHARACTER SET ascii NOT NULL,
  lang         CHAR(2) CHARACTER SET ascii NOT NULL DEFAULT 'fr',
  outcome      VARCHAR(16) CHARACTER SET ascii NOT NULL DEFAULT 'received',
  subscription VARCHAR(255) CHARACTER SET ascii NULL,
  refund_cents INT NOT NULL DEFAULT 0,
  stripe_tries INT NOT NULL DEFAULT 0,
  acked        TINYINT NOT NULL DEFAULT 0,
  KEY (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
