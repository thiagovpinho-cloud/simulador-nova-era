# Focado recovery browser gate — 2026-09-05

Validated on the isolated recovery preview before production promotion.

- Strict lazy loading remains enabled.
- DOM-safe lazy stylesheet insertion fixed PCP first-click failure.
- Duplicate `FOCADO_OPS_V6` legacy operational engine is excluded from the modern preview build only; source remains preserved in `index.html` for audit/migration.
- Real Chromium gate opens PCP with ADMIN session and asserts no dialog, no pageerror and no failed module request.
- PCP first-click chain remains limited to Products -> Production -> PCP, with PCP History optional.
- Public Cloudflare preview smoke passed after deploy.

Production was not modified.