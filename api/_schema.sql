-- Copius sign-in, MySQL (OVH's included database). Imported once in phpMyAdmin.
-- Times are Unix seconds set by PHP, except grants.created, which phpMyAdmin
-- fills when the owner adds a row. Hashes and rate keys are hex, so no binary
-- string ever crosses the connection's character set.
-- Addresses are ASCII with a binary collation: under MySQL's default collations
-- prof@ac-lyön.fr would match a grant for prof@ac-lyon.fr (DESIGN.md, section 2).

CREATE TABLE grants (
  email        VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  note         VARCHAR(255) NULL,
  until        DATE NULL DEFAULT NULL,           -- NULL = open; access ends by setting it
  max_sessions INT NOT NULL DEFAULT 5,
  created      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE accounts (
  id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email      VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  lang       CHAR(2) CHARACTER SET ascii NOT NULL DEFAULT 'fr',
  created    INT NOT NULL,
  last_login INT NOT NULL
) ENGINE=InnoDB;

CREATE TABLE login_tokens (
  token_hash CHAR(64) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  email      VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  lang       CHAR(2) CHARACTER SET ascii NOT NULL DEFAULT 'fr',
  created    INT NOT NULL,
  expires    INT NOT NULL,
  used       TINYINT NOT NULL DEFAULT 0,
  KEY (email)
) ENGINE=InnoDB;

CREATE TABLE sessions (
  id_hash    CHAR(64) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  account_id INT NOT NULL,
  created    INT NOT NULL,
  last_seen  INT NOT NULL,
  expires    INT NOT NULL,
  KEY (account_id)
) ENGINE=InnoDB;

CREATE TABLE rate_events (
  k  CHAR(32) CHARACTER SET ascii NOT NULL,
  at INT NOT NULL,
  KEY (k, at)
) ENGINE=InnoDB;

-- An erasure request (DESIGN.md section 2): everything for the address, at once,
-- in this order. Every statement matches as the code does, on LOWER(TRIM(email)),
-- so a grant pasted with a capital or a trailing space goes too. Replace the
-- address in all four lines, in lower case.
--   DELETE s FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE LOWER(TRIM(a.email)) = 'prof@x.fr';
--   DELETE FROM login_tokens WHERE LOWER(TRIM(email)) = 'prof@x.fr';
--   DELETE FROM accounts WHERE LOWER(TRIM(email)) = 'prof@x.fr';
--   DELETE FROM grants WHERE LOWER(TRIM(email)) = 'prof@x.fr';
-- Rate-limit fingerprints hold no address and go by themselves within 24 hours.
