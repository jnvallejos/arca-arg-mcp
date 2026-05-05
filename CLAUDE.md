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
- Scopes per project (Phase 0): `repo`, `ci`, `tools`, `docs`
- English, present tense, lowercase, no trailing period
- Single line, max 72 characters
- No extended body unless the decision is non-obvious

## Push policy

- Do NOT push automatically.
- The repo owner pushes manually after verifying build and tests pass locally.

## End-of-phase behavior

- Run `npm test`, `npm run lint`, `npm run build` and verify all green.
- Verify acceptance criteria from the corresponding phase spec.
- Communicate "Phase N complete", list acceptance criteria with checkmarks, then stop.
- Do NOT start the next phase on your own.

## Out-of-scope rejections

- If the phase spec doesn't list a feature, do not add it.
- If the user asks for a feature not in the spec, ask whether it should be added to the current phase or deferred.
