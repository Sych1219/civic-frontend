# Component Standards for Next.js

## 1. Server vs Client Component decision

Every component defaults to a Server Component in the App Router. Only reach for `'use client'` when you actually need the browser — interactivity, browser APIs, or React hooks that depend on client state. Server Components can fetch data, access the filesystem, and talk to databases without any API layer.

```
Does this component need any of these?
  - onClick, onChange, or other event handlers
  - useState, useReducer, useEffect, useContext
  - Browser-only APIs (localStorage, window, navigator)
  - Third-party libraries that use the above

No  →  Server Component (default, no directive needed)
Yes →  Client Component ('use client' at the top)
```

---

## 2. Push `'use client'` to leaf nodes

The boundary between server and client should be as deep in the tree as possible. Marking a parent `'use client'` converts its entire subtree — including components that didn't need it. Isolate interactivity into small, focused components.

```tsx
// ✅ Only the interactive part is a client component
// app/dashboard/page.tsx  (Server Component — no directive)
import { StatsGrid } from './StatsGrid';
import { FilterBar } from './FilterBar'; // 'use client' lives here

export default async function DashboardPage() {
  const stats = await fetchStats();     // direct DB/API call, no useEffect
  return (
    <main>
      <FilterBar />                     // thin client boundary
      <StatsGrid stats={stats} />       // pure Server Component
    </main>
  );
}

// ❌ Entire page becomes a client component just for one button
'use client';
export default function DashboardPage() {
  const [filter, setFilter] = useState('all');
  // Now fetchStats must move to useEffect + fetch API — unnecessary round trip
}
```

---

## 3. Passing Server data to Client Components

You can pass serializable Server Component data as props into Client Components. What you cannot do is pass functions, class instances, or non-serializable objects.

```tsx
// ✅ Pass serialized data down
// server component
const data = await db.query();
return <Chart data={data} />;  // Chart is 'use client', data is plain JSON

// ✅ Children pattern — wrap a Server Component inside a Client Component
// ClientWrapper.tsx
'use client';
export function ClientWrapper({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div onClick={() => setOpen(!open)}>{children}</div>;
}
// page.tsx (Server Component)
<ClientWrapper>
  <ServerDataComponent />   // still renders on the server
</ClientWrapper>

// ❌ Can't pass a server-only function as a prop to a client component
<Chart formatDate={serverSideFormatDate} />  // serialization error
```

---

## 4. Feature-based directory structure

Organize by feature, not by file type. When a feature grows, everything related to it is in one place.

```
app/
├── (auth)/
│   ├── login/
│   │   ├── page.tsx
│   │   ├── LoginForm.tsx        # 'use client' — handles form state
│   │   └── actions.ts           # server actions
│   └── layout.tsx
├── dashboard/
│   ├── page.tsx                 # Server Component — data fetching
│   ├── DashboardLayout.tsx
│   ├── components/
│   │   ├── StatsCard.tsx        # Server Component
│   │   ├── FilterBar.tsx        # 'use client'
│   │   └── Chart.tsx            # 'use client'
│   └── hooks/
│       └── useFilter.ts         # custom hook (always client-side)
└── shared/
    ├── components/              # truly reusable UI primitives
    └── lib/                     # utilities, helpers
```

```
// ❌ Type-based structure — forces you to hunt across folders for one feature
components/
├── LoginForm.tsx
├── DashboardLayout.tsx
└── StatsCard.tsx
pages/
├── login.tsx
└── dashboard.tsx
hooks/
└── useFilter.ts
```

---

## 5. When to split a component

Split when any of these are true:
- The component exceeds ~150 lines and has distinct visual sections
- A section needs a different rendering strategy (server vs client)
- The same UI pattern appears in 2+ places
- A section has its own data-fetching concern

Don't split for the sake of splitting. A 200-line component with a single coherent responsibility is fine.

```tsx
// ✅ Split because rendering strategies differ
// ProductPage.tsx (Server Component)
export default async function ProductPage({ id }: { id: string }) {
  const product = await getProduct(id);
  return (
    <>
      <ProductDetails product={product} />    {/* Server: static info */}
      <AddToCartButton productId={id} />      {/* Client: cart interaction */}
      <RelatedProducts categoryId={product.categoryId} />  {/* Server: more data */}
    </>
  );
}

// ❌ Premature split — three files for one simple card
// CardHeader.tsx, CardBody.tsx, CardFooter.tsx — just write one Card.tsx
```

---

## 6. Lazy loading Client Components

Use `next/dynamic` for Client Components that are large, below the fold, or only needed on interaction. This keeps the initial JS bundle small.

```tsx
// ✅ Lazy load a heavy chart library
import dynamic from 'next/dynamic';

const HeavyChart = dynamic(() => import('./HeavyChart'), {
  loading: () => <Skeleton className="h-64 w-full" />,
  ssr: false,   // chart libraries often can't run on the server
});

// ✅ Lazy load a modal that only appears on user action
const ConfirmModal = dynamic(() => import('./ConfirmModal'));

// ❌ Statically import a heavy component used only on one interaction
import HeavyChart from './HeavyChart';  // adds ~200kb to every page load
```

---

## 7. `loading.tsx` and `error.tsx`

Place these at the route segment level to get automatic Suspense boundaries and error recovery without any manual setup.

```
app/
└── dashboard/
    ├── page.tsx
    ├── loading.tsx     # shown while page.tsx's async operations are pending
    └── error.tsx       # shown if page.tsx throws (must be 'use client')
```

```tsx
// ✅ loading.tsx — colocated skeleton
export default function DashboardLoading() {
  return <DashboardSkeleton />;
}

// ✅ error.tsx — must be 'use client' to use reset()
'use client';
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div>
      <p>Failed to load dashboard: {error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}

// ❌ Manual Suspense in page.tsx when loading.tsx would do the job
export default function Page() {
  return (
    <Suspense fallback={<Spinner />}>  {/* redundant if loading.tsx exists */}
      <Dashboard />
    </Suspense>
  );
}
```

---

## 8. Avoid prop drilling — use React Context sparingly

Pass data through Context only for truly cross-cutting concerns (theme, auth state, locale). For feature-local state shared between a few components, prefer passing props or colocating state.

```tsx
// ✅ Context for auth state — genuinely global
// providers/AuthProvider.tsx
'use client';
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children, initialUser }: {
  children: React.ReactNode;
  initialUser: User | null;
}) {
  const [user, setUser] = useState(initialUser);
  return <AuthContext.Provider value={{ user, setUser }}>{children}</AuthContext.Provider>;
}

// ❌ Context for a single feature's filter state — just lift it to the parent
const FilterContext = createContext<FilterState | null>(null);
```
