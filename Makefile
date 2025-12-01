SHELL := /bin/bash
NODE ?= node
NPM ?= npm
RUNNER := dist/runAll.js
RUN := $(NODE) $(RUNNER)

.PHONY: install build run dry-run doctor clean-worktrees all

install:
	$(NPM) ci

build: install
	$(NPM) run build

doctor: install
	$(NPM) run doctor

# Run tasks; pass extra flags with ARGS="--tasks-dir .codex/tasks --tasks-glob foo*"
run: build
	@if [ -z "$$CODEX_API_KEY" ] || [ -z "$$CODEX_MODEL" ]; then \
		echo "Set CODEX_API_KEY and CODEX_MODEL before running."; exit 1; \
	fi
	$(RUN) $(ARGS)

dry-run: build
	$(RUN) --dry-run $(ARGS)

clean-worktrees:
	$(NPM) run clean-worktrees -- $(ARGS)

all: run
