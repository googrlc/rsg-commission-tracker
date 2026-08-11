# Remote Coordinator access (WFH)

The Commission Statement Coordinator works from home on the **same Hermes VPS
tracker** (Tailscale-only). Do **not** resurrect a public Cloud Run URL for this
role.

## What the hire needs on day one

1. **Tailscale** installed on their home machine, invited to the RSG tailnet,
   with access to `hermes-gretch` (same node that serves
   `https://hermes-gretch.tail….ts.net:8446/`).
2. **Their own Supabase Auth user** (work email) — never the shared Finance-lane
   autologin account.
3. A row in **`app_allowlist`** with `is_admin = false` (coordinator). Approvers
   keep `is_admin = true`.
4. A matching active row in **`agency_crm_users`** (email) so uploads/handoffs
   pass the finance API identity check.
5. Named logins + MFA for carrier portals, NowCerts, and Nextcloud (outside this
   app). No shared carrier credentials.

## Role split

| Flag | Role | Landing |
|---|---|---|
| `app_allowlist.is_admin = true` | Approver | Classic / Commission Workspace; can Approve & book |
| `app_allowlist.is_admin = false` | Coordinator | `#coordinator` guided workspace only |

The SPA reads `commission_user_capabilities()` (see
[`db/coordinator_portal.sql`](../db/coordinator_portal.sql)). The finance API
enforces the same rule on approve / reject / override / remittance release
(`hermes_finance.permissions`).

Optional API override for break-glass / tests:

```bash
export COMMISSION_APPROVER_EMAILS="lamar@example.com"
```

## Why shared autologin cannot be the hire’s path

The private Docker build may still bake `VITE_AUTOLOGIN_EMAIL` /
`VITE_AUTOLOGIN_PASSWORD` for the Master Workspace Finance embed. That shared
session:

- cannot separate prepared-by vs approved-by,
- would give the hire the same powers as whoever owns that allowlist row,
- breaks the beginner “prepare only” guarantee.

**For the coordinator:** open the tracker URL and use the **real login gate**
(email/password or OTP). Prefer a build without autologin for any URL the hire
bookmarks, or ensure their account is distinct and `is_admin=false` even if they
somehow hit an embed.

## Apply database pieces

On the hosted Supabase project, run:

```text
db/coordinator_portal.sql
```

Then redeploy the tracker container on Hermes (code-only, no password rotate):

```bash
# from a machine that can reach the box — sync source then rebuild
tar czf - --exclude=.git --exclude=node_modules --exclude=dist . \
  | ssh hermes 'tar xzf - -C /opt/rsg-commission-tracker'
ssh hermes 'cd /opt/rsg-commission-tracker && ./rebuild.sh'
```

Also ensure `rsg-finance-api` on the box is restarted so the new permission
checks and `/api/agency-bill/*` routes are live.

## Seed the Control Log

Before the hire’s first Monday, management should add Control Log rows for each
carrier × period (portal URL, producer code, expected date, billing mode). The
hire must not invent carriers from filenames.
