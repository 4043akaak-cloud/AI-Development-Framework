# Week 1 - GitHub Issues Template

> **Status: Historical planning artifact (superseded 2026-07-30).** これは初期の改善案を保存した資料であり、現在の実行用Taskではない。`REQUEST_TO_AI.md`と`PROJECT_STARTUP_CHECKLIST.md`への参照は、[AI Task Packet](../../templates/AI_TASK_PACKET.md)、[Codex単独パイロット](../workflow/CODEX_SOLO_PILOT.md)、[Task Lifecycle](../workflow/TASK_LIFECYCLE.md)に置き換えられた。

## Issue #1

**Title:** [Loop] AI Development Framework [Documentation] - Initialize Decision Record Directory

**Body:**

## 分析元
**Explore Report**: Projects/WeeklyLoopReport_2026-07-25.md

---

## 改善案

### Decision Record Infrastructure Setup

**Purpose**: The `docs/decisions/` directory doesn't exist, preventing the framework from capturing crucial architectural and operational decisions. This is foundational for multi-AI collaboration.

**Scope**:
1. Create `/docs/decisions/` directory with `.gitkeep`
2. Create `/docs/decisions/README.md` explaining decision record practice
3. Create 3 exemplar decision records:
   - ADR-001-Choose-Obsidian-Integration.md
   - ADR-002-Multi-AI-Collaboration-Model.md
   - ADR-003-Documentation-First-Approach.md
4. Update main README.md to reference docs/decisions/

**Expected Effect**:
- All future decisions are centrally recorded and searchable
- Framework achieves full documentation maturity
- Enables cross-project learning patterns

### Priority
Critical

### Estimated Effort
2-3 hours

### Implementation Approach
- Create docs/decisions/ directory structure
- Write README.md explaining ADR format
- Fill 3 exemplar records with real project decisions
- Link from main README

---

## Acceptance Criteria
- [ ] docs/decisions/ directory exists
- [ ] README.md explains decision record practice
- [ ] 3 exemplar decision records are complete
- [ ] Main README references docs/decisions/
- [ ] DECISION_RECORD.md template is referenced

---

## Related Links
- Loop Design: Memory/loop_coding_design_phase1.md
- Obsidian Report: Projects/WeeklyLoopReport_2026-07-25.md

---

## Labels
- `loop-manual`
- `priority-critical`
- `documentation`

---

## Issue #2

**Title:** [Loop] AI Development Framework [Documentation] - Add Template Examples to AI Task Packet and DECISION_RECORD

**Status:** Superseded. 実例追加の必要性は、Codex単独パイロットを3件完走した後に評価する。

**Body:**

## 分析元
**Explore Report**: Projects/WeeklyLoopReport_2026-07-25.md

---

## 改善案

### Template Enhancement with Real-World Examples

**Purpose**: Current templates are abstract; they lack concrete, real-world examples that show how to apply them in actual work.

**Scope**:
1. Enhance AI_TASK_PACKET.md with必要な実例（refactoring, testing, architecture decision）
2. Create DECISION_RECORD_EXAMPLES.md with 3 filled-in records
3. Create TEMPLATE_USAGE_GUIDE.md (300-400 words)
4. Add "Common Mistakes" section

**Expected Effect**:
- Templates become self-documenting through examples
- Reduces time for new AIs to understand framework
- Increases consistency in requests

### Priority
High

### Estimated Effort
2-3 hours

### Implementation Approach
- Add 3+ examples to AI_TASK_PACKET.md
- Create DECISION_RECORD_EXAMPLES.md with filled records
- Document template usage patterns
- Add anti-patterns and corrections

---

## Acceptance Criteria
- [ ] AI_TASK_PACKET.md has 4-5 detailed examples
- [ ] DECISION_RECORD_EXAMPLES.md shows 3 complete records
- [ ] TEMPLATE_USAGE_GUIDE.md is comprehensive
- [ ] Common pitfalls are documented

---

## Labels
- `loop-manual`
- `priority-high`
- `documentation`

---

## Issue #3

**Title:** [Loop] AI Development Framework [Process] - Synchronize AI Onboarding Protocols (CLAUDE.md vs AGENTS.md)

**Body:**

## 分析元
**Explore Report**: Projects/WeeklyLoopReport_2026-07-25.md

---

## 改善案

### Synchronize AI Onboarding Protocols

**Purpose**: CLAUDE.md has detailed 3-step protocol, AGENTS.md has simpler flow. This asymmetry creates confusion: different AIs follow different processes.

**Scope**:
1. Create unified AI_STARTUP_PROTOCOL.md in docs/workflow/
2. Simplify CLAUDE.md to reference protocol
3. Simplify AGENTS.md to reference protocol
4. Add MULTI_AI_COORDINATION.md for hand-off scenarios

**Expected Effect**:
- All AIs follow identical onboarding process
- Obsidian context is consistently available
- Fewer context-related misunderstandings

### Priority
High

### Estimated Effort
1-2 hours

### Implementation Approach
- Create unified protocol document
- Add conditional Obsidian loading logic
- Document multi-AI hand-off procedures
- Reference from CLAUDE.md and AGENTS.md

---

## Acceptance Criteria
- [ ] Unified AI_STARTUP_PROTOCOL.md exists
- [ ] CLAUDE.md and AGENTS.md reference it
- [ ] Conditional Obsidian loading documented
- [ ] Multi-AI coordination guide complete

---

## Labels
- `loop-manual`
- `priority-high`
- `process`

---

## Issue #4

**Title:** [Loop] Prediction Engine Core [Code Quality] - Replace console.log with Structured Logging (Pino)

**Body:**

## 分析元
**Explore Report**: Projects/WeeklyLoopReport_2026-07-25.md

---

## 改善案

### Implement Structured Logging Foundation

**Purpose**: 32 `console.log()` statements across 15+ files make debugging production issues nearly impossible. No log levels, no structured data. Blocks production deployment.

**Scope**:
1. Create logger.ts with Pino configuration
2. Replace all console.log in 12 core files
3. Create LOGGING_GUIDE.md
4. Update .env.example with LOG_LEVEL config

**Expected Effect**:
- Production logs are parseable and queryable
- Log levels enable environment-specific verbosity
- Structured logs support aggregation

### Priority
Critical

### Estimated Effort
3-4 hours

### Implementation Approach
- Create Pino logger instance
- Add environment configuration (LOG_LEVEL, LOG_FORMAT)
- Replace console.log in PredictionEngine, RecipeRegistry, RecipeExecutor, etc.
- Create logging guide with conventions

---

## Acceptance Criteria
- [ ] Logger instance created with config
- [ ] All console.log() replaced
- [ ] Log format is valid JSON
- [ ] LOG_LEVEL environment variable controls verbosity
- [ ] LOGGING_GUIDE.md explains usage
- [ ] Tests still pass

---

## Labels
- `loop-manual`
- `priority-critical`
- `code-quality`

---

## Issue #5

**Title:** [Loop] AI Development Framework [Process] - Validate the Codex Solo Pilot before adding phase checklists

**Status:** Superseded. 15-step checklistは削除し、現在はCodex単独パイロットの最小手順を使う。

**Body:**

## 分析元
**Explore Report**: Projects/WeeklyLoopReport_2026-07-25.md

---

## 改善案

### Validate the Codex Solo Pilot

**Purpose**: Current 15-step checklist is overwhelming for first projects. Developers stall because they don't understand why later steps matter now.

**Scope**:
1. Create QUICK_START_CHECKLIST.md (5 items, ~30 min)
2. Create EXPLORATION_PHASE_CHECKLIST.md (4-5 items)
3. Create IMPLEMENTATION_PHASE_CHECKLIST.md (6-7 items)
4. Create COMPLETION_CHECKLIST.md (4-5 items)
5. Create CHECKLIST_SELECTION_GUIDE.md with decision tree

**Expected Effect**:
- Projects can start faster
- Clear progression from exploration → implementation → release
- Reduced cognitive load

### Priority
High

### Estimated Effort
2-3 hours

### Implementation Approach
- Break 15-step checklist into 4 modular checklists
- Create decision tree routing users to correct checklist
- Keep original as reference, mark as legacy
- Update all README references

---

## Acceptance Criteria
- [ ] QUICK_START_CHECKLIST has ≤5 items
- [ ] Each modular checklist is reusable
- [ ] Decision tree clearly routes users
- [ ] Legacy checklist marked as reference

---

## Labels
- `loop-manual`
- `priority-high`
- `documentation`

---

## Issue #6

**Title:** [Loop] Prediction Engine Core [Testing] - Consolidate 26 Test Files into 5 Focused Suites

**Body:**

## 分析元
**Explore Report**: Projects/WeeklyLoopReport_2026-07-25.md

---

## 改善案

### Consolidate Prediction Engine Tests

**Purpose**: 26 test files with significant duplication and unclear organization make it hard to add tests, understand coverage, and maintain tests.

**Scope**:
1. Create new test structure under `__tests__/`:
   - `__tests__/core/` — Unit tests
   - `__tests__/integration/` — Integration tests
   - `__tests__/scenarios/` — Real-world scenarios
   - `__tests__/fixtures/` — Shared test data
2. Consolidate 26 → 5 test files
3. Update all import paths
4. Create `__tests__/README.md` explaining organization

**Expected Effect**:
- Test structure matches code structure
- No duplicated tests
- Easier to add new tests
- Clear test organization

### Priority
High

### Estimated Effort
4-5 hours

### Implementation Approach
- Create new __tests__/ directory structure
- Consolidate files by test type (unit/integration/scenario)
- Migrate all tests to new locations
- Delete old scattered test files
- Update package.json test paths

---

## Acceptance Criteria
- [ ] 26 test files consolidated into 5
- [ ] No duplication of test cases
- [ ] All tests pass
- [ ] Test file structure mirrors code
- [ ] README explains organization

---

## Labels
- `loop-manual`
- `priority-high`
- `test-coverage`

---

## Issue #7

**Title:** [Loop] Prediction Engine Core [Documentation] - Add JSDoc to Public API and Comprehensive Error Scenario Tests

**Body:**

## 分析元
**Explore Report**: Projects/WeeklyLoopReport_2026-07-25.md

---

## 改善案

### Add Comprehensive JSDoc and Error Scenario Tests

**Purpose**: Public methods lack documentation. Error scenarios are untested (timeout, failure, edge cases), causing production surprises.

**Scope**:
1. Add JSDoc to public classes and methods in core files:
   - PredictionEngine.ts, RecipeRegistry.ts, RecipeExecutor.ts, EvidenceCollector.ts, ConfidenceCalculator.ts
   - Pattern: @param, @returns, @throws documentation
2. Create ErrorScenarios.test.ts with 10+ error cases:
   - Recipe execution timeout
   - Evidence collection failure
   - Confidence calculation edge cases (0, 1, NaN)
   - Invalid PredictionRequest
   - Recipe registry corruption
   - History storage failure
3. Create ERROR_HANDLING.md with recovery strategies
4. Update API.md with JSDoc excerpts

**Expected Effect**:
- IDE autocomplete and type hints work
- Error handling is predictable
- Onboarding new developers is faster
- Production errors are recoverable

### Priority
High

### Estimated Effort
4-5 hours

### Implementation Approach
- Add @param, @returns, @throws to 15+ methods
- Create ErrorScenarios.test.ts with realistic error cases
- Mock failures and edge cases
- Document error types and recovery strategies
- Add examples to API.md

---

## Acceptance Criteria
- [ ] All public classes have JSDoc
- [ ] All public methods have @param/@returns/@throws
- [ ] 10+ error scenario tests added and passing
- [ ] Error messages are clear and actionable
- [ ] ERROR_HANDLING.md provides recovery strategies
- [ ] IDE shows documentation on hover

---

## Labels
- `loop-manual`
- `priority-high`
- `documentation`
