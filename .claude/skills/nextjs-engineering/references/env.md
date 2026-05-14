# Environment Variable Standards for Next.js

## 1. The `NEXT_PUBLIC_` prefix rule

Next.js inlines `NEXT_PUBLIC_` variables into the client bundle at build time. Every other variable stays server-only. This is a hard security boundary — never expose secrets through `NEXT_PUBLIC_`.

```
NEXT_PUBLIC_API_URL=https://api.example.com    # ✅ safe — public endpoint
NEXT_PUBLIC_STRIPE_KEY=pk_live_...             # ✅ safe — publishable key

DATABASE_URL=postgres://...                     # ✅ server-only (no prefix)
STRIPE_SECRET_KEY=sk_live_...                  # ✅ server-only — NEVER add NEXT_PUBLIC_
JWT_SECRET=super-secret                         # ✅ server-only
```

```ts
// ✅ Access server-only vars in Server Components and API routes
const db = new Client({ connectionString: process.env.DATABASE_URL });

// ✅ Access public vars anywhere
const apiUrl = process.env.NEXT_PUBLIC_API_URL;

// ❌ Accessing a server-only var in a Client Component — Next.js replaces it with undefined
'use client';
console.log(process.env.DATABASE_URL);  // → undefined at runtime
```

---

## 2. `.env` file hierarchy

Next.js loads env files in this order (later files win for the same variable):

| File | Purpose | Commit to git? |
|---|---|---|
| `.env` | Shared defaults for all environments | Yes (no secrets) |
| `.env.local` | Local overrides, secrets | **No** — add to `.gitignore` |
| `.env.development` | Dev-specific values | Yes (no secrets) |
| `.env.development.local` | Local dev overrides | No |
| `.env.production` | Production defaults | Yes (no secrets) |
| `.env.production.local` | Local production overrides | No |
| `.env.test` | Test environment | Yes (no secrets) |

```bash
# .gitignore — always include these
.env.local
.env.*.local
```

---

## 3. `.env.example` template

Always commit an `.env.example` with all required keys, dummy values, and comments. This is the authoritative list of env vars the project needs.

```bash
# .env.example

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# Authentication
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000

# Stripe
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# External APIs
NEXT_PUBLIC_API_URL=https://api.example.com
API_SECRET_KEY=your-api-secret-here
```

---

## 4. Centralized validation with `lib/env.ts`

Validate all env vars at startup with Zod. If a required var is missing or malformed, the app crashes immediately with a clear error — not silently at runtime when the var is first accessed. This is the single source of truth for your env contract.

```ts
// ✅ lib/env.ts
import { z } from 'zod';

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: z.string().url(),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  API_SECRET_KEY: z.string().min(16),
});

const clientSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
});

// Server-only vars — throw if accessed on the client
const serverEnv = serverSchema.parse(process.env);

// Client vars — safe to export and use anywhere
const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
});

export const env = {
  ...serverEnv,
  ...clientEnv,
};
```

```ts
// ✅ Usage everywhere — typed, validated, IDE-autocompleted
import { env } from '@/lib/env';

const db = new Client({ connectionString: env.DATABASE_URL });
const stripe = new Stripe(env.STRIPE_SECRET_KEY);
```

```ts
// ❌ Raw process.env access scattered through codebase
const db = new Client({ connectionString: process.env.DATABASE_URL });
// No type safety, no validation, typos become runtime errors
```

---

## 5. Preventing server env leakage to the client

If `lib/env.ts` is imported in a Client Component, the server variables will be included in the bundle. Two patterns to prevent this:

**Pattern A — separate files:**

```ts
// lib/env.server.ts  (server-only)
import { z } from 'zod';
export const serverEnv = z.object({
  DATABASE_URL: z.string().url(),
  STRIPE_SECRET_KEY: z.string(),
}).parse(process.env);

// lib/env.client.ts  (safe to import anywhere)
import { z } from 'zod';
export const clientEnv = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
}).parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});
```

**Pattern B — `server-only` package:**

```ts
// lib/env.ts
import 'server-only';  // throws a build error if imported in a Client Component
import { z } from 'zod';
export const env = z.object({ ... }).parse(process.env);
```

---

## 6. Common mistakes

```ts
// ❌ Destructuring process.env — Next.js can't statically analyze this
const { DATABASE_URL, STRIPE_SECRET_KEY } = process.env;

// ✅ Always access as property lookup
const dbUrl = process.env.DATABASE_URL;

// ❌ Using env vars before validation (in module-level code)
export const db = new Client({ connectionString: process.env.DATABASE_URL });
// → crashes with unhelpful error if DATABASE_URL is undefined

// ✅ Validate first, then use
import { env } from '@/lib/env';
export const db = new Client({ connectionString: env.DATABASE_URL });
// → crashes at startup with "Invalid environment variables: DATABASE_URL: Invalid url"

// ❌ Hardcoding a fallback that masks a misconfiguration
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
// → runs silently with wrong URL in production if the var was never set

// ✅ Let the Zod schema enforce the value is set; no fallback needed
const apiUrl = env.NEXT_PUBLIC_API_URL;
```

---

## 7. Type augmentation (optional, for stricter DX)

If you prefer `process.env.X` over `env.X`, extend the `ProcessEnv` interface so TypeScript knows what's available:

```ts
// types/env.d.ts
declare namespace NodeJS {
  interface ProcessEnv {
    readonly NODE_ENV: 'development' | 'test' | 'production';
    readonly DATABASE_URL: string;
    readonly NEXT_PUBLIC_API_URL: string;
    // add all vars here
  }
}
```

This pairs well with the Zod validation in `lib/env.ts` — types are narrow, runtime is validated.
