import { createAuthEndpoint } from "@better-auth/core/api";
import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import type { BetterAuthPlugin, GenericEndpointContext } from "better-auth";
import { getIp, getSessionFromCtx } from "better-auth/api";
import * as z from "zod/v4";
import { RATE_LIMITER_ERROR_CODES } from "./error-codes";
import type { RateLimitStorage } from "./storage";
import {
	createDatabaseStorage,
	createMemoryStorage,
	createSecondaryStorageWrapper,
} from "./storage";
import type {
	CheckRateLimitResponse,
	RateLimitEntry,
	RateLimiterOptions,
	RateLimitRule,
} from "./types";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"rate-limiter": {
			creator: typeof rateLimiter;
		};
	}
}

const rateLimitSchema = {
	rateLimit: {
		fields: {
			key: {
				type: "string",
				unique: true,
				required: true,
			},
			count: {
				type: "number",
				required: true,
			},
			lastRequest: {
				type: "number",
				bigint: true,
				required: true,
				defaultValue: () => Date.now(),
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;

function matchPath(
	pattern: string,
	path: string,
	cache: Map<string, RegExp>,
): boolean {
	if (!pattern.includes("*")) {
		return pattern === path;
	}
	let regex = cache.get(pattern);
	if (!regex) {
		const regexStr = pattern
			.split("**")
			.map((segment) =>
				segment
					.split("*")
					.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
					.join("[^/]*"),
			)
			.join(".*");
		regex = new RegExp(`^${regexStr}$`);
		cache.set(pattern, regex);
	}
	return regex.test(path);
}

function shouldRateLimit(
	max: number,
	window: number,
	data: RateLimitEntry,
): boolean {
	const now = Date.now();
	const windowMs = window * 1000;
	const timeSinceLastRequest = now - data.lastRequest;
	return timeSinceLastRequest < windowMs && data.count >= max;
}

function getRetryAfter(lastRequest: number, window: number): number {
	const now = Date.now();
	const windowMs = window * 1000;
	return Math.ceil((lastRequest + windowMs - now) / 1000);
}

function findMatchingRule(
	path: string,
	customRules: Record<string, RateLimitRule | false> | undefined,
	cache: Map<string, RegExp>,
): RateLimitRule | false | undefined {
	if (!customRules) {
		return undefined;
	}
	const matchedKey = Object.keys(customRules).find((pattern) => {
		return matchPath(pattern, path, cache);
	});
	if (matchedKey !== undefined) {
		return customRules[matchedKey];
	}
	return undefined;
}

async function resolveIdentifier(
	ctx: GenericEndpointContext,
	detection: "ip" | "user" | "ip-and-user",
	path: string,
): Promise<string | null> {
	if (detection === "user" || detection === "ip-and-user") {
		const session = await getSessionFromCtx(ctx).catch(() => null);
		if (session) {
			return `user:${session.user.id}|${path}`;
		}
		if (detection === "user") {
			return null;
		}
	}

	const ip = getIp(ctx.request ?? ctx.headers!, ctx.context.options);
	if (!ip) {
		return null;
	}
	return `${ip}|${path}`;
}

export const rateLimiter = (options?: RateLimiterOptions) => {
	const defaultWindow = options?.window ?? 60;
	const defaultMax = options?.max ?? 100;
	const storageType = options?.storage ?? "memory";
	const customRules = options?.customRules;
	const detection = options?.detection ?? "ip";

	let storage: RateLimitStorage =
		storageType === "memory"
			? createMemoryStorage(defaultWindow)
			: (null as unknown as RateLimitStorage);

	const patternCache = new Map<string, RegExp>();

	return {
		id: "rate-limiter" as const,
		...(storageType === "database" ? { schema: rateLimitSchema } : {}),
		init(ctx) {
			if (
				storageType === "secondary-storage" &&
				!ctx.options.secondaryStorage
			) {
				ctx.logger.error(
					'Rate limiter plugin is configured with storage: "secondary-storage" ' +
						"but no secondaryStorage is configured in the auth options.",
				);
			}
			if (storageType === "database") {
				storage = createDatabaseStorage(ctx);
			} else if (storageType === "secondary-storage") {
				storage = createSecondaryStorageWrapper(ctx, defaultWindow);
			}
		},
		endpoints: {
			checkRateLimit: createAuthEndpoint(
				"/rate-limiter/check",
				{
					method: "POST",
					body: z.object({
						path: z.string(),
					}),
					metadata: {
						openapi: {
							operationId: "checkRateLimit",
							description:
								"Check rate limit for a given path. Returns whether the request is allowed and remaining quota.",
						},
					},
				},
				async (ctx): Promise<CheckRateLimitResponse> => {
					const path = ctx.body.path;

					const rule = findMatchingRule(path, customRules, patternCache);

					if (rule === false) {
						return {
							success: true,
							limit: 0,
							remaining: 0,
						};
					}

					const currentWindow = rule?.window ?? defaultWindow;
					const currentMax = rule?.max ?? defaultMax;
					const windowMs = currentWindow * 1000;

					const identifier = await resolveIdentifier(
						ctx as GenericEndpointContext,
						detection,
						path,
					);

					if (!identifier) {
						return {
							success: true,
							limit: currentMax,
							remaining: currentMax,
						};
					}

					const storageKey = `rl:${identifier}`;
					const data = await storage.get(storageKey);
					const now = Date.now();

					if (data && shouldRateLimit(currentMax, currentWindow, data)) {
						const retryAfter = getRetryAfter(data.lastRequest, currentWindow);
						return {
							success: false,
							limit: currentMax,
							remaining: 0,
							retryAfter,
							resetAt: data.lastRequest + windowMs,
							message: RATE_LIMITER_ERROR_CODES.RATE_LIMITED.message,
						};
					}

					if (!data) {
						await storage.set(storageKey, {
							key: storageKey,
							count: 1,
							lastRequest: now,
						});
						return {
							success: true,
							limit: currentMax,
							remaining: currentMax - 1,
							resetAt: now + windowMs,
						};
					}

					const timeSinceLastRequest = now - data.lastRequest;

					if (timeSinceLastRequest > windowMs) {
						await storage.set(
							storageKey,
							{ ...data, count: 1, lastRequest: now },
							true,
						);
						return {
							success: true,
							limit: currentMax,
							remaining: currentMax - 1,
							resetAt: now + windowMs,
						};
					}

					const newCount = data.count + 1;
					await storage.set(storageKey, { ...data, count: newCount }, true);

					return {
						success: true,
						limit: currentMax,
						remaining: Math.max(0, currentMax - newCount),
						resetAt: data.lastRequest + windowMs,
					};
				},
			),
		},
		$ERROR_CODES: RATE_LIMITER_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};

export type RateLimiterPlugin = ReturnType<typeof rateLimiter>;
export { RATE_LIMITER_ERROR_CODES } from "./error-codes";
export type * from "./types";
