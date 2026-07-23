.PHONY: check

check:
	pnpm lint
	pnpm lint:css
	pnpm typecheck
	pnpm test:unit
	pnpm build
