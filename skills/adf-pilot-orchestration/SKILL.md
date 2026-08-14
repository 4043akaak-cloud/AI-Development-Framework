---
name: adf-pilot-orchestration
description: Run and evaluate staged AI-development-framework experiments. Use when starting an ADF pilot task, coordinating Codex subagents as role-separated planner, critic, and observer, recording bottlenecks, or deciding whether a manual Codex-only workflow is ready to add another AI or automation.
---

# ADF Pilot Orchestration

Run one bounded Task experiment at a time. Treat the experiment as evidence gathering, not proof that autonomous AI development is safe. Preserve the Project Owner's approval gate for every write, commit, push, external call, cost, or irreversible action.

## 1. Confirm the Experiment Boundary

- Read the repository's `AGENTS.md`, collaboration rules, Task Lifecycle, Current State, and target Task.
- Verify the canonical worktree, current branch, and pre-existing changes before asking any agent to act.
- Set one experiment objective, one Task ID, one success criterion, and explicit out-of-scope actions.
- Do not advance from planning to implementation unless the Task records human approval.

## 2. Run Phase 0.5: Codex and Subagents Only

Use subagents as separate-context reviewers, not as separate AI products and not as autonomous writers.

- Give a planner the raw Task and required context; request a plan only.
- Give a critic the same raw artifacts; request risks, contradictions, and minimal corrections only.
- Give an observer the raw artifacts; request measurable signals and bottlenecks only.
- Keep subagents read-only unless a separately approved Task explicitly grants a narrowly scoped write.
- Synthesize outputs by separating consensus, disagreement, evidence, assumptions, and required human decisions.

Do not claim this is independent AI review. Record it as `role-separated Codex review`.

Do not update canonical Task state during a read-only probe. The Project Owner must explicitly authorize the record surface before the coordinator writes an experiment result.

## 3. Record the Experiment

Use [references/experiment-record.md](references/experiment-record.md) as the report structure. Record only verified observations:

- task and context completeness;
- disagreement found by the roles;
- rework caused by missing context or ambiguous scope;
- approval waits, excluding the Project Owner's intentional decision time when requested;
- actual files changed, tests run, and operations deliberately not run.

Write the operational record to GitHub. Write reusable reasoning, long investigations, and lessons to the linked Obsidian MOC. Do not copy the full report into both systems.

## 4. Decide Whether to Advance

Advance to Phase 1 only after at least three Phase 0 Tasks are complete and their records show that context, scope, and handover are reproducible.

- **Phase 1:** Add one external AI as a separate reviewer first. Preserve the same Task Packet and human approval gate.
- **Later:** Evaluate read-only helpers, then API-based routing or automation in a separately approved design Task.
- **Never advance automatically:** cost, data-sharing, push, merge, publication, or irreversible actions always require explicit owner authorization.

## 5. Stop Conditions

- Stop at `Waiting Approval` or `Blocked` when required context is missing, scope changes, a secret or external service is needed, changes are irreversible, or the Task cannot state a measurable completion condition.
- Do not convert a disagreement into a decision. Surface it for the Project Owner.
- Do not start the next Task automatically after reporting the result.
