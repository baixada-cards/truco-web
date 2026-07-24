.PHONY: check

check:
	pnpm check:dependencies
	pnpm lint
	pnpm lint:css
	pnpm typecheck
	pnpm test:unit
	pnpm build
