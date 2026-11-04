# AGENTS.md

Working rules for contributors and coding agents in this repository. They restate the
Paseo plugin requirements we must follow when developing, reviewing, and releasing.

## References

- Plugin quickstart: https://paseo.sh/docs/plugins
- Plugin reference: https://paseo.sh/docs/plugins/reference
- Publishing guide: https://paseo.sh/docs/plugins/publishing
- Registry review policy: https://github.com/getpaseo/plugins/blob/main/REVIEW.md

## Compliance

- Keep the standard plugin layout: `paseo-plugin.json`, `index.client.tsx`,
  `index.server.ts`, `client/`, `server/`, `shared/`.
- Manifest paths are relative, use forward slashes, and must not contain `..` segments.
  Keep `requirements.paseo` accurate and the listed entry files present.
- Follow the plugin SDK contracts: client code must not reach into daemon-only APIs, and
  daemon code must not depend on the UI. Keep RPC contracts schema-validated.
- Dependencies must stay minimal. This plugin uses Paseo host libraries and development
  dependencies only; if a runtime dependency or install/build step is added, commit a
  synchronized lockfile and document the command.
- Registry review reads the pinned artifact without executing it; everything needed to
  understand the plugin must be inside the repository.

## Security

- Never print, echo, log, quote, or otherwise output the configured MCP URL or any token,
  not in UI text, agent prompts, tool output, errors, or documentation. The URL normally
  contains a personal access token and Paseo logs are readable by connected users.
- The MCP URL comes from plugin settings and is sent only to the configured AutoWonder
  endpoint. Do not add telemetry or undisclosed network calls.
- Document downloads may run the AutoWonder CLI through `npx`. This requires
  explicit user consent, a validated package version, sanitized output, and disclosure in
  `OVERVIEW.md`. Declining consent must leave the CLI uninstalled.
- All write operations require an explicit user gesture; destructive operations require
  a visible confirmation. No `eval` of dynamic or remote code, and no shell command built
  from external data.

## Data sanitization

- Everything committed must be desensitized: no real names, account handles, workspace or
  item IDs, tokens, cookies, internal hostnames, personal paths, phone numbers, email
  addresses, or customer data in code, comments, docs, fixtures, examples, screenshots, or
  commit messages.
- Use obvious placeholders such as `<workspace-id>`, `<token>`, `example.com`, `12345678`.
- Screenshots and other media must use sample data and be reviewed for private details
  before they are committed. Never commit metadata or screenshots that reveal a real MCP
  URL or account identity.

## Data access

- Workitem polling is read-only, scoped to `mineScope: "COMMENTED"` (我参与的), and
  bounded. Keep the documented interval, per-status cap, and workspace scope accurate.
- The MCP API does not provide a human member directory. Do not guess human names or build
  mappings from IDs; show agent identifiers as `name #id` and leave human assignment as an
  explicit user ID.
- Error messages must remain useful without echoing credentials, request bodies, or raw
  sensitive responses.

## Keeping docs in sync

Feature changes must update the user-facing documents in the same change:

- `README.md`: feature list, setup, and development notes.
- `OVERVIEW.md` and `OVERVIEW.zh-CN.md`: capabilities, settings, permissions, data access,
  runtime downloads, and limitations.
- `paseo-plugin.json`: English default name and description, translations, media, icon,
  and requirements.

A release is not ready while these documents still describe older behavior.

## Review before release

Run the review from a clean working tree and treat it as a release gate. Do not publish
while any item below is unresolved.

Review these dimensions explicitly:

1. **Repository rules and SDK contracts.** Check the manifest, entrypoints, import
   boundaries, RPC schemas, settings migration, runtime dependencies, and mobile/native
   compatibility against the current Paseo docs.
2. **Design.** Keep changes in the existing module boundaries. Report oversized files or
   duplicated logic as follow-up work, but do not mix unrelated refactors into a release.
3. **Runtime internationalization.** Every user-facing label, button, status, placeholder,
   modal title, empty state, validation message, and toast must have an English and
   Simplified Chinese path. Preserve API data, user-authored content, and raw backend
   errors unless an explicit product decision says to translate them. Check both
   `跟随 Paseo` and the explicit `en`/`zh-CN` setting.
4. **Requirement completeness.** Re-read the requested behavior and trace each path
   through UI, contracts, RPC handlers, persistence, and empty/error states. Document
   deliberate limitations in both overviews.
5. **Reasoned failure cases.** Check nullable fields, stale async responses, query
   invalidation, pagination bounds, destructive confirmations, consent gates, and
   credential redaction. Add a focused test when the change introduces a new invariant.
6. **Desensitization.** Scan the complete repository and the fresh remote clone for
   tokens, credentials, phone numbers, email addresses, real names, workspace/item IDs,
   internal hosts, personal paths, and customer data. Review screenshots and image
   metadata. Do not publish if a real secret appears in the working tree or Git history.

Required commands:

```bash
npm run typecheck
npm test
git diff --check
npm pack --dry-run --ignore-scripts
git status --short --branch
```

Also run the repository secret and personal-data scan. Confirm the pack contains the
manifest, runtime entries, every imported local module, both overviews, and declared
media, with no dependency directories, logs, local files, or secrets.

## Release process

The registry at https://github.com/getpaseo/plugins pins one exact commit of this
repository, and that pinned artifact is what users install. Git updates are manual.
A release is complete only when the source revision is pushed, the registry record is
approved and pinned to that revision, the public detail and listing serve the new
revision, and the local registry installation is running with its previous settings
preserved.

When the user asks for implementation plus release, proceed through this process
autonomously once every gate passes. Stop only for a failed check, missing credentials,
or a genuinely ambiguous or destructive product decision.

### 1. Prepare and publish the source revision

1. Finish code, tests, README, both OVERVIEW files, manifest metadata, and version bump
   together. Do not publish stale screenshots or documentation.
2. Complete the review gate above.
3. Commit with a focused message and a desensitized author identity. Keep commit messages
   free of secrets, real identifiers, and private paths.
4. Push `main`. Immediately clone the public remote into a temporary directory and repeat
   the secret scan and tree/file-count check against that fresh clone. Confirm there are
   no unexpected unreachable objects or unrelated commits.

### 2. Submit the registry update

For a Git update, open a **new** submission issue on
https://github.com/getpaseo/plugins/issues/new?template=submit-plugin.yml. Do not reuse a
closed submission issue.

- Use a clear title such as `AutoWonder Workbench vX.Y.Z`.
- Set **Source** to the exact commit tree URL, not a local path or unpinned branch.
- Tick `Orchestration`, `Workspaces`, `Sidebar`, and `Utils` unless the change clearly
  changes the plugin's category.
- Include the commit SHA and screenshot URLs pinned to the same commit in the issue body.
- Confirm the issue receives the `submission` label and that the intake bot opens a
  review PR.

The reviewer may remove a submission file, update the registry pin, edit listing media,
or remove outdated screenshots. The expected `Validate` failure that says
`Awaiting reviewer completion` is not a product failure. Wait for the review PR to be
approved and merged.

### 3. Monitor publication

1. Watch the merged registry commit and its `Publish` workflow until it succeeds.
2. Verify both the registry detail document and the public listing resolve the new pin:
   - `https://plugins.paseo.sh/plugins/casonmo/autowonder-workbench.json`
   - `https://paseo.sh/plugins/casonmo/autowonder-workbench/`
3. If the custom domain is cached or stale, wait for the Pages deployment; do not switch
   the local plugin to an old pin.

### 4. Promote the registry version locally

Registry installs use the reviewed pin and reject `--ref`. Use an explicit
`github:owner/repository --ref <commit>` only for testing an unreviewed revision.

When promoting a published version, preserve the existing daemon configuration:

1. Back up
   `~/.paseo/plugin-settings/autowonder-workbench/autowonder-workbench-config.json` with
   mode `0600`.
2. Remove the current plugin installation.
3. Install `casonmo/autowonder-workbench` from the registry with the existing runtime ID.
4. Restore the settings file exactly and verify its SHA-256 hash matches the backup.
5. Reload the plugin and require:
   - `status=running`
   - registry identity `casonmo/autowonder-workbench`
   - `currentRevision` equal to the reviewed commit
   - MCP self-check succeeds
   - plugin logs contain no configured URL or token
6. Delete the temporary settings backup and browser/test profiles.

Do not leave real settings backups or authentication profiles in `/tmp`.

## Pre-push checklist

- `npm run typecheck` passes.
- Run the repository secret and personal-data scan; confirm zero findings.
- README, both OVERVIEW files, and the manifest are updated together.
- `npm pack --dry-run --ignore-scripts` contains the manifest, entries, imported modules,
  overviews, and media, with no secrets, logs, dependency directories, or local files.
- For visual changes, use only reviewed sample-data screenshots.
