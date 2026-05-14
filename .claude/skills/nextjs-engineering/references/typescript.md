# TypeScript Standards for Next.js

## 1. Strict mode configuration

Always enable strict mode in `tsconfig.json`. Without it, TypeScript's safety guarantees are largely hollow.

```json
// ✅ tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

---

## 2. Props interfaces

Define props as explicit interfaces, not inline types or `React.FC`. Inline types scatter the contract; `React.FC` imposes implicit `children` and breaks inference.

```tsx
// ✅ Explicit interface
interface UserCardProps {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}

export function UserCard({ userId, displayName, avatarUrl }: UserCardProps) { ... }

// ❌ Inline — hard to reuse, hard to document
export function UserCard({ userId, displayName }: { userId: string; displayName: string }) { ... }

// ❌ React.FC — adds implicit children, obscures return type
const UserCard: React.FC<{ userId: string }> = ({ userId }) => { ... }
```

---

## 3. `unknown` vs `any`

Use `unknown` for values whose type you don't control (API responses, caught errors). `any` silently disables type checking downstream.

```ts
// ✅ unknown forces you to validate before use
async function fetchUser(id: string): Promise<unknown> {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
}

// ❌ any infects everything it touches
async function fetchUser(id: string): Promise<any> { ... }
```

---

## 4. Runtime validation with Zod

Validate all external data (API responses, form inputs, env vars) with Zod at the boundary. TypeScript types alone don't survive runtime.

```ts
// ✅ Schema-first: derive the type from the schema
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['admin', 'viewer']),
  createdAt: z.coerce.date(),
});

type User = z.infer<typeof UserSchema>;

// Usage in a server action or API route
const user = UserSchema.parse(await response.json()); // throws on invalid shape

// ❌ Cast without validation — runtime crash waiting to happen
const user = (await response.json()) as User;
```

---

## 5. Discriminated union types

Model mutually exclusive states with discriminated unions. This eliminates impossible states and gives exhaustive narrowing for free.

```ts
// ✅ Discriminated union — each state carries only its own data
type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

function render(state: RequestState<User>) {
  switch (state.status) {
    case 'idle':    return <Idle />;
    case 'loading': return <Spinner />;
    case 'success': return <UserCard user={state.data} />;  // data is narrowed here
    case 'error':   return <ErrorBanner error={state.error} />;
  }
}

// ❌ Parallel boolean flags create impossible states
interface BadState {
  isLoading: boolean;
  isError: boolean;
  data?: User;        // isLoading=true AND data present is nonsensical
  error?: Error;
}
```

---

## 6. Generics

Use generics to write reusable, type-safe utilities. Constrain them when needed; don't reach for `any` to avoid the constraint.

```ts
// ✅ Generic with constraint
async function fetchResource<T extends { id: string }>(
  url: string,
  schema: z.ZodType<T>
): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return schema.parse(await res.json());
}

// ❌ Losing type information with any
async function fetchResource(url: string): Promise<any> { ... }
```

---

## 7. Error handling

Type your errors. `catch (e)` gives `unknown` in strict mode — narrow it before use.

```ts
// ✅ Narrow the caught error
function parseJson(raw: string): Result<unknown, string> {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown parse error';
    return { ok: false, error: message };
  }
}

type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// ❌ Swallow or rethrow as any
try {
  ...
} catch (e: any) {
  console.error(e.message); // crashes if e isn't an Error
}
```

---

## 8. Server Action types

Server Actions must be explicitly typed. Return a discriminated union so client code can handle both success and error paths.

```ts
// ✅ Typed server action
'use server';

import { z } from 'zod';

const CreatePostInput = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(10),
});

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function createPost(
  input: z.infer<typeof CreatePostInput>
): Promise<ActionResult<{ id: string }>> {
  const parsed = CreatePostInput.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten().fieldErrors.title?.[0] ?? 'Invalid input' };
  }
  // ...db call
  return { success: true, data: { id: 'new-id' } };
}

// ❌ Untyped, throws on validation failure, caller has no error contract
export async function createPost(input: any) {
  const post = await db.post.create({ data: input });
  return post;
}
```
