<!--
  Thanks for contributing to booking-cli!
  Keep PRs focused: one logical change per PR.
  The title MUST follow Conventional Commits, e.g. "feat: add orders preview operation".
-->

## Summary

<!-- What does this change do, and why? Describe the behaviour, not just the diff. -->

## Related issues

<!-- e.g. "Closes #123", "Refs #456". -->

## Type of change

- [ ] `feat` — new user-facing capability
- [ ] `fix` — bug fix
- [ ] `refactor` — no behaviour change
- [ ] `docs` — documentation only
- [ ] `test` — tests only
- [ ] `chore` / `ci` / `perf` — tooling, pipeline, or performance

## Test plan

<!--
  How did you verify this? For behaviour changes, include before/after CLI output.
  Remember: tests must not hit the network — mock `global fetch`.
-->

- [ ] ...

## Checklist

- [ ] PR title follows [Conventional Commits](https://www.conventionalcommits.org/) (`type: description`).
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes (lint clean).
- [ ] `npm run build` succeeds.
- [ ] `npm run test:coverage` passes and coverage did not regress.
- [ ] Docs updated where relevant (README / CONTRIBUTING / `docs/`).
- [ ] No secrets, API keys, affiliate ids, or real booking data in code, tests, or fixtures.
- [ ] No `console.log` — output goes through the `src/cli/output.ts` helpers.
- [ ] Changes respect immutability (no mutation of inputs or shared state).
