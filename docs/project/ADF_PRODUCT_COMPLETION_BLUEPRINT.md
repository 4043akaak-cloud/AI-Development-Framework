# ADF Product Completion Blueprint

> Status: Active product operating standard
> Date: 2026-08-18
> Owner: Project Owner

## 1. North Star

ADF is a local Control Plane in which the Project Owner gives an instruction to a frontdoor AI, the frontdoor AI records and decomposes it, multiple specialist AIs work through ADF, their results and questions return to ADF, the frontdoor AI integrates the results, and the Owner gives the next instruction.

```text
Owner instruction
  -> Frontdoor AI
  -> ADF Request / Phase / Task
  -> Plan and role assignments
  -> Owner decision
  -> specialist AI Nodes
  -> Result / Question / Evidence / Ledger
  -> Frontdoor aggregate and answer
  -> Owner decision or next instruction
```

This is the product goal. Individual adapters, screens, ledgers, review gates, and work-plane features are means to complete this loop.

## 2. First completion definition: the working product skeleton

The first product-level completion is not every provider, every UI detail, or automatic Canonical integration. It is one repeatable local loop:

1. A frontdoor AI submits a natural-language Request through the existing local MCP entrance.
2. ADF creates or prepares the Request, Plan, Phase, and Tasks.
3. The Plan assigns at least two roles or Nodes to specialist Adapters.
4. Owner decisions remain visible at intake, decomposition/dispatch, questions, and result completion.
5. ADF dispatches the approved Nodes to Fake and/or local Ollama Adapters.
6. ADF collects each Result, Question, Evidence, Job, Thread, and Ledger record.
7. The frontdoor AI retrieves the aggregate result and returns an integrated answer to the Owner.
8. A second Owner instruction can be submitted through the same entrance as the next Phase.

The skeleton is complete when this loop is demonstrated twice in sequence without losing the Request, Plan, Node, Result, or Owner decision bindings.

## 3. Owner intervention points

The Owner remains part of the product flow at four useful points, not every implementation detail:

- **Intake**: confirm what the frontdoor AI understood.
- **Dispatch**: confirm the decomposition, roles, adapters, and scope.
- **Question**: answer an AI question or stop the Phase.
- **Result**: accept, request follow-up, or issue the next instruction.

The Owner does not need to manually operate every Ledger or hash check.

## 4. Existing asset map

| Product capability | Existing asset to reuse | Role in the skeleton |
|---|---|---|
| Frontdoor intake | `frontdoorPrepareService.ts`, `ADF-FRONTDOOR-REQUEST-INTAKE-001` | Window AI Request entry |
| Plan proposal | `planner.ts`, `ADF-FRONTDOOR-PLANNER-PROPOSAL-001` | Decomposition proposal |
| Owner decisions | `ownerGates.ts`, `ADF-FRONTDOOR-OWNER-GATE-001` | Human control points |
| Node graph | `orchestrator.ts`, `ADF-FRONTDOOR-ORCHESTRATION-001` | Role and dependency execution |
| Provider boundary | `adapterRegistry.ts`, `relay.ts`, `conversationAdapters.ts` | Provider-neutral dispatch |
| Local AI | `ollamaTransport.ts`, `ADF-FRONTDOOR-OLLAMA-TWO-NODE-E2E-001` | Real local specialist execution |
| Window AI entrance | `frontdoorMcpServer.ts`, `frontdoorMcpClient.ts`, `ADF-MCP-FRONTDOOR-CONNECTION-001` | Frontdoor AI ↔ ADF connection |
| Results and recovery | `eventLedger`, `ledger.ts`, `ADF-FRONTDOOR-LEDGER-EVENT-SOURCING-001` | Durable execution history |
| Work artifacts | `workPlaneArtifact.ts`, `implementationRun.ts`, `candidateArtifact.ts` | Later implementation output |
| Candidate review | `ADF-WORKPLANE-CANDIDATE-REVIEW-001` | Owner review of AI proposals |
| Visualization | `FrontdoorPanel.tsx`, Activity Trace | Owner visibility |

No existing asset is replaced by this blueprint. The implementation strategy is integration first, refinement second.

## 5. Roadmap from the goal

### Step 0 — Blueprint and source-of-truth alignment

This document fixes the product goal, skeleton completion, Owner intervention points, reuse map, and phase order. Obsidian records the reasoning; GitHub records the executable roadmap and Task links.

### Step 1 — Complete the frontdoor AI operational loop

Use the existing `ADF-MCP-FRONTDOOR-CONNECTION-001` path. Confirm that the frontdoor AI can use the registered local MCP entrance with the fixed runtime root and perform:

```text
prepare -> inspect -> Owner-approved dispatch -> get_result / list_runs
```

Do not create a new MCP server or duplicate the existing tools.

### Step 2 — Demonstrate the two-cycle multi-AI loop

Use the existing Frontdoor orchestration and Ollama two-Node evidence to demonstrate:

```text
frontdoor Request -> proposal role -> critic role -> aggregate answer
                         -> frontdoor AI response -> next Request
```

The first run may use Fake plus Ollama or Ollama for both roles. The important outcome is that the frontdoor AI receives the integrated result and can submit the next instruction through the same entrance.

### Step 3 — Connect implementation output to the same loop

Finish the already-started Work Plane / Implementation Agent / Candidate Review path as a supporting capability. An accepted Candidate remains a reviewed Work Plane result; it is not silently written to Canonical files.

### Step 4 — Flesh out the product

Only after the skeleton is usable, add:

- richer role selection and provider policies;
- better progress and activity visualization;
- recovery and retry ergonomics;
- real Claude Code CLI implementation Adapter;
- independent Review AI;
- Canonical Integration with a separate explicit write gate;
- token, latency, cost, and quality measurement.

## 6. Minimal safety boundary

The skeleton remains local-only and keeps only the boundaries that protect the product:

- no unapproved external send, credential, or paid call;
- no automatic Canonical repo or Obsidian write;
- every dispatch records role, Adapter, scope, and Owner decision;
- every result is linked to its Request, Node, Job, Thread, and Evidence;
- failure or unclear authority pauses the affected Phase, not the entire roadmap.

Detailed edge cases, UI polish, and future provider policy are backlog items unless they threaten these boundaries or prevent the product loop from running.

## 7. North Star Gate for every Task

Every Task must state its contribution to the North Star before implementation begins. The following four fields are mandatory in the Task or Task Packet:

- **Final Flow Contribution** — which step of the Owner → Frontdoor AI → ADF → specialist AI → integrated answer loop this Task advances.
- **Vertical Slice Outcome** — what the Owner can actually experience or verify when this Task is complete.
- **Next Flow Unlocked** — the next end-to-end step that becomes possible.
- **Deferred Details** — legitimate follow-up work that is intentionally not allowed to block this slice.

The Task is not ready for implementation when it cannot identify a concrete Final Flow Contribution. The preferred order is:

1. complete one user-visible vertical slice of the product loop;
2. connect that slice to the next phase or next instruction;
3. strengthen edge cases, UI polish, provider breadth, and measurements.

Micro-level findings are recorded and deferred unless they involve data loss, authority or approval bypass, unintended external send, credential exposure, canonical-source corruption, or a failure that prevents the current vertical slice from running.

Before reporting progress, the agent must answer: **Can the Owner now move farther through the final product flow than before this Task?** Test counts and individual Task completion support this answer but do not replace it.

## 8. Progress measurement

The primary progress question is:

> Can the Owner give a frontdoor instruction, see it become an ADF phase, watch multiple specialist AIs work, receive an integrated answer, and submit the next instruction without leaving the ADF workflow?

Test counts and individual Task completion support this question but do not replace it.

## 9. Immediate next action

The next critical-path action is not another isolated review feature. It is the operational confirmation of the existing MCP frontdoor connection, followed by one complete two-cycle Request → multi-AI Result → next Request demonstration using the existing assets above.

`ADF-WORKPLANE-*` Tasks remain protected and are not discarded. They are supporting capabilities and must not block the first usable frontdoor loop unless they reveal a real data-loss or authority problem.
