# Contributing to better-auth-rate-limiter

Thanks for your interest in contributing! This is a community plugin for [Better Auth](https://www.better-auth.com) and all contributions are welcome — bug reports, feature requests, documentation improvements, and code.

## Prerequisites

- Node.js 18+
- npm or pnpm

## Local Setup

```bash
git clone https://github.com/lutz-grex/better-auth-rate-limiter.git
cd better-auth-rate-limiter
npm install
```

## Development Workflow

| Command | Description |
|---|---|
| `npm test` | Run the test suite (watch mode) |
| `npm run build` | Build the package |
| `npm run typecheck` | Type-check without emitting |
| `npm run coverage` | Run tests with coverage report |

## Project Structure

```
src/
  index.ts          # Plugin entry point & server plugin
  client.ts         # Client-side plugin
  storage.ts        # Storage backends (memory, database, secondary-storage)
  types.ts          # Shared TypeScript types
  error-codes.ts    # Error code constants
test/
  rate-limiter.test.ts  # Integration tests
```

## Submitting a Pull Request

1. Fork the repo and create a branch from `main`.
2. Make your changes, adding tests for any new behaviour.
3. Ensure `npm test` and `npm run typecheck` both pass.
4. Open a PR with a clear description of what changed and why.

## Reporting Issues

Please open an issue at <https://github.com/lutz-grex/better-auth-rate-limiter/issues> and include:

- A minimal reproduction (config snippet + steps to trigger the bug)
- The version of `better-auth-rate-limiter` and `better-auth` you are using
- Node.js version

## Code Style

- TypeScript strict mode is enabled — keep types explicit.
- No default exports from `src/` (named exports only).
- Keep commits focused; one logical change per PR makes review easier.

## License

By contributing you agree that your code will be released under the [MIT License](LICENSE).
