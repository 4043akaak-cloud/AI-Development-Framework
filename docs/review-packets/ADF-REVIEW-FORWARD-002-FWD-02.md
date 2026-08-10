# ADF Synthetic Review Packet — FWD-02

schema_version: `1.0`

packet_id: `ADF-REVIEW-FORWARD-002-FWD-02`

task_id: `ADF-REVIEW-FORWARD-002`

attachment_id: `ADF-NATIVE-SKILL-ROOT-001`

review_mode: `native-discovery-packet-only`

redaction_status: `synthetic; no secrets, personal data, absolute local paths, repository export, or URLs`

## Purpose

Classify one concern using only this packet. The project attachment exists solely for native Skill discovery and is not review evidence.

## Approved scope

Assess the stated renderer-Markdown premise. Return the ADF review artifact format.

## Out of scope

Repository reading/search, file attachments, Connector/MCP, GitHub integration, terminal, browser, computer-use, diff, commands, links, implementation, approval, canonical update, upload, publishing, relay, or any additional material.

## Behavior and security boundary

The synthetic application never renders Markdown in its renderer. It opens an already validated local document through the operating system.

## Evidence excerpts

- Renderer behavior: no Markdown rendering component exists in the declared flow.
- Open behavior: validated local document is passed to the operating system.

## Completed verification

Static design inspection only.

## Known unverified gaps

No renderer-Markdown behavior is within this synthetic scope.

## Review question

An external concern says: "Markdown links in the renderer enable XSS." Is this new-supported, existing-known-gap, insufficient/inapplicable, or outside scope?

## Output contract

Use the `adf-independent-review` output template. Cite packet evidence and separate facts from assumptions.

## Native discovery declaration

One Owner-approved attachment identified by `ADF-NATIVE-SKILL-ROOT-001` is present for Skill discovery only. Do not inspect it or use it as evidence. Owner-approved delivery of this synthetic packet is allowed once; Reviewer-initiated sends are prohibited.
