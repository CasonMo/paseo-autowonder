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

- Workitem polling is read-only and bounded. Keep the documented interval, per-status cap,
  and workspace scope accurate.
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

## Publishing and releases

The registry at https://github.com/getpaseo/plugins pins one exact commit of this
repository, and that pinned artifact is what users install.

1. Push the finished change to `main` only after the checklist below passes and the user
   confirms release.
2. Request the update in the registry with a submission issue using the plugin name and
   this repository URL, naming the desired commit when applicable.
3. The reviewer verifies the pinned commit, runs trusted registry validation, and merges.
   Approved listings appear on paseo.sh/plugins; no tag is required.
4. After merge, confirm the listing installs the new pin.

Checklist before pushing:

- `npm run typecheck` passes.
- Run the repository secret and personal-data scan; confirm zero findings.
- README, both OVERVIEW files, and the manifest are updated together.
- `npm pack --dry-run --ignore-scripts` contains the manifest, entries, imported modules,
  overviews, and media, with no secrets, logs, dependency directories, or local files.
- For visual changes, use only reviewed sample-data screenshots.
