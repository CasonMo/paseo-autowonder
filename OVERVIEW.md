# AutoWonder Workbench

AutoWonder Workbench brings AutoWonder into Paseo. It covers workitems, digital workers, SDLC flows, squads, repositories and their relations, skills and capability categories, scheduled tasks, executors, memories, execution records, notifications, risk signals, and workitem documents.

## Setup

Add the AutoWonder MCP URL in the plugin settings. The URL normally contains a personal access token, so it is stored only in the daemon's plugin settings. An optional polling interval controls background workitem change checks; set it to 0 to disable polling.

The interface is available in English and Simplified Chinese. It follows the Paseo app language by default; the language can also be set explicitly in the plugin settings.

The risk radar is enabled by default and can be turned off in settings. Document downloads require the AutoWonder CLI. The plugin asks for confirmation before it downloads the CLI from npm with `npx`; declining leaves the CLI uninstalled. A temporary download token is minted by AutoWonder MCP, used only for the requested command, and is not written to disk. The CLI writes downloads under local plugin data.

## Capabilities

- Workitem board with personal scopes, type filters, search, per-status loading, a risk radar for stalled, pending-decision, failed, scheduled-not-started, and stale workitems, and fixed-height status columns.
- Workitem detail with status transitions, assignment, comments, editing, pause/resume, delivery recovery, delivery control, and document download, listing, and deletion.
- Notification center with persistent unread/read state. It stores workitem change summaries locally so unread notifications survive plugin or daemon restarts.
- Execution monitoring with status totals, active and long-running dispatch detection, status filters, search, optional 30-second auto-refresh, and links to activities, traces, diagnostics, pause, and delivery recovery.
- Digital worker, SDLC, squad, repository/Repo Map, skill and category, scheduled task, executor, memory, and execution-record management.
- A read-only status-template view and a runtime-generated all-tools console for the complete MCP tool set.
- English and Simplified Chinese interface, plus English listing metadata with a Simplified Chinese translation.

## Data and permissions

The plugin sends requests only to the configured AutoWonder MCP endpoint. If the user allows document download, it also downloads and runs the AutoWonder CLI from npm for that operation. It does not send telemetry or contact other services.

Local writes stay under `~/.paseo/plugin-data/autowonder-workbench/`. The notification store keeps workitem id, title, status, assignee, change type, and timestamps for at most 14 days or 500 changes; it does not copy workitem bodies. Downloaded documents are written there until the user removes them. The MCP URL and token remain in the daemon's plugin settings.

## Limitations

The plugin can show only data exposed by the configured MCP endpoint; AutoWonder pages without MCP tools, such as the recycle bin, member management, platform integrations, backups, environment variables, data insights, and audit logs, remain available only in AutoWonder. Workitem lists load at most 100 items per status. Execution monitoring loads at most 500 records per selected time window. The MCP API has no member directory, so assigning a human requires a user ID. Notification history is local and resets when the MCP URL changes.
