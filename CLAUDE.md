# Operating Conventions

This repo is built phase by phase. These conventions apply throughout.

## Git authorship

- Commits are made directly with `git commit -m "..."`. Do not ask for confirmation per commit.
- Do NOT add "Co-authored-by: Claude" or any AI signature to commit messages.
- Do NOT add emojis to commits.
- Do NOT add footer signatures.
- Author identity stays as the locally configured git user.

## Commit messages

- Conventional Commits format: `type(scope): description`
- Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`
- Scopes are defined per phase in the corresponding spec.
- English, present tense, lowercase, no trailing period
- Single line, max 72 characters
- No extended body unless the decision is non-obvious

## Branch and PR policy

Every phase ends with a PR opened against `main`. The flow is:

1. At the start of a phase, create branch `phase-N-{name}` (name per spec) from latest `main`.
2. Implement following the phase spec, with granular commits.
3. When all acceptance criteria from the spec are verified locally, push the branch:
```
   git push -u origin phase-N-{name}
```
4. Open the PR via `gh` CLI:
```
   gh pr create --base main --head phase-N-{name} \
     --title "Phase N: <title from spec>" \
     --body "<acceptance criteria checklist + notes>"
```
5. Report the PR URL.
6. Do NOT merge. The user merges manually after review.

If `main` does not exist on the remote yet (only happens at Phase 0 bootstrap), create it as an empty commit before opening the PR. After that, `main` always exists.

Force-pushing to `main` is forbidden after Phase 0 bootstrap. Force-pushing to feature branches is allowed only for amending commits during the same phase, never after a PR is opened.

## End-of-phase behavior

- Run `npm test`, `npm run lint`, `npm run build`, `npm run typecheck` and verify all green.
- Verify acceptance criteria from the corresponding phase spec.
- Push the branch and open the PR (per the policy above).
- Communicate "Phase N complete, PR opened: <URL>", list acceptance criteria with checkmarks, then stop.
- Do NOT start the next phase on your own.
- Do NOT merge the PR.

## Out-of-scope rejections

- If the phase spec doesn't list a feature, do not add it.
- If the user asks for a feature not in the spec, ask whether it should be added to the current phase or deferred.

## Spec inconsistencies

- If the phase spec is internally inconsistent or impossible to satisfy as written, stop and report before writing code.
- Do not improvise around inconsistencies. The spec is the source of truth; if it's wrong, the user updates it.
