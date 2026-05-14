---
name: nextjs-engineering
description: Next.js engineering quality standards for TypeScript, components, and environment variables. Trigger this skill whenever the user is writing .ts/.tsx files, discussing Server/Client Component boundaries, working with process.env or NEXT_PUBLIC_ variables, defining TypeScript interfaces or Zod schemas, splitting/refactoring components, designing directory structure, or conducting code review in a Next.js project. Use this skill proactively — if the user is doing anything Next.js-related, this skill almost certainly applies.
---

# Next.js Engineering Standards

This skill enforces three engineering pillars in Next.js projects. Read the relevant reference file(s) for the current task — each is self-contained with ✅/❌ examples.

## When to load each reference

| Situation | Load |
|---|---|
| TypeScript types, interfaces, generics, Zod, `unknown` vs `any`, error handling | `references/typescript.md` |
| Server vs Client Components, `'use client'`, directory structure, component splitting, `loading.tsx` / `error.tsx` | `references/components.md` |
| `NEXT_PUBLIC_` prefixes, `.env` file hierarchy, `lib/env.ts`, env validation | `references/env.md` |

Load **all three** for architectural reviews or greenfield setup.

## Core principles (always apply)

1. **TypeScript strict mode** — no `any`, validate at boundaries with Zod.
2. **Minimize the client bundle** — push `'use client'` to leaf nodes; default to Server Components.
3. **Fail fast on bad config** — validate env vars at startup, never at runtime.

## Output format

Always show both ✅ correct and ❌ incorrect patterns with full TypeScript code examples. Explain *why* the correct approach matters, not just what it is.

---

Read the relevant reference file now before generating any code or advice.
