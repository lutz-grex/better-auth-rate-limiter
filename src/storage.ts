import type { AuthContext } from "@better-auth/core";
import type { RateLimitEntry } from "./types";

export interface RateLimitStorage {
	get(key: string): Promise<RateLimitEntry | null>;
	set(key: string, value: RateLimitEntry, update?: boolean): Promise<void>;
}

interface MemoryEntry {
	data: RateLimitEntry;
	expiresAt: number;
}

export function createMemoryStorage(defaultWindow: number): RateLimitStorage {
	const memory = new Map<string, MemoryEntry>();
	return {
		async get(key) {
			const entry = memory.get(key);
			if (!entry) {
				return null;
			}
			if (Date.now() >= entry.expiresAt) {
				memory.delete(key);
				return null;
			}
			return entry.data;
		},
		async set(key, value) {
			const expiresAt = Date.now() + defaultWindow * 1000;
			memory.set(key, { data: value, expiresAt });
		},
	};
}

export function createSecondaryStorageWrapper(
	ctx: AuthContext,
	defaultWindow: number,
): RateLimitStorage {
	return {
		async get(key) {
			const data = await ctx.options.secondaryStorage?.get(key);
			if (!data || typeof data !== "string") {
				return null;
			}
			try {
				return JSON.parse(data) as RateLimitEntry;
			} catch {
				return null;
			}
		},
		async set(key, value) {
			await ctx.options.secondaryStorage?.set?.(
				key,
				JSON.stringify(value),
				defaultWindow,
			);
		},
	};
}

export function createDatabaseStorage(ctx: AuthContext): RateLimitStorage {
	const model = "rateLimit";
	const db = ctx.adapter;
	return {
		async get(key) {
			const res = await db.findMany<RateLimitEntry>({
				model,
				where: [{ field: "key", value: key }],
			});
			const data = res[0];
			if (!data) {
				return null;
			}
			if (typeof data.lastRequest === "bigint") {
				data.lastRequest = Number(data.lastRequest);
			}
			return data;
		},
		async set(key, value, update) {
			try {
				if (update) {
					await db.updateMany({
						model,
						where: [{ field: "key", value: key }],
						update: {
							count: value.count,
							lastRequest: value.lastRequest,
						},
					});
				} else {
					await db.create({
						model,
						data: {
							key,
							count: value.count,
							lastRequest: value.lastRequest,
						},
					});
				}
			} catch (e) {
				ctx.logger.error("Error setting rate limit", e);
			}
		},
	};
}
