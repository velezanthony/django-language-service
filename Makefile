# ─────────────────────────────────────────────────────────────────────────────
# django-language-service — task runner
#
# Thin, self-documenting wrapper over the npm scripts in package.json.
# Run `make` (or `make help`) to list every target grouped by category.
# ─────────────────────────────────────────────────────────────────────────────

.DEFAULT_GOAL := help
SHELL := bash

# Build artifacts removed by `make clean` (all git-ignored).
ARTIFACTS := dist out .vscode-test

.PHONY: help install \
        watch css \
        compile build \
        check-types check-svelte check \
        test test-watch test-integration \
        verify \
        vsix \
        clean

##@ General

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} \
		/^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 } \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(MAKEFILE_LIST)

##@ Setup

install: ## Install dependencies
	npm install

##@ Development

watch: ## Rebuild extension + webviews on change (esbuild --watch). Note: does NOT regen CSS — run `make css` after style changes.
	npm run watch

css: ## Build the diagram/sidebar Tailwind CSS (dev, unminified)
	npm run build:css

##@ Build

compile: ## One-off dev build (esbuild, with sourcemaps)
	npm run compile

build: ## Production build — type-check + minified CSS + minified bundles
	npm run package

##@ Quality

check-types: ## Type-check extension + webview (tsc --noEmit)
	npm run check-types

check-svelte: ## Type-check Svelte components (svelte-check)
	npm run check-svelte

check: check-types check-svelte ## Run every type-check (TS + Svelte)

##@ Testing

test: ## Run unit tests once (vitest)
	npm run test

test-watch: ## Run unit tests in watch mode
	npm run test:watch

test-integration: ## Run the VS Code integration suite (compiles first, launches Electron)
	npm run test:integration

##@ Verify

verify: check test ## Pre-commit gate: all type-checks + unit tests

##@ Package

vsix: ## Package the extension into a .vsix (production build runs via vscode:prepublish)
	npx @vscode/vsce package

##@ Housekeeping

clean: ## Remove build artifacts (dist, out, .vscode-test)
	rm -rf $(ARTIFACTS)
