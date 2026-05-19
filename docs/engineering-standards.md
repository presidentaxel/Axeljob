# Engineering Standards

## Quick Navigation

1. Goals
2. Definition of Done
3. Python Standards
4. Frontend Standards
5. Testing Pyramid
6. Release Process

## Goals

- Keep delivery predictable for a team.
- Reduce regressions with automated checks.
- Keep security and operability as default behavior.

> [!NOTE]
> `docs/guide-bonnes-pratiques.md` is the repository-level source of truth for coding and review conventions.

## Definition of Done

A change is done when:

1. Code is linted and formatted.
2. Tests pass locally and in CI.
3. Documentation is updated if behavior changed.
4. Security-sensitive changes include risk notes.
5. Environment and operational command changes are documented.
6. Conformity checklist is updated in `docs/conformity-audit.md`.

## Python Standards

- Use `.venv` for all local Python tooling.
- Run `ruff`, `black`, and `mypy` on backend code.
- Prefer small modules over oversized entry files.
- Add unit tests for business logic and validation.

## Frontend Standards

- Keep components focused and composable.
- Avoid hidden side effects in component render paths.
- Enforce ESLint rules and fix warnings proactively.
- Add e2e coverage for critical user journeys.

## Testing Pyramid (project target)

- Unit tests: core logic and utilities.
- Integration tests: API contracts and storage interactions.
- E2E tests: login, adaptation, PDF, export, payment path.

## Release Process

- PR review required.
- CI green required.
- Security workflow green required (`security.yml`).
- Merge to `main` triggers deploy workflow (or manual release gate).
- Rollback procedure documented in deployment docs.
