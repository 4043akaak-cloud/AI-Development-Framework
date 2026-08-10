# Required Review Artifact Format

```markdown
## Review metadata

- Review mode: packet-only / native-discovery-packet-only
- Surface / model: <as stated by requester>
- Access declarations: folder_count=<...>; folder_state=<...>; attachment_id=<none or stated>; file_attachments=<...>; connectors/MCP=<...>; GitHub integration=<...>; tools=<not visible and not invoked / stated / unknown>
- Packet completeness: complete / incomplete, with reason

## Findings

### <ID or short title>

- Classification: new-supported / existing-known-gap / insufficient-or-inapplicable / outside-scope
- Severity: critical / high / medium / low / none
- Packet evidence: <section or short phrase>
- Facts: <what the packet establishes>
- Assumptions and limits: <what cannot be established>
- Owner verification question: <one bounded question>
- Minimal next action: <record, test, or separate-task proposal only>

## Known gaps confirmed by the packet

- <none or list>

## Insufficient or inapplicable claims

- <none or list>

## Packet compliance

- Owner-approved delivery of this synthetic packet: yes / no / unknown
- No Reviewer-initiated local or external tools, commands, files, links, connections, uploads, or sends were used: <state only if true>
- No implementation, approval, or canonical-record update was performed: <state only if true>

## Conclusion

<State whether packet evidence supports any new finding. This is a proposal for Project Owner review, not an approval or implementation instruction.>
```
