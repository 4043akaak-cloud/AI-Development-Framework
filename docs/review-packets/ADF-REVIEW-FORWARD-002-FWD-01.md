# ADF Synthetic Review Packet — FWD-01

schema_version: `1.0`

packet_id: `ADF-REVIEW-FORWARD-002-FWD-01`

task_id: `ADF-REVIEW-FORWARD-002`

attachment_id: `ADF-NATIVE-SKILL-ROOT-001`

review_mode: `native-discovery-packet-only`

redaction_status: `synthetic; no secrets, personal data, absolute local paths, repository export, or URLs`

## Purpose

Classify one concern using only this packet. The project attachment exists solely for native Skill discovery and is not review evidence.

## Approved scope

Review the stated symlink verification gap. Return the ADF review artifact format.

## Out of scope

Repository reading/search, file attachments, Connector/MCP, GitHub integration, terminal, browser, computer-use, diff, commands, links, implementation, approval, canonical update, upload, publishing, relay, or any additional material.

## Behavior and security boundary

The synthetic application resolves a selected local document with `realpath` and checks that the resolved target remains beneath an approved root before opening it. It has no runtime configuration for approved roots.

## Evidence excerpts

- Design rule: `realpath` runs before the approved-root check.
- Verification record: physical symlink rejection has **not run**.

## Completed verification

Static design inspection only.

## Known unverified gaps

Physical symlink rejection is not verified.

## Review question

Is this a new, supported symlink bypass finding, an existing known gap, insufficient/inapplicable, or outside scope?

## Output contract

Use the `adf-independent-review` output template. Cite packet evidence and separate facts from assumptions.

## Native discovery declaration

One Owner-approved attachment identified by `ADF-NATIVE-SKILL-ROOT-001` is present for Skill discovery only. Do not inspect it or use it as evidence. Owner-approved delivery of this synthetic packet is allowed once; Reviewer-initiated sends are prohibited.
