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
	@$(NODE) scripts/doctor.js
	$(RUN) $(ARGS)

dry-run: build
	$(RUN) --dry-run $(ARGS)

clean-worktrees:
	$(NPM) run clean-worktrees -- $(ARGS)

all: run
