import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
import { rateLimiter } from "../src";

describe("rate-limiter plugin", () => {
	describe("basic rate limiting", () => {
		it("should allow requests under the limit", async () => {
			const { auth } = await getTestInstance({
				plugins: [rateLimiter({ window: 60, max: 5, storage: "memory" })],
			});

			const result = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "1.2.3.4" }),
				body: { path: "/api/test" },
			});

			expect(result.success).toBe(true);
			expect(result.limit).toBe(5);
			expect(result.remaining).toBe(4);
		});

		it("should rate limit after exceeding max requests", async () => {
			const { auth } = await getTestInstance({
				plugins: [rateLimiter({ window: 60, max: 3, storage: "memory" })],
			});

			for (let i = 0; i < 3; i++) {
				const result = await auth.api.checkRateLimit({
					headers: new Headers({ "x-forwarded-for": "10.0.0.1" }),
					body: { path: "/api/limited" },
				});
				expect(result.success).toBe(true);
			}

			const result = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.1" }),
				body: { path: "/api/limited" },
			});
			expect(result.success).toBe(false);
			expect(result.remaining).toBe(0);
			expect(result.retryAfter).toBeGreaterThan(0);
			expect(result.message).toBeDefined();
		});

		it("should track different IPs independently", async () => {
			const { auth } = await getTestInstance({
				plugins: [rateLimiter({ window: 60, max: 1, storage: "memory" })],
			});

			const r1 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.10" }),
				body: { path: "/api/per-ip" },
			});
			expect(r1.success).toBe(true);

			const r2 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.11" }),
				body: { path: "/api/per-ip" },
			});
			expect(r2.success).toBe(true);

			// First IP should now be limited
			const r3 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.10" }),
				body: { path: "/api/per-ip" },
			});
			expect(r3.success).toBe(false);
		});

		it("should track different paths independently", async () => {
			const { auth } = await getTestInstance({
				plugins: [rateLimiter({ window: 60, max: 1, storage: "memory" })],
			});

			const r1 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.20" }),
				body: { path: "/api/path-a" },
			});
			expect(r1.success).toBe(true);

			const r2 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.20" }),
				body: { path: "/api/path-b" },
			});
			expect(r2.success).toBe(true);
		});

		it("should return remaining count correctly", async () => {
			const { auth } = await getTestInstance({
				plugins: [rateLimiter({ window: 60, max: 3, storage: "memory" })],
			});

			const r1 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.90" }),
				body: { path: "/api/remaining" },
			});
			expect(r1.remaining).toBe(2);

			const r2 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.90" }),
				body: { path: "/api/remaining" },
			});
			expect(r2.remaining).toBe(1);

			const r3 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.90" }),
				body: { path: "/api/remaining" },
			});
			expect(r3.remaining).toBe(0);
		});
	});

	describe("custom rules", () => {
		it("should apply custom rules for matching paths", async () => {
			const { auth } = await getTestInstance({
				plugins: [
					rateLimiter({
						window: 60,
						max: 100,
						storage: "memory",
						customRules: {
							"/api/strict": { window: 60, max: 1 },
						},
					}),
				],
			});

			const r1 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.30" }),
				body: { path: "/api/strict" },
			});
			expect(r1.success).toBe(true);
			expect(r1.limit).toBe(1);

			const r2 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.30" }),
				body: { path: "/api/strict" },
			});
			expect(r2.success).toBe(false);
		});

		it("should support wildcard patterns in custom rules", async () => {
			const { auth } = await getTestInstance({
				plugins: [
					rateLimiter({
						window: 60,
						max: 100,
						storage: "memory",
						customRules: {
							"/api/ai/*": { window: 60, max: 2 },
						},
					}),
				],
			});

			const r1 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.40" }),
				body: { path: "/api/ai/chat" },
			});
			expect(r1.success).toBe(true);
			expect(r1.limit).toBe(2);
		});

		it("should disable rate limiting when custom rule is false", async () => {
			const { auth } = await getTestInstance({
				plugins: [
					rateLimiter({
						window: 60,
						max: 1,
						storage: "memory",
						customRules: {
							"/api/health": false,
						},
					}),
				],
			});

			for (let i = 0; i < 5; i++) {
				const result = await auth.api.checkRateLimit({
					headers: new Headers({ "x-forwarded-for": "10.0.0.50" }),
					body: { path: "/api/health" },
				});
				expect(result.success).toBe(true);
			}
		});

		it("should use default limit for paths without custom rules", async () => {
			const { auth } = await getTestInstance({
				plugins: [
					rateLimiter({
						window: 60,
						max: 50,
						storage: "memory",
						customRules: {
							"/api/strict": { window: 60, max: 1 },
						},
					}),
				],
			});

			const result = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.55" }),
				body: { path: "/api/other" },
			});
			expect(result.limit).toBe(50);
		});
	});

	describe("default configuration", () => {
		it("should use default window=60 and max=100 when no options provided", async () => {
			const { auth } = await getTestInstance({
				plugins: [rateLimiter()],
			});

			const result = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.70" }),
				body: { path: "/api/defaults" },
			});
			expect(result.success).toBe(true);
			expect(result.limit).toBe(100);
			expect(result.remaining).toBe(99);
		});
	});

	describe("window expiry", () => {
		it("should reset counter after window expires", async () => {
			vi.useFakeTimers();

			const { auth } = await getTestInstance({
				plugins: [rateLimiter({ window: 10, max: 1, storage: "memory" })],
			});

			const r1 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.80" }),
				body: { path: "/api/expiry" },
			});
			expect(r1.success).toBe(true);

			const r2 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.80" }),
				body: { path: "/api/expiry" },
			});
			expect(r2.success).toBe(false);

			// Advance time past the window
			vi.advanceTimersByTime(11_000);

			const r3 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.80" }),
				body: { path: "/api/expiry" },
			});
			expect(r3.success).toBe(true);

			vi.useRealTimers();
		});
	});

	describe("fixed window behavior", () => {
		it("should not slide resetAt forward within a window", async () => {
			vi.useFakeTimers();

			const { auth } = await getTestInstance({
				plugins: [rateLimiter({ window: 60, max: 5, storage: "memory" })],
			});

			const r1 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.220" }),
				body: { path: "/api/fixed-window" },
			});
			const firstResetAt = r1.resetAt;
			expect(firstResetAt).toBeDefined();

			vi.advanceTimersByTime(5_000);

			const r2 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.220" }),
				body: { path: "/api/fixed-window" },
			});
			expect(r2.resetAt).toBe(firstResetAt);

			vi.useRealTimers();
		});
	});

	describe("user-based detection", () => {
		it("should rate limit by user ID when detection is 'user'", async () => {
			const { auth, signInWithTestUser } = await getTestInstance({
				plugins: [
					rateLimiter({
						window: 60,
						max: 2,
						storage: "memory",
						detection: "user",
					}),
				],
			});

			const { headers } = await signInWithTestUser();

			const r1 = await auth.api.checkRateLimit({
				headers,
				body: { path: "/api/user-endpoint" },
			});
			expect(r1.success).toBe(true);
			expect(r1.remaining).toBe(1);

			const r2 = await auth.api.checkRateLimit({
				headers,
				body: { path: "/api/user-endpoint" },
			});
			expect(r2.success).toBe(true);

			const r3 = await auth.api.checkRateLimit({
				headers,
				body: { path: "/api/user-endpoint" },
			});
			expect(r3.success).toBe(false);
		});

		it("should skip rate limiting for unauthenticated requests when detection is 'user'", async () => {
			const { auth } = await getTestInstance({
				plugins: [
					rateLimiter({
						window: 60,
						max: 1,
						storage: "memory",
						detection: "user",
					}),
				],
			});

			// No session cookie — should not be rate limited
			for (let i = 0; i < 5; i++) {
				const result = await auth.api.checkRateLimit({
					headers: new Headers({ "x-forwarded-for": "10.0.0.100" }),
					body: { path: "/api/user-only" },
				});
				expect(result.success).toBe(true);
			}
		});

		it("should use user ID for authenticated and IP for unauthenticated when detection is 'ip-and-user'", async () => {
			const { auth, signInWithTestUser } = await getTestInstance({
				plugins: [
					rateLimiter({
						window: 60,
						max: 1,
						storage: "memory",
						detection: "ip-and-user",
					}),
				],
			});

			const { headers } = await signInWithTestUser();

			// Authenticated user — rate limited by user ID
			const r1 = await auth.api.checkRateLimit({
				headers,
				body: { path: "/api/mixed" },
			});
			expect(r1.success).toBe(true);

			const r2 = await auth.api.checkRateLimit({
				headers,
				body: { path: "/api/mixed" },
			});
			expect(r2.success).toBe(false);

			// Unauthenticated request with different IP — falls back to IP,
			// should be tracked independently from the user
			const r3 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.101" }),
				body: { path: "/api/mixed" },
			});
			expect(r3.success).toBe(true);
		});

		it("should track different users independently", async () => {
			const { auth, signInWithTestUser, signInWithUser, client } =
				await getTestInstance({
					plugins: [
						rateLimiter({
							window: 60,
							max: 1,
							storage: "memory",
							detection: "user",
						}),
					],
				});

			// Sign up a second user
			await client.signUp.email({
				email: "user2@test.com",
				password: "password123",
				name: "User Two",
			});

			const { headers: headers1 } = await signInWithTestUser();
			const { headers: headers2 } = await signInWithUser(
				"user2@test.com",
				"password123",
			);

			// First user hits the limit
			const r1 = await auth.api.checkRateLimit({
				headers: headers1,
				body: { path: "/api/per-user" },
			});
			expect(r1.success).toBe(true);

			const r2 = await auth.api.checkRateLimit({
				headers: headers1,
				body: { path: "/api/per-user" },
			});
			expect(r2.success).toBe(false);

			// Second user should still have quota
			const r3 = await auth.api.checkRateLimit({
				headers: headers2,
				body: { path: "/api/per-user" },
			});
			expect(r3.success).toBe(true);
		});
	});

	describe("response shape", () => {
		it("should include resetAt in response", async () => {
			const { auth } = await getTestInstance({
				plugins: [rateLimiter({ window: 60, max: 5, storage: "memory" })],
			});

			const result = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.85" }),
				body: { path: "/api/shape" },
			});
			expect(result.resetAt).toBeDefined();
			expect(result.resetAt).toBeGreaterThan(Date.now());
		});

		it("should include retryAfter and resetAt when rate limited", async () => {
			const { auth } = await getTestInstance({
				plugins: [rateLimiter({ window: 60, max: 1, storage: "memory" })],
			});

			await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.86" }),
				body: { path: "/api/shape-limited" },
			});

			const result = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.86" }),
				body: { path: "/api/shape-limited" },
			});
			expect(result.success).toBe(false);
			expect(result.retryAfter).toBeDefined();
			expect(result.retryAfter).toBeGreaterThan(0);
			expect(result.resetAt).toBeDefined();
		});
	});

	describe("database storage", () => {
		it("should rate limit using database storage", async () => {
			const { auth } = await getTestInstance({
				plugins: [rateLimiter({ window: 60, max: 2, storage: "database" })],
			});

			const r1 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.200" }),
				body: { path: "/api/db-test" },
			});
			expect(r1.success).toBe(true);
			expect(r1.remaining).toBe(1);

			const r2 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.200" }),
				body: { path: "/api/db-test" },
			});
			expect(r2.success).toBe(true);

			const r3 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.200" }),
				body: { path: "/api/db-test" },
			});
			expect(r3.success).toBe(false);
		});
	});

	describe("secondary-storage", () => {
		it("should rate limit using secondary storage", async () => {
			const store = new Map<string, { value: string; expiresAt: number }>();
			const { auth } = await getTestInstance({
				secondaryStorage: {
					get: async (key) => {
						const entry = store.get(key);
						if (!entry) return null;
						if (Date.now() >= entry.expiresAt) {
							store.delete(key);
							return null;
						}
						return entry.value;
					},
					set: async (key, value, ttl) => {
						store.set(key, {
							value: value as string,
							expiresAt: Date.now() + (ttl ?? 60) * 1000,
						});
					},
					delete: async (key) => {
						store.delete(key);
					},
				},
				plugins: [
					rateLimiter({ window: 60, max: 2, storage: "secondary-storage" }),
				],
			});

			const r1 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.210" }),
				body: { path: "/api/ss-test" },
			});
			expect(r1.success).toBe(true);
			expect(r1.remaining).toBe(1);

			const r2 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.210" }),
				body: { path: "/api/ss-test" },
			});
			expect(r2.success).toBe(true);

			const r3 = await auth.api.checkRateLimit({
				headers: new Headers({ "x-forwarded-for": "10.0.0.210" }),
				body: { path: "/api/ss-test" },
			});
			expect(r3.success).toBe(false);
		});
	});
});
