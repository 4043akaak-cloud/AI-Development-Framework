# Native Discovery Owner Preflight

Use this record outside the synthetic packet. It is an Owner observation, not evidence the Reviewer may use.

| Field | Required value |
| --- | --- |
| Attachment ID | `ADF-NATIVE-SKILL-ROOT-001` |
| Exact project path | `/Users/kawakamiatsushishi/GitHub/AI-Development-Framework` |
| Folder count | `1` |
| Folder state | `native-discovery-only` |
| File attachments | `0` |
| Connectors / MCP / GitHub integration | `0` / not connected |
| Browser / terminal / computer-use / diff | not visible or not invoked; otherwise STOP |
| Surface / displayed model | Claude Code / exact displayed Sonnet string |
| Skill and reference hashes | recorded before packet input |
| Unknown or mismatch | STOP; do not send a packet |

The Owner may authorise one secret-free synthetic-packet input after this preflight. The Reviewer must not request or use the exact path, project content, additional material, or any tool. A visible tool invocation, permission request, project-content reference, path mismatch, extra folder, file attachment, integration, or unknown state makes the run `Invalid / STOP`.
