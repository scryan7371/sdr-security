# sdr-security

Reusable auth/security capability for API and app clients.

## Surfaces

- `api`: shared auth types and input validation helpers.
- `app`: typed client for auth endpoints.

## API Integration

Use shared helpers/types in your API controllers/services where useful:

- `sanitizeEmail`
- `isValidEmail`
- `isStrongPassword`
- `AuthResponse`, `RegisterResponse`, `SafeUser`
- `notifyAdminsOnEmailVerified`
- `notifyUserOnAdminApproval`

## Nest Integration

Import the Nest surface from `@scryan7371/sdr-security/nest`.

```ts
import { Module } from "@nestjs/common";
import {
  SecurityWorkflowsModule,
  SECURITY_WORKFLOW_NOTIFIER,
} from "@scryan7371/sdr-security/nest";
import { EmailService } from "./notifications/email.service";

@Module({
  imports: [
    SecurityWorkflowsModule.forRoot({
      notifierProvider: {
        provide: SECURITY_WORKFLOW_NOTIFIER,
        useFactory: (emailService: EmailService) => ({
          sendAdminsUserEmailVerified: ({ adminEmails, user }) =>
            emailService.sendEmailVerifiedNotificationToAdmins(
              adminEmails,
              user,
            ),
          sendUserAccountApproved: ({ email, firstName }) =>
            emailService.sendAccountApproved(email, firstName),
        }),
        inject: [EmailService],
      },
    }),
  ],
})
export class AppModule {}
```

Optional Swagger setup in consuming app:

```ts
import { setupSecuritySwagger } from "@scryan7371/sdr-security/nest";

setupSecuritySwagger(app); // default path: /docs/security
```

Routes exposed by the shared controller:

- `POST /security/auth/register`
- `POST /security/auth/login`
- `POST /security/auth/forgot-password`
- `POST /security/auth/reset-password`
- `GET /security/auth/verify-email?token=...`
- `POST /security/auth/change-password` (JWT required)
- `POST /security/auth/logout` (JWT required)
- `POST /security/auth/refresh`
- `GET /security/auth/me/roles` (JWT required)
- `POST /security/workflows/users/:id/email-verified`
  - marks `email_verified_at` and notifies admins.
- `PATCH /security/workflows/users/:id/admin-approval` with `{ approved: boolean }`
  - updates `admin_approved_at` and notifies user when approved (admin JWT required).
- `PATCH /security/workflows/users/:id/active` with `{ active: boolean }` (admin JWT required)
- `GET /security/workflows/roles` (admin JWT required)
- `POST /security/workflows/roles` (admin JWT required)
- `DELETE /security/workflows/roles/:role` (admin JWT required)
- `GET /security/workflows/users/:id/roles` (admin JWT required)
- `PUT /security/workflows/users/:id/roles` (admin JWT required)
- `POST /security/workflows/users/:id/roles` with `{ role: string }` (admin JWT required)
- `DELETE /security/workflows/users/:id/roles/:role` (admin JWT required)

### Shared notification workflows

Use these helpers to standardize notification behavior across apps while still
keeping app-specific email sending in your own services.

```ts
import { api as sdrSecurity } from "@scryan7371/sdr-security";

await sdrSecurity.notifyAdminsOnEmailVerified({
  user: {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  },
  listAdminEmails: () => usersService.listAdminEmails(),
  notifyAdmins: ({ adminEmails, user }) =>
    emailService.sendEmailVerifiedNotificationToAdmins(adminEmails, user),
});

await sdrSecurity.notifyUserOnAdminApproval({
  approved: body.approved,
  user: {
    email: user.email,
    firstName: user.firstName,
  },
  notifyUser: ({ email, firstName }) =>
    emailService.sendAccountApproved(email, firstName),
});
```

## App Integration

Create one client per app session and reuse it across screens:

```ts
import { app as sdrSecurity } from "@scryan7371/sdr-security";

const securityClient = sdrSecurity.createSecurityClient({
  baseUrl,
  getAccessToken: () => accessToken,
});
```

Methods:

- `register`
- `login`
- `loginWithGoogle`
- `refresh`
- `revoke`
- `logout`
- `requestEmailVerification`
- `verifyEmail`
- `requestPhoneVerification`
- `verifyPhone`

## Publish (npmjs)

1. Configure project-local npm auth (`.npmrc`):

```ini
registry=https://registry.npmjs.org/
@scryan7371:registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

2. Set token, bump version, and publish:

```bash
export NPM_TOKEN=xxxx
npm version patch
npm publish --access public --registry=https://registry.npmjs.org --userconfig .npmrc
```

3. Push commit and tags:

```bash
git push
git push --tags
```

## CI Publish (GitHub Actions)

Tag pushes like `sdr-security-v*` trigger `.github/workflows/publish.yml`.

Required repo secret:

- `NPM_TOKEN` (npm granular token with read/write + bypass 2FA for automation).

## Install

Install a pinned version:

```bash
npm install @scryan7371/sdr-security@0.1.0
```

## Database Integration Test

A sample Postgres integration test is included at:

- `src/integration/database.integration.test.ts`

Run it with:

```bash
npm run test:db
```

Configuration resolution order:

1. `.env.test` (if present)
2. `.env.dev` (if present)
3. existing process env

Supported env vars:

- `SECURITY_TEST_DATABASE_URL` (preferred)
- or `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- optional fallback: `DATABASE_URL`
- optional debug:
  - `SECURITY_TEST_KEEP_SCHEMA=true` (do not drop schema after test run)
  - `SECURITY_TEST_SCHEMA=your_schema_name` (use fixed schema name)

See `.env.test.example` for a template.

## Release Script

You can automate version bump + tag + push with:

```bash
npm run release:patch
npm run release:minor
npm run release:major
```

What it does:

1. Verifies clean git working tree
2. Runs `npm test`
3. Runs `npm run build`
4. Bumps `package.json` + `package-lock.json`
5. Commits as `chore(release): vX.Y.Z`
6. Tags as `sdr-security-vX.Y.Z`
7. Pushes commit and tag

This tag format triggers `.github/workflows/publish.yml`.
