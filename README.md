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
  SecurityDrizzleModule,
  SecurityWorkflowsModule,
  SECURITY_WORKFLOW_NOTIFIER,
} from "@scryan7371/sdr-security/nest";
import { EmailService } from "./notifications/email.service";

@Module({
  imports: [
    SecurityDrizzleModule.forRoot(),
    SecurityWorkflowsModule.forRoot({
      notifierProvider: {
        provide: SECURITY_WORKFLOW_NOTIFIER,
        useFactory: (emailService: EmailService) => ({
          sendAdminsUserEmailVerified: ({ adminEmails, user }) =>
            emailService.sendEmailVerifiedNotificationToAdmins(
              adminEmails,
              user,
            ),
          sendUserAccountApproved: ({ email }) =>
            emailService.sendAccountApproved(email),
        }),
        inject: [EmailService],
      },
    }),
  ],
})
export class AppModule {}
```

### User Table Ownership Model

Consuming apps keep ownership of the shared `users` table contract. `sdr-security`
stores security/auth state in its own tables and links them by user id.

- App-owned table:
  - `users` (at minimum: UUID primary key `id`; the published runtime schema also
    exposes `email` for the bundled auth services)
- `sdr-security` tables:
  - `security_users` (password hash, verified/approved/active flags)
  - `security_roles`, `security_user_roles`
  - `refresh_tokens`
  - `password_reset_tokens`

Link key:

- Security table `user_id` columns reference `users.id`.

This lets each app evolve its user schema independently while reusing the same
security workflows, guards, controllers, and migrations.

Typical app query pattern is a join when you need security state:

```sql
SELECT u.id, u.email, su.active, su.admin_approved_at, su.email_verified_at
FROM users u
LEFT JOIN security_users su ON su.user_id = u.id
WHERE u.id = $1;
```

Drizzle equivalent:

```ts
import { eq } from "drizzle-orm";
import { securityUser, user } from "@scryan7371/sdr-security/drizzle";

const [row] = await db
  .select({
    id: user.id,
    email: user.email,
    active: securityUser.active,
    adminApprovedAt: securityUser.adminApprovedAt,
    emailVerifiedAt: securityUser.emailVerifiedAt,
  })
  .from(user)
  .leftJoin(securityUser, eq(securityUser.userId, user.id))
  .where(eq(user.id, userId))
  .limit(1);
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
  },
  listAdminEmails: () => usersService.listAdminEmails(),
  notifyAdmins: ({ adminEmails, user }) =>
    emailService.sendEmailVerifiedNotificationToAdmins(adminEmails, user),
});

await sdrSecurity.notifyUserOnAdminApproval({
  approved: body.approved,
  user: {
    email: user.email,
  },
  notifyUser: ({ email }) => emailService.sendAccountApproved(email),
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

## Install

Install a pinned version:

```bash
npm install @scryan7371/sdr-security@0.1.12
```

## Drizzle Integration

Shared Drizzle schema definitions live in `src/drizzle/schema.ts` and are
published from `@scryan7371/sdr-security/drizzle`.

For local schema and migration development, set `DB_HOST`, `DB_PORT`,
`DB_USER`, `DB_PASSWORD`, and `DB_NAME`, then use:

```bash
npm run db:generate
npm run db:migrate
npm run db:push
npm run db:studio
npm run db:check
```

Generated SQL migrations and Drizzle metadata are written to `drizzle/`.

The consuming application must create its standardized `users` table before
running the security migration. The required contract is a public `users`
table with a UUID primary key named `id`; the application remains the owner of
that table.

Run the packaged security migrations with an existing node-postgres Drizzle
database:

```ts
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { migrateSecurityDatabase } from "@scryan7371/sdr-security/drizzle";

// The app migration set must create public.users before security migrations run.
await migrate(db, {
  migrationsFolder: "./drizzle",
  migrationsTable: "__drizzle_migrations",
});
await migrateSecurityDatabase(db);
```

The helper uses its own `__sdr_security_migrations` journal so it can safely
run alongside migrations owned by the consuming application. It creates only
the security-owned tables and foreign keys back to `users.id`. Run both calls
at application startup or in the consuming application's deployment migration
command; do not copy the package's generated SQL into the application.

### Nest runtime connection

Register the shared Drizzle provider once in the consuming app. Import it
before any security feature modules:

```ts
import { Module } from "@nestjs/common";
import { SecurityDrizzleModule } from "@scryan7371/sdr-security/nest";

@Module({
  imports: [SecurityDrizzleModule.forRoot()],
})
export class AppModule {}
```

By default the connection uses `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`,
and `DB_NAME`. The same values can be passed directly to `forRoot` when needed.

Inject the typed database into a service:

```ts
import { Inject, Injectable } from "@nestjs/common";
import {
  SECURITY_DRIZZLE_DB,
  SecurityDatabase,
} from "@scryan7371/sdr-security/nest";

@Injectable()
export class UsersService {
  constructor(
    @Inject(SECURITY_DRIZZLE_DB)
    private readonly db: SecurityDatabase,
  ) {}
}
```

## Release and Publish

GitHub Actions publishes the package when a tag matching
`sdr-security-v*` is pushed. The repository must have an `NPM_TOKEN` Actions
secret with permission to publish this package.

Start from a clean `main` branch, then use one of the release scripts:

```bash
npm run release:patch
npm run release:minor
npm run release:major
```

The script:

1. Verifies clean git working tree
2. Runs `npm test`
3. Runs `npm run build`
4. Bumps `package.json` + `package-lock.json`
5. Commits as `chore(release): vX.Y.Z`
6. Tags as `sdr-security-vX.Y.Z`
7. Pushes commit and tag

This tag format triggers `.github/workflows/publish.yml`.

Do not create a plain version tag such as `0.1.12`; it does not match the
publish workflow trigger. If `package.json` has already been bumped and the
release commit already exists, tag that commit without bumping the version
again:

```bash
VERSION=$(node -p "require('./package.json').version")
git tag "sdr-security-v${VERSION}"
git push origin "sdr-security-v${VERSION}"
```

Confirm the publish under **GitHub Actions → Publish package**, then verify the
published version:

```bash
npm view @scryan7371/sdr-security version
```

### Renew an expired npm token

An npm `E404 Not Found` error during the publish `PUT` can mean that the
workflow's npm token is expired, revoked, or missing publish permission.

1. Sign in to [npmjs.com](https://www.npmjs.com/) as `scryan7371`.
2. Open **Profile → Access Tokens → Generate New Token**.
3. Create a **Granular Access Token** with:
   - **Packages and scopes:** Read and write
   - **Package selection:** All packages, or the `@scryan7371` scope
   - **Bypass two-factor authentication:** Enabled
   - **IP restrictions:** None
   - **Expiration:** Choose the longest duration allowed by npm and schedule a
     reminder to renew it before that date.
4. Copy the token when npm displays it. Do not commit it or add it to a local
   configuration file.
5. In the GitHub `sdr-security` repository, open **Settings → Secrets and
   variables → Actions**.
6. Update the `NPM_TOKEN` repository secret with the new token. Paste only the
   token, without quotes or surrounding whitespace.
7. Open **Actions → Publish package**, select the failed run, and choose
   **Re-run jobs → Re-run failed jobs**.

If the failed version has not been published, do not bump the package version
or create another tag. Re-run the existing tagged workflow after replacing the
secret.
