# Codex Cloud delivery instructions

These instructions apply to the entire repository.

After every requested code fix, Codex must complete this delivery workflow:

1. Run all tests, builds, linters, type checks, and other required checks relevant to the changed code.
2. If any required check fails, stop. Report the failure, but do not commit, push, publish, open a pull request, or enable auto-merge.
3. If every required check passes, create a new, unique branch whose name starts with `codex/`. Never reuse a delivery branch and never push directly to `main`.
4. Review the working tree and commit only the intended changes for the request. Do not include unrelated, generated, secret, credential, or local-environment files.
5. Run `gh auth setup-git`, then push the `codex/` branch to the GitHub remote.
6. Create a pull request targeting `main` with an accurate title and body that summarize the change and list the checks run.
7. Enable squash auto-merge for the pull request and request automatic deletion of its branch after merge.
8. Report the pull request URL and its merge/deployment status. If required checks, repository rules, or deployment gates are still pending, report that status accurately rather than claiming completion.

Security and repository rules:

- Never print, echo, log, paste, or otherwise expose `GH_TOKEN` or any other credential.
- Authentication checks may use `gh auth status`; do not use commands that display token values.
- Never commit credentials or secrets.
- Never push directly to `main`; all delivery changes must go through a pull request from a unique `codex/` branch.
