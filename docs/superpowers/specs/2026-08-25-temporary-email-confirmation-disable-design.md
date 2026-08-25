# Temporary Email Confirmation Disable Design

**Date:** 2026-08-25

## Goal

Allow a student to create an account and enter Cove Studio immediately after
submitting the existing signup form. The email field remains required, but the
student does not need to open a confirmation email before using the platform.

## Decision

Disable **Confirm email** in the Supabase Email authentication provider for the
production project `sfesugoedobirmeqjcvp`.

This is preferred over adding an application-side confirmation bypass because
it uses Supabase's supported configuration, is reversible, and leaves the
existing signup and confirmation code intact. An age-specific bypass is out of
scope because the current signup flow does not collect or verify age.

## Behavior

- Signup continues to require display name, username, email, password, academy,
  and the existing CAPTCHA when configured.
- Supabase creates the user with the email treated as confirmed and returns a
  session immediately.
- The existing `signupAction` starts the Cove Studio session and redirects the
  student to invitation onboarding or welcome onboarding.
- A returning student signs in using the existing username-and-password flow.
- Password recovery and all Resend integration code remain available.
- No confirmation-related code, email template, redirect URL, or API route is
  removed.

## Operational Change

In Supabase Dashboard, open **Authentication → Sign In / Providers → Email** and
turn off **Confirm email**, then save the provider settings. No repository code
or environment-variable change is required.

## Verification

Use a new test account to verify:

1. The signup form still requires an email address.
2. Submitting valid signup data signs the student in immediately.
3. The student reaches the expected welcome or invitation route.
4. After signing out, the student can sign in with the chosen username and
   password.
5. No confirmation-email action is required.

## Reversal

To restore email ownership verification later, turn **Confirm email** back on
in the same Supabase provider settings. The retained application code and
Resend configuration will support the restored flow.

## Security Trade-off

While confirmation is disabled, Supabase does not prove that a student owns the
email address entered during signup. Mistyped or fabricated addresses can make
password recovery unavailable. This temporary trade-off is accepted to support
young students who cannot access an inbox during signup.
