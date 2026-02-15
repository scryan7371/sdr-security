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

## App Integration

Create one client per app session and reuse it across screens:

```ts
import { app as sdrSecurity } from '@scryan7371/sdr-security';

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

## Private Registry Publish (GitHub Packages)

1. Set your token:

```bash
export GITHUB_PACKAGES_TOKEN=ghp_xxx
```

2. Publish:

```bash
npm publish
```

## Install From Any Environment

1. Add auth to your consuming project's `.npmrc`:

```ini
@scryan7371:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

2. Install a pinned version:

```bash
npm install @scryan7371/sdr-security@0.1.0
```
