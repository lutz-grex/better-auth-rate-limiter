# better-auth-rate-limiter

Rate limiter plugin for [Better Auth](https://www.better-auth.com) — rate limit any application route with memory, database, or Redis-backed storage. Community plugin.

[![npm version](https://img.shields.io/npm/v/better-auth-rate-limiter)](https://www.npmjs.com/package/better-auth-rate-limiter)
[![license](https://img.shields.io/npm/l/better-auth-rate-limiter)](LICENSE)

## Features

- Rate limit any route by IP address, authenticated user, or both
- Three storage backends: in-memory, database, or secondary storage (Redis)
- Per-path custom rules with wildcard pattern support (`*`, `**`)
- Disable rate limiting for specific paths
- Standard HTTP response headers (`X-RateLimit-*`)
- Full TypeScript support

## Installation

```bash
npm install better-auth-rate-limiter
# or
pnpm add better-auth-rate-limiter
```

## Setup

### Server

Add the plugin to your Better Auth instance:

```typescript
import { betterAuth } from "better-auth";
import { rateLimiter } from "better-auth-rate-limiter";

export const auth = betterAuth({
  // ...your config
  plugins: [
    rateLimiter({
      window: 60,      // Time window in seconds (default: 60)
      max: 100,        // Max requests per window (default: 100)
      storage: "memory",    // Storage backend (default: "memory")
      detection: "ip",      // Detection mode (default: "ip")
    }),
  ],
});
```

### Client

```typescript
import { createAuthClient } from "better-auth/client";
import { rateLimiterClient } from "better-auth-rate-limiter/client";

export const authClient = createAuthClient({
  plugins: [rateLimiterClient()],
});
```

## Storage Backends

### Memory (default)

Fast in-process storage. Does not persist across restarts and is not shared between multiple server instances.

```typescript
rateLimiter({
  storage: "memory",
})
```

### Database

Persists rate limit data in your existing Better Auth database. Automatically creates a `rateLimit` table.

```typescript
rateLimiter({
  storage: "database",
})
```

### Secondary Storage (Redis)

Use a Redis-compatible store configured via Better Auth's `secondaryStorage` option.

```typescript
import { betterAuth } from "better-auth";
import { rateLimiter } from "better-auth-rate-limiter";
import { Redis } from "ioredis";

const redis = new Redis();

export const auth = betterAuth({
  secondaryStorage: {
    get: (key) => redis.get(key),
    set: (key, value, ttl) => redis.set(key, value, "EX", ttl ?? 3600),
    delete: (key) => redis.del(key),
  },
  plugins: [
    rateLimiter({
      storage: "secondary-storage",
      window: 60,
      max: 100,
    }),
  ],
});
```

## Detection Modes

### `"ip"` (default)

Rate limit by the client's IP address (respects `x-forwarded-for`).

```typescript
rateLimiter({ detection: "ip" })
```

### `"user"`

Rate limit by authenticated user ID. Unauthenticated requests are not rate limited.

```typescript
rateLimiter({ detection: "user" })
```

### `"ip-and-user"`

Use the authenticated user's ID when available, fall back to IP for unauthenticated requests.

```typescript
rateLimiter({ detection: "ip-and-user" })
```

## Custom Rules

Override the default limits for specific paths. Supports `*` (single segment) and `**` (multi-segment) wildcards.

```typescript
rateLimiter({
  window: 60,
  max: 100,
  customRules: {
    // Stricter limit for login
    "/api/auth/sign-in": { window: 60, max: 5 },

    // Very strict for sign-up
    "/api/auth/sign-up": { window: 3600, max: 3 },

    // Stricter for all AI endpoints
    "/api/ai/*": { window: 60, max: 10 },

    // Even stricter for a specific AI endpoint
    "/api/ai/generate": { window: 3600, max: 5 },

    // Disable rate limiting for health checks
    "/api/health": false,
  },
})
```

## Checking Rate Limits in Routes

Use `auth.api.checkRateLimit()` to enforce rate limits inside your route handlers.

### Next.js Route Handler

```typescript
// src/app/api/some-route/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const result = await auth.api.checkRateLimit({
    headers: request.headers,
    body: { path: request.nextUrl.pathname },
  });

  if (!result.success) {
    return NextResponse.json(
      {
        error: "Too many requests",
        message: result.message,
        retryAfter: result.retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(result.retryAfter),
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  // Your route logic here
  return NextResponse.json({ data: "..." });
}
```

### Reusable Helper

```typescript
// src/lib/rate-limit.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "./auth";

export async function withRateLimit(request: NextRequest) {
  const path = request.nextUrl.pathname;

  const result = await auth.api.checkRateLimit({
    headers: request.headers,
    body: { path },
  });

  if (!result.success) {
    return NextResponse.json(
      {
        error: "Too many requests",
        message: result.message,
        retryAfter: result.retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(result.retryAfter),
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  return { limited: false, ...result };
}
```

## Next.js Middleware

Apply rate limiting globally to all API routes:

```typescript
// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Skip Better Auth's own routes (they are handled separately)
  if (path.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const result = await auth.api.checkRateLimit({
    headers: request.headers,
    body: { path },
  });

  if (!result.success) {
    return NextResponse.json(
      { error: "Too many requests", retryAfter: result.retryAfter },
      {
        status: 429,
        headers: { "Retry-After": String(result.retryAfter) },
      },
    );
  }

  // Attach rate limit info to response headers
  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(result.limit));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  if (result.resetAt) {
    response.headers.set(
      "X-RateLimit-Reset",
      String(Math.ceil(result.resetAt / 1000)), // Unix seconds
    );
  }
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
```

## API Reference

### `RateLimiterOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `window` | `number` | `60` | Time window in seconds |
| `max` | `number` | `100` | Maximum requests per window |
| `storage` | `"memory" \| "database" \| "secondary-storage"` | `"memory"` | Storage backend |
| `detection` | `"ip" \| "user" \| "ip-and-user"` | `"ip"` | How to identify clients |
| `customRules` | `Record<string, { window: number; max: number } \| false>` | — | Per-path rule overrides |

### `CheckRateLimitResponse`

| Field | Type | Description |
|---|---|---|
| `success` | `boolean` | Whether the request is allowed |
| `limit` | `number` | Max requests for this window |
| `remaining` | `number` | Requests remaining in window |
| `retryAfter` | `number \| undefined` | Seconds until the limit resets (only when rate limited) |
| `resetAt` | `number \| undefined` | Unix timestamp (ms) when the window resets |
| `message` | `string \| undefined` | Human-readable error message (only when rate limited) |

## License

MIT
