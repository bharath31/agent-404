-- App-generated login OTPs for the embedded sign-in flow (Path A).
-- Codes are generated + verified by the app (SHA-256 hashed at rest), sent
-- via Resend. No Auth0 OTP involvement, so the tenant's email settings are
-- never touched.
CREATE TABLE IF NOT EXISTS login_otp (
  email      TEXT PRIMARY KEY,
  code_hash  TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_otp_expires_idx ON login_otp (expires_at);
