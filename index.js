//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
let electron = require("electron");
let node_path = require("node:path");
node_path = __toESM(node_path);
let node_fs = require("node:fs");
let node_fs_promises = require("node:fs/promises");
let node_crypto = require("node:crypto");
node_crypto = __toESM(node_crypto);
//#region src/shared/projectRegistry.ts
var adfRepositoryRoot = "/Users/kawakamiatsushishi/GitHub/AI-Development-Framework";
var blockDefenseRepositoryRoot = "/Users/kawakamiatsushishi/GitHub/block-defense";
var registeredProjects = [{
	id: "adf",
	name: "AI Development Framework",
	repositoryRoot: adfRepositoryRoot
}, {
	id: "block-defense",
	name: "Block Defense",
	repositoryRoot: blockDefenseRepositoryRoot
}];
function registeredProjectFor(projectId) {
	return registeredProjects.find((project) => project.id === projectId);
}
//#endregion
//#region src/shared/canonicalLinkPolicy.ts
var obsidianRoot = "/Users/kawakamiatsushishi/Desktop/secondbrain";
var projectSource = (projectId, relativePath) => ({
	root: `project:${projectId}`,
	relativePath
});
var canonicalSources = {
	"task-mvp1": projectSource("adf", "docs/tasks/ADF-MVP1-001.md"),
	"task-retro": projectSource("adf", "docs/tasks/ADF-RETRO-001.md"),
	"task-orch": projectSource("adf", "docs/tasks/ADF-ORCH-001.md"),
	"task-review": projectSource("adf", "docs/tasks/ADF-REVIEW-001.md"),
	"task-foundation": projectSource("adf", "docs/tasks/ADF-FOUNDATION-001.md"),
	"project-current-state": projectSource("adf", "docs/project/CURRENT_STATE.md"),
	"design-board-mvp1": projectSource("adf", "docs/design/ADF_MVP1_READ_ONLY_BOARD.md"),
	"design-foundation": projectSource("adf", "docs/design/ADF_CONTROL_PLANE_FOUNDATION.md"),
	"obsidian-airflow": {
		root: "obsidian",
		relativePath: "Projects/AI-Development-Framework/04_AIRFLOWとループコーディング型ADF構想_2026-08-03.md"
	},
	"obsidian-retro": {
		root: "obsidian",
		relativePath: "Projects/AI-Development-Framework/05_Phase0振り返り_2026-08-03.md"
	},
	"obsidian-orch": {
		root: "obsidian",
		relativePath: "Projects/AI-Development-Framework/06_複数AI管制エンジン設計_2026-08-04.md"
	},
	"obsidian-review": {
		root: "obsidian",
		relativePath: "Projects/AI-Development-Framework/08_外部独立レビュー実験設計_2026-08-04.md"
	},
	"block-defense-adf-bd-001": projectSource("block-defense", "docs/tasks/ADF-BD-001.md"),
	"block-defense-bd-002": projectSource("block-defense", "docs/tasks/BD-002.md"),
	"block-defense-core-design": projectSource("block-defense", "docs/design/BLOCK_DEFENSE_GAME_DESIGN.md"),
	"block-defense-bd-002-design": projectSource("block-defense", "docs/design/BD-002_INPUT_AND_TWO_TIER_BOARD.md"),
	"block-defense-bd-002-experiment": projectSource("block-defense", "docs/experiments/BD-002.md"),
	"block-defense-bd-003": projectSource("block-defense", "docs/tasks/BD-003.md"),
	"block-defense-bd-003-dispatch-prompt": projectSource("block-defense", "docs/tasks/BD-003-CLAUDE-CODE-DISPATCH-PROMPT.md"),
	"block-defense-bd-003-design": projectSource("block-defense", "docs/design/BD-003_V2_PLAYABLE_SLICE.md"),
	"block-defense-bd-003-result-template": projectSource("block-defense", "docs/evidence/BD-003/RESULT_TEMPLATE.md"),
	"block-defense-bd-003-result": projectSource("block-defense", "docs/evidence/BD-003/RESULT.md"),
	"obsidian-block-defense-moc": {
		root: "obsidian",
		relativePath: "Projects/Block-Defense/00_MOC.md"
	},
	"obsidian-block-defense-probe": {
		root: "obsidian",
		relativePath: "Projects/Block-Defense/02_入力と二層盤面の触感プローブ_2026-08-05.md"
	},
	"obsidian-block-defense-v2": {
		root: "obsidian",
		relativePath: "Projects/Block-Defense/03_Block_Defense_v2_設計壁打ち_2026-08-07.md"
	}
};
function isSafeRelativeMarkdownPath(value) {
	if (!value || node_path.default.isAbsolute(value) || value.includes("\0") || !value.endsWith(".md")) return false;
	const normalized = node_path.default.posix.normalize(value);
	return normalized === value && !normalized.startsWith("../") && normalized !== "..";
}
function rootFor(sourceId) {
	const root = canonicalSources[sourceId].root;
	if (root === "obsidian") return obsidianRoot;
	const project = registeredProjectFor(root.slice(8));
	if (!project) throw new Error(`Unknown registered project root: ${root}`);
	return project.repositoryRoot;
}
function isInsideRoot(root, candidate) {
	const relative = node_path.default.relative(root, candidate);
	return relative !== "" && !relative.startsWith(`..${node_path.default.sep}`) && relative !== ".." && !node_path.default.isAbsolute(relative);
}
//#endregion
//#region src/main/canonicalSourceService.ts
var localFileOperations = {
	exists: node_fs.existsSync,
	realpath: node_fs.realpathSync,
	isFile: (candidate) => (0, node_fs.lstatSync)(candidate).isFile()
};
function resolveCanonicalSource(value, sources, fileOperations = localFileOperations) {
	if (typeof value !== "string" || !Object.hasOwn(sources, value)) return {
		ok: false,
		reason: "unknown-source"
	};
	const source = sources[value];
	if (!isSafeRelativeMarkdownPath(source.relativePath)) return {
		ok: false,
		reason: "invalid-source"
	};
	const candidate = node_path.default.resolve(source.rootPath, source.relativePath);
	if (!isInsideRoot(source.rootPath, candidate) || !fileOperations.exists(candidate)) return {
		ok: false,
		reason: "missing-file"
	};
	const resolvedRoot = fileOperations.realpath(source.rootPath);
	const resolvedCandidate = fileOperations.realpath(candidate);
	if (!isInsideRoot(resolvedRoot, resolvedCandidate)) return {
		ok: false,
		reason: "outside-root"
	};
	if (!resolvedCandidate.endsWith(".md")) return {
		ok: false,
		reason: "unsupported-file"
	};
	if (!fileOperations.isFile(resolvedCandidate)) return {
		ok: false,
		reason: "not-a-file"
	};
	return {
		ok: true,
		path: resolvedCandidate
	};
}
async function openResolvedCanonicalSource(value, sources, openPath, fileOperations = localFileOperations) {
	const resolved = resolveCanonicalSource(value, sources, fileOperations);
	if (!resolved.ok) return resolved;
	return await openPath(resolved.path) ? {
		ok: false,
		reason: "open-failed"
	} : { ok: true };
}
//#endregion
//#region src/shared/rendererUrlPolicy.ts
function safeDevelopmentRendererUrl(candidate, isPackaged) {
	if (isPackaged || !candidate) return void 0;
	try {
		const url = new URL(candidate);
		return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost") ? url.toString() : void 0;
	} catch {
		return;
	}
}
//#endregion
//#region src/main/jobLoop/hash.ts
function sortValue(value) {
	if (Array.isArray(value)) return value.map(sortValue);
	if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
	return value;
}
function canonicalJson(value) {
	return JSON.stringify(sortValue(value));
}
function hashJson(value) {
	return node_crypto.default.createHash("sha256").update(canonicalJson(value)).digest("hex");
}
function nowIso() {
	return (/* @__PURE__ */ new Date()).toISOString();
}
//#endregion
//#region src/main/jobLoop/adapterRegistry.ts
var adapterProfiles = [
	{
		adapterId: "fake-ai-a",
		displayName: "Fake AI A / Proposal",
		provider: "fake",
		connection: "fake",
		authMode: "none",
		status: "available",
		roles: ["proposal"],
		capabilities: ["read", "propose"],
		costTier: "free",
		dataPolicy: "local-only"
	},
	{
		adapterId: "lmstudio-local",
		displayName: "LM Studio / Local OpenAI-compatible API",
		provider: "lmstudio",
		connection: "local-http",
		authMode: "none",
		status: "available",
		roles: [
			"proposal",
			"critic",
			"review"
		],
		capabilities: ["read", "propose"],
		costTier: "free",
		dataPolicy: "local-only"
	},
	{
		adapterId: "fake-ai-b",
		displayName: "Fake AI B / Critic",
		provider: "fake",
		connection: "fake",
		authMode: "none",
		status: "available",
		roles: ["critic", "review"],
		capabilities: ["read", "propose"],
		costTier: "free",
		dataPolicy: "local-only"
	},
	{
		adapterId: "claude-code-first-real",
		displayName: "Claude Code / First Real Adapter Test",
		provider: "anthropic",
		connection: "unknown",
		authMode: "unknown",
		status: "planned",
		roles: ["implementation", "review"],
		capabilities: ["read", "propose"],
		costTier: "unknown",
		dataPolicy: "unknown"
	},
	{
		adapterId: "claude-external",
		displayName: "Claude / External Conversation Adapter",
		provider: "anthropic",
		connection: "api",
		authMode: "environment-secret",
		status: "available",
		roles: [
			"proposal",
			"critic",
			"review"
		],
		capabilities: ["read", "propose"],
		costTier: "unknown",
		dataPolicy: "external-send"
	},
	{
		adapterId: "deepseek-external",
		displayName: "DeepSeek / OpenAI-compatible API",
		provider: "deepseek",
		connection: "api",
		authMode: "environment-secret",
		status: "available",
		roles: [
			"proposal",
			"critic",
			"review"
		],
		capabilities: ["read", "propose"],
		costTier: "low",
		dataPolicy: "external-send"
	},
	{
		adapterId: "zai-external",
		displayName: "Z.ai / OpenAI-compatible API",
		provider: "zai",
		connection: "api",
		authMode: "environment-secret",
		status: "available",
		roles: [
			"proposal",
			"critic",
			"review"
		],
		capabilities: ["read", "propose"],
		costTier: "low",
		dataPolicy: "external-send"
	},
	{
		adapterId: "qwen-external",
		displayName: "Qwen / Model Studio OpenAI-compatible API",
		provider: "qwen",
		connection: "api",
		authMode: "environment-secret",
		status: "available",
		roles: [
			"proposal",
			"critic",
			"review"
		],
		capabilities: ["read", "propose"],
		costTier: "low",
		dataPolicy: "external-send"
	},
	{
		adapterId: "openrouter-free",
		displayName: "OpenRouter / Fixed Free Model API",
		provider: "openrouter",
		connection: "api",
		authMode: "environment-secret",
		status: "available",
		roles: [
			"proposal",
			"critic",
			"review"
		],
		capabilities: ["read", "propose"],
		costTier: "low",
		dataPolicy: "external-send"
	},
	{
		adapterId: "external-probe-mock",
		displayName: "External Probe / Mock transport",
		provider: "mock",
		connection: "mock",
		authMode: "none",
		status: "available",
		roles: ["proposal"],
		capabilities: ["read", "propose"],
		costTier: "free",
		dataPolicy: "external-send"
	},
	{
		adapterId: "codex-external",
		displayName: "Codex / External Conversation Adapter",
		provider: "openai",
		connection: "cli",
		authMode: "cli-session",
		status: "planned",
		roles: [
			"proposal",
			"critic",
			"implementation"
		],
		capabilities: ["read", "propose"],
		costTier: "unknown",
		dataPolicy: "external-send"
	},
	{
		adapterId: "ollama-local",
		displayName: "Ollama / Local HTTP Adapter",
		provider: "ollama",
		connection: "local-http",
		authMode: "none",
		status: "available",
		roles: ["proposal", "critic"],
		capabilities: ["read", "propose"],
		costTier: "free",
		dataPolicy: "local-only"
	},
	{
		adapterId: "claude-code-cli",
		displayName: "Claude Code CLI / External Conversation Adapter",
		provider: "anthropic",
		connection: "cli",
		authMode: "environment-secret",
		status: "planned",
		roles: [
			"proposal",
			"critic",
			"implementation",
			"review"
		],
		capabilities: ["read", "propose"],
		costTier: "unknown",
		dataPolicy: "external-send"
	},
	{
		adapterId: "fake-implementation",
		displayName: "Fake Implementation / Candidate Probe",
		provider: "fake",
		connection: "fake",
		authMode: "none",
		status: "available",
		roles: ["implementation"],
		capabilities: ["read", "propose"],
		costTier: "free",
		dataPolicy: "local-only",
		autoSelectable: false
	}
];
var AdapterRegistryError = class extends Error {
	code = "ADAPTER_REGISTRY_REJECTED";
	constructor(message) {
		super(message);
	}
};
function getAdapterProfile(adapterId) {
	const profile = adapterProfiles.find((candidate) => candidate.adapterId === adapterId);
	if (!profile) throw new AdapterRegistryError(`unknown adapter: ${adapterId}`);
	return profile;
}
/**
* The single check for "is this explicit adapterId/role dispatch actually what the Owner approved" —
* shared by the read-only preflight report (`externalApproval.ts`) and the real dispatch gate
* (`relay.ts`), so the two can never drift into checking different things. Verifies the Plan's own
* integrity first (`adapterPlan` must still hash to the `routingPlanHash` the Owner's approval is
* bound to — catches a stale or tampered Thread/Packet), then that the named adapterId/role is one of
* the approved selections.
*/
function checkAdapterPlanMembership(adapterPlan, routingPlanHash, adapterId, role) {
	if (hashJson(adapterPlan) !== routingPlanHash) return {
		ok: false,
		detail: "adapterPlan does not match its routingPlanHash (stale or tampered)"
	};
	const selection = adapterPlan.selections.find((candidate) => candidate.adapterId === adapterId);
	if (!selection) return {
		ok: false,
		detail: `Task Packet adapterPlan does not include ${adapterId}`
	};
	if (selection.role !== role) return {
		ok: false,
		detail: `Task Packet adapterPlan approves ${adapterId} for role ${selection.role}, not ${role}`
	};
	return {
		ok: true,
		detail: `adapterPlan approves ${adapterId} for role ${role}, routingPlanHash verified`
	};
}
function validateAdapterPlan(plan, allowedCapabilities = ["read", "propose"]) {
	if (plan.version !== "v1" || plan.externalSend !== false || !Array.isArray(plan.selections) || plan.selections.length === 0) throw new AdapterRegistryError("adapter plan shape or external-send boundary is invalid");
	const seenRoles = /* @__PURE__ */ new Set();
	for (const selection of plan.selections) {
		const profile = getAdapterProfile(selection.adapterId);
		if (profile.status !== "available") throw new AdapterRegistryError(`adapter is not available: ${selection.adapterId}`);
		if (!profile.roles.includes(selection.role)) throw new AdapterRegistryError(`adapter ${selection.adapterId} does not support role ${selection.role}`);
		if (profile.dataPolicy !== "local-only") throw new AdapterRegistryError(`adapter ${selection.adapterId} is outside local-only MVP boundary`);
		if (!profile.capabilities.every((capability) => allowedCapabilities.includes(capability))) throw new AdapterRegistryError(`adapter ${selection.adapterId} exceeds approved capabilities`);
		if (seenRoles.has(selection.role)) throw new AdapterRegistryError(`duplicate adapter role: ${selection.role}`);
		seenRoles.add(selection.role);
	}
}
//#endregion
//#region src/main/jobLoop/contracts.ts
var allowedCapabilities = ["read", "propose"];
var TaskPacketRejectedError = class extends Error {
	code = "TASK_PACKET_REJECTED";
	details;
	constructor(details) {
		super(`Task packet rejected: ${details.join("; ")}`);
		this.details = details;
	}
};
function validateApprovedTask(packet, clock = /* @__PURE__ */ new Date()) {
	const errors = [];
	if (!packet?.taskId) errors.push("taskId is required");
	if (!packet?.scope || packet.scopeHash !== hashJson(packet.scope)) errors.push("scope hash mismatch");
	if (!packet?.context || packet.contextHash !== hashJson(packet.context)) errors.push("context hash mismatch");
	if (!packet?.target?.repository || !packet.target.branch || !packet.target.worktree) errors.push("dispatch target is incomplete");
	if (!Array.isArray(packet?.target?.allowedFiles) || !Array.isArray(packet?.target?.forbiddenChanges)) errors.push("dispatch target boundaries are invalid");
	const approval = packet?.approval;
	if (!approval || approval.status !== "active") errors.push("active approval is required");
	if (!approval?.taskId || approval.taskId !== packet.taskId) errors.push("approval taskId mismatch");
	if (!approval?.scopeHash || approval.scopeHash !== packet.scopeHash) errors.push("approval scope hash mismatch");
	if (!approval?.routingPlanHash || approval.routingPlanHash !== hashJson(packet.adapterPlan)) errors.push("approval routing plan hash mismatch");
	if (!approval?.approvedBy) errors.push("approval owner is required");
	const expiresAt = approval?.expiresAt ? new Date(approval.expiresAt).getTime() : NaN;
	if (!Number.isFinite(expiresAt)) errors.push("approval expiry is invalid");
	else if (expiresAt <= clock.getTime()) errors.push("approval is expired");
	if (!Array.isArray(approval?.capabilities) || approval.capabilities.some((capability) => !allowedCapabilities.includes(capability))) errors.push("capability is outside the Fake Adapter grant");
	if (!packet?.adapter) errors.push("adapter mode is required");
	try {
		validateAdapterPlan(packet.adapterPlan);
	} catch (error) {
		errors.push(error.message);
	}
	if (![
		"success",
		"partial",
		"failed",
		"invalid"
	].includes(packet?.fixtureMode)) errors.push("unknown fixture mode");
	if (errors.length) throw new TaskPacketRejectedError(errors);
}
/**
* Identifies one Job registration. Must change whenever the *approved authorisation* changes — not
* just the narrative Scope/Context — so a Packet approving a different adapterPlan (or issued under a
* different Approval) always gets its own Job Ledger rather than silently reusing one written for a
* different Plan. `approvalId` and `routingPlanHash` are included for exactly this reason: two Packets
* with the same Scope/Context/Target but a different adapterPlan (different routingPlanHash) or a
* different Approval event (different approvalId) must never collide into the same jobId.
* Re-running the identical Packet (same approvalId, same routingPlanHash) is unaffected and still
* reuses the existing Job — that idempotency is intentional and unchanged.
*/
function createDispatchKey(packet) {
	return hashJson([
		packet.taskId,
		packet.scopeHash,
		packet.contextHash,
		packet.target,
		packet.adapter,
		packet.approval.approvalId,
		packet.approval.routingPlanHash,
		packet.frontdoorBinding ?? null,
		packet.implementationBinding ?? null,
		"debate-round-1"
	]);
}
var transitions = {
	queued: [
		"running",
		"cancelled",
		"recovery-needed"
	],
	running: [
		"awaiting-review",
		"failed",
		"cancelled",
		"recovery-needed"
	],
	"awaiting-review": [],
	failed: [],
	cancelled: [],
	"recovery-needed": [
		"running",
		"cancelled",
		"failed"
	]
};
function canTransition(from, to) {
	return transitions[from]?.includes(to) ?? false;
}
function assertTransition(from, to) {
	if (!canTransition(from, to)) throw new Error(`Invalid job transition: ${from} -> ${to}`);
}
//#endregion
//#region src/main/jobLoop/conversationAdapters.ts
function adapterSupportsRole(adapter, role) {
	return (adapter.supportedRoles ?? [adapter.role]).includes(role);
}
var AdapterProtocolError = class extends Error {
	code = "ADAPTER_PROTOCOL_ERROR";
	constructor(message) {
		super(message);
	}
};
/** Shared in-process behaviour for the Fake Adapters: answer immediately, keep the 3-step contract. */
var InProcessConversationAdapter = class {
	answers = /* @__PURE__ */ new Map();
	async send(request) {
		if (request.role !== this.role) throw new AdapterProtocolError(`adapter ${this.adapterId} cannot take role ${request.role}`);
		const adapterConversationId = `${this.adapterId}:${request.threadId}:${request.sequence}`;
		this.answers.set(adapterConversationId, this.compose(request));
		return {
			dispatchId: request.dispatchId,
			adapterId: this.adapterId,
			adapterConversationId,
			acceptedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
	}
	async getState(acceptance) {
		return this.answers.has(acceptance.adapterConversationId) ? "ready" : "failed";
	}
	async receive(acceptance) {
		const answer = this.answers.get(acceptance.adapterConversationId);
		if (!answer) throw new AdapterProtocolError(`no pending answer for ${acceptance.adapterConversationId}`);
		this.answers.delete(acceptance.adapterConversationId);
		return answer;
	}
};
var FakeProposalConversationAdapter = class extends InProcessConversationAdapter {
	fixture;
	adapterId = "fake-ai-a";
	role = "proposal";
	constructor(fixture = "success") {
		super();
		this.fixture = fixture;
	}
	compose({ title, priorTurns }) {
		const round = priorTurns.filter((turn) => turn.adapterId === this.adapterId).length + 1;
		const critique = [...priorTurns].reverse().find((turn) => turn.role === "critic");
		return {
			content: critique ? `再提案${round}: 反論「${critique.content}」を受け、承認済みScope内で対応方針を絞り込む。` : `提案${round}: ${title}について、承認済みScopeとhashを検証したうえで最小の実装方針を出す。`,
			status: this.fixture,
			summary: `Fake提案 ${round} 件目`,
			verification: [{
				name: "scope-boundary",
				status: "pass"
			}],
			risks: this.fixture === "partial" ? ["partial Resultの採用可否はOwner判断が必要"] : [],
			...this.fixture === "partial" ? { questions: [{
				kind: "approval-required",
				text: "partial Resultを採用して次のNodeへ進めるかOwner判断が必要です。",
				required: true,
				blocking: true
			}] } : {}
		};
	}
};
var FakeCriticConversationAdapter = class extends InProcessConversationAdapter {
	fixture;
	adapterId = "fake-ai-b";
	role = "critic";
	constructor(fixture = "success") {
		super();
		this.fixture = fixture;
	}
	compose({ priorTurns, dependencyResults }) {
		const target = [...priorTurns].reverse().find((turn) => turn.role === "proposal");
		const dependency = dependencyResults?.[0];
		const round = priorTurns.filter((turn) => turn.adapterId === this.adapterId).length + 1;
		return {
			content: target ? `反論${round}: 提案「${target.content}」は停止条件とResult検証の記述が不足しているため、失敗系の扱いを明示すべきである。` : dependency ? `反論${round}: 依存Node「${dependency.nodeId}」のResult（${dependency.resultRef}）を受け、停止条件とResult検証を確認した。` : `反論${round}: 対象となる提案が存在しないため評価できない。`,
			status: this.fixture,
			summary: `Fake反論 ${round} 件目`,
			verification: [{
				name: "prior-turn-reference",
				status: target || dependency ? "pass" : "not-run"
			}],
			risks: target || dependency ? [] : ["評価対象の提案が存在しない"]
		};
	}
};
/** Candidate probe used by the Implementation Agent vertical slice; it never writes files. */
var FakeImplementationConversationAdapter = class extends InProcessConversationAdapter {
	adapterId = "fake-implementation";
	role = "implementation";
	compose({ title, approvedFileSet }) {
		const relativePath = approvedFileSet?.[0];
		if (!relativePath) throw new AdapterProtocolError("implementation adapter requires an approved candidate file set");
		const sourceFile = {
			relativePath,
			content: `候補: ${title}`
		};
		const files = [{
			...sourceFile,
			contentHash: hashJson(sourceFile.content)
		}];
		const candidate = {
			kind: "candidate-file-set",
			baseSnapshotHash: hashJson({ title }),
			files,
			candidateHash: hashJson({
				kind: "candidate-file-set",
				baseSnapshotHash: hashJson({ title }),
				files
			})
		};
		return {
			content: JSON.stringify(candidate),
			status: "success",
			summary: "Fake implementation candidate",
			artifact: candidate,
			verification: [{
				name: "candidate-schema",
				status: "pass"
			}],
			risks: ["Fake candidate only; semantic implementation review is separate"]
		};
	}
};
//#endregion
//#region src/main/jobLoop/ledger.ts
async function ensureDir(directory) {
	await (0, node_fs_promises.mkdir)(directory, { recursive: true });
}
async function writeJsonAtomic(filePath, value) {
	await ensureDir(node_path.default.dirname(filePath));
	const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
	await (0, node_fs_promises.writeFile)(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	await (0, node_fs_promises.rename)(temporaryPath, filePath);
}
/** Creates a file only if it does not exist yet, so two concurrent claims cannot both succeed. */
async function writeJsonExclusive(filePath, value) {
	await ensureDir(node_path.default.dirname(filePath));
	await (0, node_fs_promises.writeFile)(filePath, `${JSON.stringify(value, null, 2)}\n`, {
		encoding: "utf8",
		flag: "wx"
	});
}
async function removeFile(filePath) {
	await (0, node_fs_promises.rm)(filePath, { force: true });
}
async function appendEvent(filePath, event) {
	await ensureDir(node_path.default.dirname(filePath));
	await (0, node_fs_promises.writeFile)(filePath, `${JSON.stringify(event)}\n`, {
		encoding: "utf8",
		flag: "a"
	});
}
async function readJson(filePath) {
	return JSON.parse(await (0, node_fs_promises.readFile)(filePath, "utf8"));
}
async function readEvents(filePath) {
	try {
		return (await (0, node_fs_promises.readFile)(filePath, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line));
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw error;
	}
}
async function listJobIds(runtimeRoot) {
	try {
		return (await (0, node_fs_promises.readdir)(node_path.default.join(runtimeRoot, "jobs"), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw error;
	}
}
//#endregion
//#region src/main/jobLoop/externalApproval.ts
var ExternalSendBlockedError = class extends Error {
	code = "EXTERNAL_SEND_BLOCKED";
	details;
	constructor(details) {
		super(`External send blocked: ${details.join("; ")}`);
		this.details = details;
	}
};
/** Owner-placed approvals live outside the renderer, so nothing in ADF can create one. */
function externalApprovalPath(runtimeRoot, threadId) {
	return node_path.default.join(runtimeRoot, "external-send-approvals", `${threadId}.json`);
}
async function readExternalApproval(runtimeRoot, threadId) {
	try {
		return await readJson(externalApprovalPath(runtimeRoot, threadId));
	} catch (error) {
		if (error.code === "ENOENT") return null;
		throw error;
	}
}
/**
* Every condition the Owner should see before authorising one external send. Produces a report
* rather than throwing, so the gate can be shown in the UI without attempting anything.
*/
function preflightExternalSend({ profile, adapterRole, transport, packet, approval, sendsAlreadyMade, now, approvedPlanBinding }) {
	const checks = [];
	const blockingReasons = [];
	/**
	* `detail` states the failure. Directional checks pass `passDetail` too, so a green line never
	* shows the Owner the sentence that describes it going wrong.
	*/
	const require = (name, ok, detail, passDetail) => {
		checks.push({
			name,
			status: ok ? "pass" : "fail",
			detail: ok ? passDetail ?? detail : detail
		});
		if (!ok) blockingReasons.push(`${name}: ${detail}`);
	};
	const isLocalHttpLocalOnly = profile.dataPolicy === "local-only" && transport.connection === "local-http";
	require("adapter-available", profile.status === "available", `adapter status is ${profile.status}`, "adapter is available");
	require("packet-is-synthetic", packet.kind === "synthetic-connectivity-probe", `packet kind is ${packet.kind}`);
	require("adapter-declares-role", profile.roles.includes(adapterRole), `adapter profile does not declare role ${adapterRole}`, `adapter profile declares role ${adapterRole}`);
	require("packet-matches-adapter-role", packet.role === adapterRole, `packet role is ${packet.role}, adapter role is ${adapterRole}`);
	require("adapter-declares-external-send", profile.dataPolicy === "external-send" || isLocalHttpLocalOnly, `data policy is ${profile.dataPolicy}`, isLocalHttpLocalOnly ? "data policy is local-only over a confirmed local-http connection" : `data policy is ${profile.dataPolicy}`);
	require("transport-configured", transport.connection !== "unknown", `transport connection is ${transport.connection}`);
	require("profile-transport-connection-matches", profile.connection === transport.connection, `profile connection is ${profile.connection}, transport connection is ${transport.connection}`, `profile and transport both declare ${profile.connection}`);
	const credential = transport.credentialStatus();
	require("credential-present", !credential.required || credential.present, `no credential is set at ${credential.source}; the Owner sets it outside ADF`, credential.required ? `a credential is set at ${credential.source}` : `no credential is required (${credential.source})`);
	if (isLocalHttpLocalOnly) {
		require("local-endpoint-confirmed", transport.isLocalEndpoint?.() ?? false, "transport target is not confirmed to be localhost / 127.0.0.1", "transport target is confirmed to be localhost / 127.0.0.1");
		if (approvedPlanBinding) {
			const membership = checkAdapterPlanMembership(approvedPlanBinding.adapterPlan, approvedPlanBinding.routingPlanHash, profile.adapterId, adapterRole);
			require("adapterPlan-includes-selection", membership.ok, membership.detail, membership.detail);
		}
	} else {
		require("owner-approval-present", Boolean(approval), approval ? `approval ${approval.approvalId}` : "no execution approval on disk for this thread");
		if (approval) {
			require("approval-matches-thread", approval.threadId === packet.threadId && approval.taskId === packet.taskId, `approval targets ${approval.taskId} / ${approval.threadId}`);
			require("approval-matches-adapter", approval.adapterId === profile.adapterId, `approval targets adapter ${approval.adapterId}`);
			require("approval-matches-role", approval.role === adapterRole, `approval is for role ${approval.role}, this dispatch is ${adapterRole}`);
			require("approval-matches-provider", approval.provider === transport.providerId, `approval targets provider ${approval.provider}, transport is ${transport.providerId}`);
			require("approval-matches-packet", approval.packetHash === packet.packetHash, "approval is bound to a different packet hash", "approval is bound to this packet hash");
			require("approval-matches-scope", approval.scopeHash === packet.scopeHash, "the approved Scope hash does not match this thread; the Scope changed since the approval was granted", "the approved Scope hash matches this thread");
			require("approval-matches-context", approval.contextHash === packet.contextHash, "the approved Context hash does not match this thread", "the approved Context hash matches this thread");
			const expiresAt = new Date(approval.expiresAt).getTime();
			require("approval-not-expired", Number.isFinite(expiresAt) && expiresAt > now.getTime(), `approval expires at ${approval.expiresAt}`);
			require("send-budget-remaining", sendsAlreadyMade < approval.maxSends, `${sendsAlreadyMade} of ${approval.maxSends} approved sends already used`);
			require("cost-tier-declared", approval.costTier !== "unknown", `approved cost tier is ${approval.costTier}`);
		}
	}
	return {
		ok: blockingReasons.length === 0,
		provider: transport.providerId,
		adapterId: profile.adapterId,
		role: adapterRole,
		connection: transport.connection,
		costTier: approval?.costTier ?? profile.costTier,
		packetHash: packet.packetHash,
		scopeHash: packet.scopeHash,
		contextHash: packet.contextHash,
		sendsRemaining: approval ? Math.max(0, approval.maxSends - sendsAlreadyMade) : 0,
		credential,
		...approval ? {
			approvalId: approval.approvalId,
			expiresAt: approval.expiresAt
		} : {},
		checks,
		blockingReasons
	};
}
function assertExternalSendAllowed(preflight) {
	if (!preflight.ok) throw new ExternalSendBlockedError(preflight.blockingReasons);
}
//#endregion
//#region src/main/jobLoop/syntheticPacket.ts
var PacketBoundaryError = class extends Error {
	code = "PACKET_BOUNDARY_VIOLATION";
	details;
	constructor(details) {
		super(`Synthetic packet boundary violated: ${details.join("; ")}`);
		this.details = details;
	}
};
var instruction = [
	"これはAI開発運用基盤(ADF)の接続確認用の合成パケットである。実プロジェクトの作業依頼ではない。",
	"次の3点だけを日本語200文字以内で答えること。",
	"1) このパケットを受信したこと",
	"2) 与えられた役割名",
	"3) 追加の文脈を要求せずに応答を終えること",
	"ファイル、リポジトリ、URL、コマンド実行、外部参照を要求してはならない。"
].join("\n");
var resultFormat = "プレーンテキスト。200文字以内。コードブロック・ツール呼び出し・追加質問を含めない。";
var stopConditions = [
	"追加の文脈やファイルを要求された場合は停止する",
	"応答が200文字を超える場合は切り詰めて記録する",
	"所定の時間内に応答が無い場合はtimeoutとして停止する"
];
/**
* Builds the one payload an external Adapter may receive. Derived only from identifiers and
* fixed text: no Turn content, no repo, no Vault, no approved-Task body.
*/
function buildSyntheticPacket(thread, role, attempt, createdAt, dependencyResults) {
	const dependencyContext = dependencyResults?.filter((dependency) => dependency.content?.trim()).map((dependency) => ({
		nodeId: dependency.nodeId,
		resultHash: dependency.resultHash,
		content: dependency.content.slice(0, 1e3)
	}));
	const body = {
		kind: "synthetic-connectivity-probe",
		taskId: thread.taskId,
		threadId: thread.threadId,
		jobId: thread.jobId,
		role,
		sequence: thread.turns.length,
		attempt,
		scopeHash: thread.scopeHash,
		contextHash: thread.contextHash,
		instruction,
		resultFormat,
		stopConditions,
		...dependencyContext?.length ? { dependencyContext } : {}
	};
	const packetHash = hashJson(body);
	return {
		...body,
		packetId: `synthetic-${packetHash.slice(0, 16)}`,
		packetHash,
		createdAt
	};
}
/** Anything that could smuggle project content, a filesystem path, or a credential out of ADF. */
var forbiddenPatterns = [
	{
		name: "absolute-path",
		pattern: /(^|[^A-Za-z0-9])\/(Users|home|var|etc|private)\//
	},
	{
		name: "home-shortcut",
		pattern: /(^|\s)~\//
	},
	{
		name: "vault-reference",
		pattern: /secondbrain|Obsidian|\.md\b/i
	},
	{
		name: "repo-reference",
		pattern: /\.git\b|github\.com|worktree/i
	},
	{
		name: "credential-like",
		pattern: /sk-[A-Za-z0-9-]{8,}|ANTHROPIC_API_KEY|api[_-]?key|bearer\s|authorization/i
	},
	{
		name: "url",
		pattern: /https?:\/\//i
	}
];
/**
* Fails closed before any transport sees the packet. The packet is fixed text, so a hit here means
* something started assembling it from real content and the send must not happen.
*/
function assertPacketBoundary(packet) {
	const serialised = JSON.stringify(packet);
	const details = forbiddenPatterns.filter((rule) => rule.pattern.test(serialised)).map((rule) => `packet contains ${rule.name}`);
	if (packet.kind !== "synthetic-connectivity-probe") details.push("packet is not a synthetic connectivity probe");
	if (packet.packetHash !== hashJson({
		kind: packet.kind,
		taskId: packet.taskId,
		threadId: packet.threadId,
		jobId: packet.jobId,
		role: packet.role,
		sequence: packet.sequence,
		attempt: packet.attempt,
		scopeHash: packet.scopeHash,
		contextHash: packet.contextHash,
		instruction: packet.instruction,
		resultFormat: packet.resultFormat,
		stopConditions: packet.stopConditions,
		...packet.dependencyContext?.length ? { dependencyContext: packet.dependencyContext } : {}
	})) details.push("packet hash does not match its content");
	if (serialised.length > 4e3) details.push(`packet is larger than the 4000 character probe limit: ${serialised.length}`);
	if (details.length) throw new PacketBoundaryError(details);
}
//#endregion
//#region src/shared/secretSentinel.ts
/**
* Union of the previous `containsSecretSentinel` set and the display-mask set. Patterns are
* non-global on purpose: `test()` against a global regex carries `lastIndex` between calls.
*/
var SECRET_PATTERNS = [
	{
		name: "anthropic-api-key",
		pattern: /ANTHROPIC_API_KEY/i
	},
	{
		name: "openai-api-key",
		pattern: /OPENAI_API_KEY/i
	},
	{
		name: "api-key-assignment",
		pattern: /api[_-]?key\s*[:=]/i
	},
	{
		name: "sk-credential",
		pattern: /sk-[A-Za-z0-9_-]{12,}/i
	},
	{
		name: "bearer-credential",
		pattern: /Bearer\s+[A-Za-z0-9._-]{12,}/i
	},
	{
		name: "credential-assignment",
		pattern: /(?:sk-|api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,}]+/i
	}
];
/** Kept character-for-character identical to the mask that was inlined in each projection. */
var MASK_SOURCE = "(sk-|api[_-]?key|token|secret|password)\\s*[:=]\\s*[^\\s,}]+";
var CredentialShapedTextError = class extends Error {
	code = "CREDENTIAL_SHAPED_TEXT";
	/** `"content (api-key-assignment)"` entries. Deliberately never the matched text. */
	fields;
	source;
	constructor(source, fields) {
		super(`${source} contains credential-shaped text: ${fields.join(", ")}`);
		this.source = source;
		this.fields = fields;
	}
};
/**
* The single gate every inbound boundary calls before externally-authored text is persisted or
* adopted. Callers pass the fields they have already type-checked; a non-string here is a caller
* bug, not something to skip quietly, so it is reported rather than ignored.
*/
function assertNoCredentialShapedText(source, fields) {
	const found = [];
	for (const [field, value] of Object.entries(fields)) {
		if (value === void 0 || value === null) continue;
		if (typeof value !== "string") {
			found.push(`${field} (not-a-string)`);
			continue;
		}
		for (const name of detectSecrets(value)) found.push(`${field} (${name})`);
	}
	if (found.length) throw new CredentialShapedTextError(source, [...new Set(found)].sort());
}
/** Names of every pattern that matched. Returns names only — never the text that matched. */
function detectSecrets(value) {
	return SECRET_PATTERNS.filter((entry) => entry.pattern.test(value)).map((entry) => entry.name);
}
function containsSecret(value) {
	return SECRET_PATTERNS.some((entry) => entry.pattern.test(value));
}
/**
* Display-time redaction for Owner-facing text. This is a courtesy for reading, not a boundary:
* anything that must not be stored is rejected by `containsSecret` before it is written.
* A fresh regex per call keeps the global flag's `lastIndex` from leaking between callers.
*/
function maskSecrets(value) {
	return value.replace(new RegExp(MASK_SOURCE, "gi"), "$1=<redacted>");
}
//#endregion
//#region src/main/jobLoop/resultEnvelope.ts
var ResultEnvelopeRejectedError = class extends Error {
	code = "RESULT_ENVELOPE_REJECTED";
	details;
	constructor(details) {
		super(`Result envelope rejected: ${details.join("; ")}`);
		this.details = details;
	}
};
/**
* The free-text fields an Adapter can fill. Identifiers and hashes are excluded: they are generated
* by ADF, and scanning them only invites false positives.
*/
function secretScanTargets(envelope) {
	const targets = [];
	const push = (field, value) => {
		if (typeof value === "string" && value.length > 0) targets.push({
			field,
			value
		});
	};
	push("content", envelope.content);
	push("summary", envelope.summary);
	push("terminationReason", envelope.terminationReason);
	push("nextOwnerDecision", envelope.nextOwnerDecision);
	envelope.risks.forEach((risk, index) => push(`risks[${index}]`, risk));
	envelope.verification.forEach((item, index) => {
		push(`verification[${index}].name`, item.name);
		push(`verification[${index}].reason`, item.reason);
	});
	envelope.questions?.forEach((question, index) => push(`questions[${index}]`, JSON.stringify(question)));
	envelope.dependencyResults?.forEach((dependency, index) => push(`dependencyResults[${index}].content`, dependency.content));
	if (envelope.artifact && typeof envelope.artifact === "object") push("artifact", JSON.stringify(envelope.artifact));
	return targets;
}
/**
* Fails closed on credential-shaped text before a Result is persisted or adopted.
*
* ADF already guards the two other directions: `assertPacketBoundary` on the way out to an Adapter,
* and `containsSecret` on Work Plane candidates. The Adapter's own answer had no such check, so a
* credential quoted back by an external AI would be masked on screen but written verbatim into
* `events.jsonl` and the Evidence file. "The Adapter will not return credentials" is a contract with
* an external system, not a guarantee, so the boundary is closed on ADF's side.
*
* The thrown message carries the field and the pattern name only. Recording the matched text would
* reproduce the very value this check exists to keep out of the Ledger.
*/
function assertEnvelopeCarriesNoCredentials(envelope) {
	const fields = Object.fromEntries(secretScanTargets(envelope).map((target) => [target.field, target.value]));
	try {
		assertNoCredentialShapedText("result", fields);
	} catch (error) {
		if (error instanceof CredentialShapedTextError) throw new ResultEnvelopeRejectedError([error.message]);
		throw error;
	}
}
function validateResultEnvelope(envelope, expected) {
	const errors = [];
	if (envelope.taskId !== expected.taskId) errors.push("taskId mismatch");
	if (envelope.jobId !== expected.jobId) errors.push("jobId mismatch");
	if (envelope.inputHash !== expected.inputHash) errors.push("inputHash mismatch");
	if (!envelope.adapterId || !envelope.role) errors.push("adapter identity is missing");
	if (![
		"success",
		"partial",
		"failed",
		"invalid",
		"timeout",
		"cancelled"
	].includes(envelope.status)) errors.push("invalid result status");
	if (!envelope.summary || !envelope.terminationReason) errors.push("summary or termination reason is missing");
	if (typeof envelope.summary !== "string" || typeof envelope.terminationReason !== "string" || typeof envelope.nextOwnerDecision !== "string") errors.push("summary, termination reason, or next owner decision is not a string");
	if (Array.isArray(envelope.verification) && !envelope.verification.every((item) => item !== null && typeof item === "object" && typeof item.name === "string")) errors.push("a verification entry is malformed");
	if (Array.isArray(envelope.risks) && !envelope.risks.every((risk) => typeof risk === "string")) errors.push("a risk entry is not a string");
	if (envelope.content !== void 0 && typeof envelope.content !== "string") errors.push("result content is invalid");
	if (!Array.isArray(envelope.verification) || !Array.isArray(envelope.risks)) errors.push("verification or risks is not an array");
	if (envelope.questions !== void 0 && !Array.isArray(envelope.questions)) errors.push("questions is not an array");
	if (envelope.dependencyResults !== void 0 && !Array.isArray(envelope.dependencyResults)) errors.push("dependencyResults is not an array");
	if (errors.length) throw new ResultEnvelopeRejectedError(errors);
	assertEnvelopeCarriesNoCredentials(envelope);
}
//#endregion
//#region src/main/jobLoop/dispatchAck.ts
var DispatchBlockedError = class extends Error {
	code = "DISPATCH_BLOCKED";
	details;
	constructor(details) {
		super(`Blocked / Delivery not confirmed: ${details.join("; ")}`);
		this.details = details;
	}
};
function packetContent(packet) {
	return {
		dispatchId: `dispatch-${hashJson([
			packet.taskId,
			packet.scopeHash,
			packet.contextHash,
			packet.target,
			packet.adapter
		]).slice(0, 24)}`,
		taskId: packet.taskId,
		scopeHash: packet.scopeHash,
		contextHash: packet.contextHash,
		target: packet.target,
		capabilities: [...packet.approval.capabilities],
		acceptance: [...packet.acceptance],
		stopConditions: [...packet.stopConditions],
		adapter: packet.adapter,
		adapterPlan: packet.adapterPlan
	};
}
function createDispatchPacket(packet) {
	const content = packetContent(packet);
	return {
		...content,
		packetHash: hashJson(content)
	};
}
function same(valueA, valueB) {
	return hashJson(valueA) === hashJson(valueB);
}
function targetMismatches(expected, actual) {
	if (!actual) return ["ack target is missing"];
	const errors = [];
	for (const key of [
		"repository",
		"branch",
		"worktree",
		"allowedFiles",
		"forbiddenChanges"
	]) if (!same(expected[key], actual[key])) errors.push(`target ${key} mismatch`);
	return errors;
}
function validateDispatchAck(packet, ack) {
	if (!ack) throw new DispatchBlockedError(["ack is missing"]);
	const errors = [];
	if (ack.status !== "acknowledged") errors.push(`ack status is ${ack.status}`);
	if (ack.dispatchId !== packet.dispatchId) errors.push("dispatchId mismatch");
	if (ack.taskId !== packet.taskId) errors.push("taskId mismatch");
	if (ack.packetHash !== packet.packetHash) errors.push("packet hash mismatch");
	if (ack.acceptedScopeHash !== packet.scopeHash) errors.push("scope hash mismatch");
	if (!same(ack.acceptedCapabilities, packet.capabilities)) errors.push("capability grant mismatch");
	errors.push(...targetMismatches(packet.target, ack.target));
	if (errors.length) throw new DispatchBlockedError(errors);
}
var FakeDispatchReceiver = class {
	mutate;
	constructor(mutate) {
		this.mutate = mutate;
	}
	receive(packet) {
		const ack = {
			dispatchId: packet.dispatchId,
			taskId: packet.taskId,
			packetHash: packet.packetHash,
			acceptedScopeHash: packet.scopeHash,
			acceptedCapabilities: [...packet.capabilities],
			target: packet.target,
			status: "acknowledged",
			receivedAt: nowIso()
		};
		return this.mutate ? this.mutate(ack) : ack;
	}
};
//#endregion
//#region src/main/jobLoop/fakeAdapters.ts
var FakeProposalAdapter = class {
	id = "fake-ai-a";
	role = "proposal";
	run({ task, inputHash, createdAt }) {
		return {
			artifactId: `artifact-${this.id}-${hashJson(inputHash).slice(0, 10)}`,
			adapter: this.id,
			role: this.role,
			status: task.fixtureMode === "failed" ? "failed" : "success",
			createdAt,
			proposal: `提案: ${task.objective}。承認範囲とhashを検証し、A/BのResultをEvidenceとしてOwner Reviewへ送る。`,
			changes: [],
			verification: [{
				name: "scope-boundary",
				status: "pass"
			}]
		};
	}
};
var FakeCriticAdapter = class {
	id = "fake-ai-b";
	role = "critic";
	run({ task, inputHash, priorArtifact, createdAt }) {
		return {
			artifactId: `artifact-${this.id}-${hashJson(inputHash).slice(0, 10)}`,
			adapter: this.id,
			role: this.role,
			status: task.fixtureMode === "invalid" ? "invalid" : "success",
			createdAt,
			respondsToArtifact: priorArtifact.artifactId,
			respondsToHash: hashJson(priorArtifact),
			critique: `反論: 提案AはResultをOwner Reviewへ送る点は妥当だが、${task.fixtureMode === "partial" ? "partial Resultを成功と混同しない表示" : "Resultの不正混入と重複dispatchの検証"}を追加すべきである。`,
			changes: [],
			verification: [{
				name: "prior-result-reference",
				status: "pass"
			}]
		};
	}
};
//#endregion
//#region src/main/jobLoop/runtime.ts
var JobRuntime = class {
	runtimeRoot;
	clock;
	adapters;
	receiver;
	constructor({ runtimeRoot = ".adf-runtime", clock = () => /* @__PURE__ */ new Date(), adapters = {}, receiver = new FakeDispatchReceiver() } = {}) {
		this.runtimeRoot = node_path.default.resolve(runtimeRoot);
		this.clock = clock;
		this.receiver = receiver;
		this.adapters = {
			proposal: adapters.proposal ?? new FakeProposalAdapter(),
			critic: adapters.critic ?? new FakeCriticAdapter()
		};
	}
	jobDirectory(jobId) {
		return node_path.default.join(this.runtimeRoot, "jobs", jobId);
	}
	/**
	* Runs Approval, Dispatch Packet, ACK and Job registration, then stops at `queued`.
	* Callers that drive their own Adapter execution (the Conversation Relay) reuse this gate
	* instead of registering a Job of their own.
	*/
	async registerApprovedJob(packet) {
		validateApprovedTask(packet, this.clock());
		const dispatchKey = createDispatchKey(packet);
		const jobId = `job-${dispatchKey.slice(0, 16)}`;
		const directory = this.jobDirectory(jobId);
		const requestPath = node_path.default.join(directory, "request.json");
		const task = {
			taskId: packet.taskId,
			objective: packet.objective,
			scope: packet.scope,
			scopeHash: packet.scopeHash,
			context: packet.context,
			contextHash: packet.contextHash,
			acceptance: packet.acceptance,
			stopConditions: packet.stopConditions,
			adapter: packet.adapter,
			fixtureMode: packet.fixtureMode,
			target: packet.target,
			adapterPlan: packet.adapterPlan,
			...packet.frontdoorBinding ? { frontdoorBinding: packet.frontdoorBinding } : {},
			...packet.implementationBinding ? { implementationBinding: packet.implementationBinding } : {}
		};
		const inputHash = hashJson(task);
		if (await this.exists(requestPath)) {
			const existing = await readJson(requestPath);
			if (existing.jobId !== jobId || existing.dispatchKey !== dispatchKey || existing.inputHash !== hashJson(existing.task) || existing.inputHash !== inputHash || hashJson(existing.task.frontdoorBinding ?? null) !== hashJson(packet.frontdoorBinding ?? null) || hashJson(existing.task.implementationBinding ?? null) !== hashJson(packet.implementationBinding ?? null)) throw new DispatchBlockedError(["existing Job binding does not match the approved Packet; recovery-needed"]);
			return {
				jobId,
				directory,
				inputHash: existing.inputHash,
				createdAt: existing.createdAt,
				alreadyRegistered: true
			};
		}
		const dispatchPacket = createDispatchPacket(packet);
		const dispatchAck = this.receiver.receive(dispatchPacket);
		validateDispatchAck(dispatchPacket, dispatchAck);
		if (!dispatchAck) throw new DispatchBlockedError(["ack is missing"]);
		validateAdapterPlan(packet.adapterPlan);
		const createdAt = this.clock().toISOString();
		const request = {
			jobId,
			dispatchKey,
			inputHash,
			createdAt,
			task
		};
		await ensureDir(directory);
		await writeJsonAtomic(node_path.default.join(directory, "dispatch-packet.json"), dispatchPacket);
		await writeJsonAtomic(node_path.default.join(directory, "dispatch-ack.json"), dispatchAck);
		await writeJsonAtomic(node_path.default.join(directory, "adapter-plan.json"), packet.adapterPlan);
		await this.record(directory, {
			type: "dispatch.sent",
			dispatchState: "dispatched",
			dispatchId: dispatchPacket.dispatchId,
			packetHash: dispatchPacket.packetHash,
			taskId: packet.taskId,
			at: createdAt
		});
		await this.record(directory, {
			type: "dispatch.acknowledged",
			dispatchState: "acknowledged",
			dispatchId: dispatchPacket.dispatchId,
			packetHash: dispatchPacket.packetHash,
			taskId: packet.taskId,
			at: dispatchAck.receivedAt
		});
		await this.record(directory, {
			type: "dispatch.preflight-valid",
			dispatchState: "preflight-valid",
			dispatchId: dispatchPacket.dispatchId,
			packetHash: dispatchPacket.packetHash,
			taskId: packet.taskId,
			at: this.clock().toISOString()
		});
		await writeJsonAtomic(requestPath, request);
		await writeJsonAtomic(node_path.default.join(directory, "approval.json"), packet.approval);
		await writeJsonAtomic(node_path.default.join(directory, "context-manifest.json"), {
			taskId: packet.taskId,
			contextHash: packet.contextHash,
			references: packet.context
		});
		await this.record(directory, {
			type: "job.registered",
			jobId,
			taskId: packet.taskId,
			state: "queued",
			at: createdAt
		});
		return {
			jobId,
			directory,
			inputHash,
			createdAt,
			alreadyRegistered: false
		};
	}
	async runApprovedTask(packet) {
		const { jobId, directory, inputHash, createdAt, alreadyRegistered } = await this.registerApprovedJob(packet);
		if (alreadyRegistered) return this.readJob(jobId);
		await this.transition(directory, "queued", "running", { type: "job.started" });
		const proposal = this.adapters.proposal.run({
			task: packet,
			inputHash,
			createdAt: this.clock().toISOString()
		});
		await this.recordAdapter(directory, proposal);
		const critique = this.adapters.critic.run({
			task: packet,
			inputHash,
			priorArtifact: proposal,
			createdAt: this.clock().toISOString()
		});
		await this.recordAdapter(directory, critique);
		const result = this.buildResult(packet, jobId, inputHash, proposal, critique, createdAt);
		await writeJsonAtomic(node_path.default.join(directory, "result.json"), result);
		await writeJsonAtomic(node_path.default.join(directory, "adapter-results.json"), result.adapterRuns);
		await writeJsonAtomic(node_path.default.join(directory, "evidence-links.json"), {
			taskId: packet.taskId,
			githubTask: packet.context.githubTask,
			obsidianContext: packet.context.obsidianContext,
			artifacts: [proposal.artifactId, critique.artifactId],
			resultHash: hashJson(result)
		});
		await this.record(directory, {
			type: "result.recorded",
			jobId,
			taskId: packet.taskId,
			status: result.status,
			resultHash: hashJson(result),
			at: this.clock().toISOString()
		});
		const terminalState = result.status === "success" || result.status === "partial" ? "awaiting-review" : "failed";
		await this.transition(directory, "running", terminalState, { type: `job.${terminalState}` });
		await this.projectBoard();
		return this.readJob(jobId);
	}
	buildResult(packet, jobId, inputHash, proposal, critique, createdAt) {
		let status = packet.fixtureMode;
		const errors = [];
		if (!proposal?.artifactId || !critique?.artifactId) errors.push("artifact id is missing");
		if (proposal?.status === "invalid" || critique?.status === "invalid") errors.push("adapter returned invalid status");
		if (errors.length) status = "invalid";
		for (const artifact of [proposal, critique]) validateResultEnvelope({
			resultId: artifact.artifactId,
			jobId,
			taskId: packet.taskId,
			adapterId: artifact.adapter,
			role: artifact.role,
			inputHash,
			scopeHash: packet.scopeHash,
			contextHash: packet.contextHash,
			status: artifact.status,
			content: artifact.proposal ?? artifact.critique ?? `${artifact.role} result`,
			summary: artifact.proposal ?? artifact.critique ?? `${artifact.role} result`,
			artifact: {
				artifactId: artifact.artifactId,
				changes: artifact.changes
			},
			verification: artifact.verification.map((item) => ({
				name: item.name,
				status: item.status
			})),
			risks: [],
			ownerDecisionRequired: true,
			nextOwnerDecision: "Review this adapter result",
			createdAt: artifact.createdAt,
			durationMs: 0,
			terminationReason: artifact.status === "success" ? "completed" : "fake-fixture-failure"
		}, {
			taskId: packet.taskId,
			jobId,
			inputHash
		});
		return {
			resultId: `result-${jobId}`,
			jobId,
			taskId: packet.taskId,
			status,
			inputHash,
			scopeHash: packet.scopeHash,
			contextHash: packet.contextHash,
			adapter: packet.adapter,
			adapterPlan: packet.adapterPlan,
			adapterRuns: [{
				resultId: proposal.artifactId,
				adapterId: proposal.adapter,
				role: proposal.role,
				inputHash,
				resultHash: hashJson(proposal),
				status: proposal.status,
				artifactId: proposal.artifactId,
				terminationReason: proposal.status === "success" ? "completed" : "fake-fixture-failure",
				createdAt: proposal.createdAt
			}, {
				resultId: critique.artifactId,
				adapterId: critique.adapter,
				role: critique.role,
				inputHash,
				resultHash: hashJson(critique),
				status: critique.status,
				artifactId: critique.artifactId,
				terminationReason: critique.status === "success" ? "completed" : "fake-fixture-invalid",
				createdAt: critique.createdAt
			}],
			role: "debate-run",
			createdAt,
			debate: {
				rounds: 1,
				participants: [{
					adapter: proposal.adapter,
					role: proposal.role,
					artifactId: proposal.artifactId,
					hash: hashJson(proposal)
				}, {
					adapter: critique.adapter,
					role: critique.role,
					artifactId: critique.artifactId,
					hash: hashJson(critique),
					respondsToHash: critique.respondsToHash
				}],
				proposal: proposal.proposal,
				critique: critique.critique
			},
			changes: [],
			verification: [
				{
					name: "task-scope",
					status: "pass",
					scopeHash: packet.scopeHash
				},
				{
					name: "context-reference",
					status: "pass",
					contextHash: packet.contextHash
				},
				{
					name: "fake-adapter-boundary",
					status: "pass",
					capabilities: ["read", "propose"]
				},
				...errors.length ? [{
					name: "result-shape",
					status: "fail",
					reason: errors.join("; ")
				}] : [{
					name: "result-shape",
					status: "pass"
				}]
			],
			risks: status === "partial" ? ["partial Resultの採用可否はOwner判断が必要"] : status === "failed" || status === "invalid" ? ["Fake討論Resultは採用せず、原因を確認する"] : [],
			ownerDecisionRequired: true,
			nextOwnerDecision: status === "success" ? "Aの提案とBの反論を確認し、採用・差し戻し・停止を判断する" : "Resultと失敗理由を確認し、再実行または停止を判断する"
		};
	}
	async record(directory, event) {
		await appendEvent(node_path.default.join(directory, "events.jsonl"), event);
	}
	async recordAdapter(directory, artifact) {
		await this.record(directory, {
			type: "adapter.result",
			adapter: artifact.adapter,
			role: artifact.role,
			artifactId: artifact.artifactId,
			resultHash: hashJson(artifact),
			at: this.clock().toISOString()
		});
	}
	async transition(directory, from, to, details) {
		assertTransition(from, to);
		await this.record(directory, {
			...details,
			from,
			to,
			at: this.clock().toISOString()
		});
	}
	async exists(filePath) {
		try {
			await readJson(filePath);
			return true;
		} catch (error) {
			if (error.code === "ENOENT") return false;
			throw error;
		}
	}
	async readJob(jobId) {
		const directory = this.jobDirectory(jobId);
		const events = await readEvents(node_path.default.join(directory, "events.jsonl"));
		const request = await readJson(node_path.default.join(directory, "request.json"));
		const result = await this.exists(node_path.default.join(directory, "result.json")) ? await readJson(node_path.default.join(directory, "result.json")) : null;
		return {
			jobId,
			state: [...events].reverse().find((event) => event.to)?.to ?? [...events].reverse().find((event) => event.state)?.state ?? "queued",
			request,
			events,
			result,
			dispatchState: [...events].reverse().find((event) => event.dispatchState)?.dispatchState ?? "preflight-valid",
			packetHash: [...events].reverse().find((event) => event.packetHash)?.packetHash ?? hashJson(request.task)
		};
	}
	async projectBoard() {
		const jobs = [];
		for (const jobId of await listJobIds(this.runtimeRoot)) jobs.push(await this.readJob(jobId));
		const cards = jobs.map((job) => ({
			taskId: job.request.task.taskId,
			jobId: job.jobId,
			objective: job.request.task.objective,
			boardLane: job.state === "awaiting-review" ? "owner-review" : job.state,
			formalLifecycle: "Approved / implementation result not yet adopted",
			ownerDecision: job.result?.nextOwnerDecision ?? "Job状態と停止理由を確認する",
			resultStatus: job.result?.status ?? null,
			evidence: job.result ? `jobs/${job.jobId}/evidence-links.json` : null,
			taskReference: job.request.task.context.githubTask,
			contextReferences: job.request.task.context.obsidianContext,
			lastUpdated: job.events.at(-1)?.at ?? null,
			sourceState: "Current",
			dispatchState: job.dispatchState,
			packetHash: job.packetHash
		}));
		const projection = {
			generatedAt: this.clock().toISOString(),
			source: "ADF Local Ledger",
			readOnly: true,
			cards
		};
		await writeJsonAtomic(node_path.default.join(this.runtimeRoot, "projection", "board.json"), projection);
		return projection;
	}
	async readBoard() {
		return readJson(node_path.default.join(this.runtimeRoot, "projection", "board.json"));
	}
};
var ThreadRejectedError = class extends Error {
	code = "THREAD_REJECTED";
	details;
	constructor(details) {
		super(`Thread rejected: ${details.join("; ")}`);
		this.details = details;
	}
};
var threadTransitions = {
	open: [
		"awaiting-owner",
		"recovery-needed",
		"stopped",
		"failed"
	],
	"awaiting-owner": [
		"open",
		"stopped",
		"approved",
		"failed"
	],
	"recovery-needed": [
		"open",
		"awaiting-owner",
		"stopped"
	],
	approved: ["completed", "stopped"],
	stopped: [],
	completed: [],
	failed: []
};
function assertThreadTransition(from, to) {
	if (!threadTransitions[from]?.includes(to)) throw new ThreadRejectedError([`invalid thread transition: ${from} -> ${to}`]);
}
function turnHash(turn) {
	return hashJson(turn);
}
function createThread(input) {
	const maxTurns = input.maxTurns ?? 6;
	if (!Number.isInteger(maxTurns) || maxTurns < 1) throw new ThreadRejectedError(["maxTurns must be a positive integer"]);
	if (!input.threadId || !input.taskId || !input.jobId) throw new ThreadRejectedError(["threadId, taskId and jobId are required"]);
	if (!input.approvalId || !input.scopeHash || !input.contextHash || !input.routingPlanHash || !input.inputHash) throw new ThreadRejectedError(["a Thread requires an approvalId, scopeHash, contextHash, routingPlanHash and inputHash"]);
	if (!input.adapterPlan || !Array.isArray(input.adapterPlan.selections) || input.adapterPlan.selections.length === 0) throw new ThreadRejectedError(["a Thread requires a non-empty adapterPlan, matching the approved routingPlanHash"]);
	return {
		threadId: input.threadId,
		taskId: input.taskId,
		jobId: input.jobId,
		title: input.title,
		approvalId: input.approvalId,
		scopeHash: input.scopeHash,
		contextHash: input.contextHash,
		routingPlanHash: input.routingPlanHash,
		adapterPlan: input.adapterPlan,
		...input.approvedFileSet ? { approvedFileSet: [...input.approvedFileSet] } : {},
		...input.implementationBinding ? { implementationBinding: input.implementationBinding } : {},
		inputHash: input.inputHash,
		state: "open",
		maxTurns,
		turns: [],
		ownerDecisions: [],
		createdAt: input.createdAt,
		updatedAt: input.createdAt
	};
}
function lastTurn(thread) {
	return thread.turns[thread.turns.length - 1];
}
/**
* Order, duplicate and parent-hash invariants. Shared by the normal and the recovery path so
* neither can weaken them.
*/
function turnPlacementErrors(thread, turn) {
	const errors = [];
	if (turn.threadId !== thread.threadId) errors.push("threadId mismatch");
	if (turn.jobId !== thread.jobId) errors.push("jobId mismatch");
	if (!turn.turnId) errors.push("turnId is required");
	if (thread.turns.some((existing) => existing.turnId === turn.turnId)) errors.push(`duplicate turnId: ${turn.turnId}`);
	if (turn.sequence !== thread.turns.length) errors.push(`turn sequence must be ${thread.turns.length}, received ${turn.sequence}`);
	if (thread.turns.length >= thread.maxTurns) errors.push(`max turns exceeded: ${thread.maxTurns}`);
	if (!turn.content) errors.push("turn content is required");
	if (![
		"success",
		"partial",
		"failed",
		"invalid"
	].includes(turn.status)) errors.push("invalid turn status");
	if (turn.respondsToTurnId) {
		const parent = thread.turns.find((existing) => existing.turnId === turn.respondsToTurnId);
		if (!parent) errors.push(`respondsToTurnId not found in thread: ${turn.respondsToTurnId}`);
		else if (turn.respondsToHash !== turnHash(parent)) errors.push("respondsToHash does not match the parent turn");
	} else if (turn.respondsToHash) errors.push("respondsToHash requires respondsToTurnId");
	else if (thread.turns.length > 0) errors.push("every turn after the first must reference a parent turn");
	return errors;
}
function withAppendedTurn(thread, turn, errors) {
	if (errors.length) throw new ThreadRejectedError(errors);
	return {
		...thread,
		turns: [...thread.turns, turn],
		updatedAt: turn.createdAt
	};
}
/** Appends an Adapter answer. Pure: returns a new Thread and never mutates the input. */
function appendTurn(thread, turn) {
	const errors = turnPlacementErrors(thread, turn);
	if (thread.state !== "open") errors.unshift(`thread is not open: ${thread.state}`);
	return withAppendedTurn(thread, turn, errors);
}
/**
* Appends an ADF-authored failure record from `recovery-needed`. This is the only way a Turn can
* be added outside `open`, and it accepts nothing but a `failed` Turn carrying an error reference.
*/
function appendRecoveryTurn(thread, turn) {
	const errors = turnPlacementErrors(thread, turn);
	if (thread.state !== "recovery-needed") errors.unshift(`thread is not recovery-needed: ${thread.state}`);
	if (turn.status !== "failed") errors.push(`a recovery turn must be failed, received ${turn.status}`);
	if (!turn.errorRef) errors.push("a recovery turn requires an errorRef");
	return withAppendedTurn(thread, turn, errors);
}
function withState(thread, to, at, stopReason) {
	assertThreadTransition(thread.state, to);
	return {
		...thread,
		state: to,
		updatedAt: at,
		...stopReason ? { stopReason } : {}
	};
}
var ownerActionTargets = {
	continue: "open",
	stop: "stopped",
	approve: "approved",
	"next-task": "completed"
};
/** Evidence before integration: an Owner cannot approve a Thread that produced no validated Result. */
function hasAdoptableEvidence(thread) {
	return thread.turns.some((turn) => Boolean(turn.resultEnvelopeRef) && (turn.status === "success" || turn.status === "partial"));
}
/** Moves a Thread into recovery and records what ADF knows about the interrupted send. */
function enterRecovery(thread, info, at) {
	return {
		...withState(thread, "recovery-needed", at),
		recovery: info
	};
}
/** Leaves recovery. The `recovery` block is dropped so a resolved Thread carries no stale reason. */
function leaveRecovery(thread, to, at, stopReason) {
	if (thread.state !== "recovery-needed") throw new ThreadRejectedError([`thread is not recovery-needed: ${thread.state}`]);
	const { recovery: _recovery, ...rest } = withState(thread, to, at, stopReason);
	return rest;
}
function applyOwnerDecision(thread, action, decidedAt, note) {
	const target = ownerActionTargets[action];
	if (!target) throw new ThreadRejectedError([`unknown owner action: ${action}`]);
	if (thread.state === "recovery-needed") throw new ThreadRejectedError([`thread needs recovery; use a recovery action instead of ${action}`]);
	if (action === "approve" && !hasAdoptableEvidence(thread)) throw new ThreadRejectedError(["approve requires at least one turn with a validated result envelope"]);
	if (action === "continue" && thread.turns.length >= thread.maxTurns) return {
		...withState(thread, "failed", decidedAt, `max turns reached: ${thread.maxTurns}`),
		ownerDecisions: [...thread.ownerDecisions, {
			action,
			atTurnId: lastTurn(thread)?.turnId ?? null,
			decidedAt,
			note
		}]
	};
	const moved = withState(thread, target, decidedAt, action === "stop" ? note ?? "stopped by Project Owner" : void 0);
	return {
		...moved,
		ownerDecisions: [...moved.ownerDecisions, {
			action,
			atTurnId: lastTurn(thread)?.turnId ?? null,
			decidedAt,
			note
		}]
	};
}
function summarize(thread) {
	const latest = lastTurn(thread);
	return {
		threadId: thread.threadId,
		taskId: thread.taskId,
		title: thread.title,
		state: thread.state,
		turnCount: thread.turns.length,
		maxTurns: thread.maxTurns,
		lastAdapterId: latest?.adapterId ?? null,
		lastTurnStatus: latest?.status ?? null,
		ownerActionRequired: thread.state === "awaiting-owner",
		recoveryRequired: thread.state === "recovery-needed",
		...thread.recovery ? { recoveryReason: thread.recovery.reason } : {},
		updatedAt: thread.updatedAt,
		...thread.stopReason ? { stopReason: thread.stopReason } : {}
	};
}
//#endregion
//#region src/main/jobLoop/relay.ts
/** Display-only deadline for a pending dispatch. Passing it never triggers an automatic action. */
var defaultPendingTtlMs = 9e5;
var maxCharsPerPriorTurn = 1200;
var maxCharsPerDependency = 1e3;
/**
* Keeps adapter-supplied error text short and free of stack traces or payloads.
*
* Masks rather than rejects, unlike every other inbound guard. This text is persisted on the
* failure path (`recovery.detected` events and the error file), so refusing it would mean losing
* the record of a failure at the exact moment one occurred. Redacting keeps the record.
*/
function safeErrorText(error) {
	return maskSecrets(String(error?.message ?? error)).slice(0, 200);
}
function boundedText$2(value, limit) {
	return value.slice(0, limit);
}
function buildBoundedPriorTurns(turns) {
	return turns.slice(-3).map((turn) => ({
		...turn,
		content: boundedText$2(turn.content, maxCharsPerPriorTurn),
		...turn.dependencyResults ? { dependencyResults: turn.dependencyResults.map((dependency) => ({
			...dependency,
			...dependency.content ? { content: boundedText$2(dependency.content, maxCharsPerDependency) } : {}
		})) } : {}
	}));
}
function boundedDependencies(dependencies) {
	return dependencies?.map((dependency) => ({
		...dependency,
		...dependency.content ? { content: boundedText$2(dependency.content, maxCharsPerDependency) } : {}
	}));
}
function contextBudget(priorTurns, dependencies) {
	const priorTurnChars = priorTurns.reduce((total, turn) => total + turn.content.length, 0);
	const dependencyChars = (dependencies ?? []).reduce((total, dependency) => total + (dependency.content?.length ?? 0), 0);
	return {
		mode: "bounded",
		priorTurnCount: priorTurns.length,
		priorTurnChars,
		dependencyCount: dependencies?.length ?? 0,
		dependencyChars,
		estimatedTokens: Math.max(1, Math.ceil((priorTurnChars + dependencyChars) / 4))
	};
}
var ConversationRelay = class {
	runtimeRoot;
	clock;
	jobRuntime;
	pendingTtlMs;
	adapters;
	externalTransports;
	/** Which dispatch is currently open per Thread, so an Owner cancel needs only a threadId. */
	inFlight = /* @__PURE__ */ new Map();
	/** Serialises relay work per Thread so concurrent calls cannot claim the same sequence. */
	queues = /* @__PURE__ */ new Map();
	constructor({ runtimeRoot = ".adf-runtime", clock = () => /* @__PURE__ */ new Date(), adapters, jobRuntime, pendingTtlMs = defaultPendingTtlMs, externalTransports = {} } = {}) {
		this.externalTransports = new Map(Object.entries(externalTransports));
		this.runtimeRoot = node_path.default.resolve(runtimeRoot);
		this.clock = clock;
		this.pendingTtlMs = pendingTtlMs;
		this.jobRuntime = jobRuntime ?? new JobRuntime({
			runtimeRoot: this.runtimeRoot,
			clock
		});
		const list = adapters ?? [new FakeProposalConversationAdapter(), new FakeCriticConversationAdapter()];
		this.adapters = new Map(list.map((adapter) => [adapter.adapterId, adapter]));
	}
	serialise(threadId, work) {
		const next = (this.queues.get(threadId) ?? Promise.resolve()).then(work, work);
		this.queues.set(threadId, next.catch(() => void 0));
		return next;
	}
	threadDirectory(threadId) {
		return node_path.default.join(this.runtimeRoot, "threads", threadId);
	}
	threadPath(threadId) {
		return node_path.default.join(this.threadDirectory(threadId), "thread.json");
	}
	pendingPath(threadId) {
		return node_path.default.join(this.threadDirectory(threadId), "pending-dispatch.json");
	}
	now() {
		return this.clock().toISOString();
	}
	/**
	* `local-only` adapters dispatch freely. An `external-send` adapter is allowed here only so its
	* own Owner gate can run inside `send`; a `planned` adapter is never dispatched at all.
	*/
	resolveAdapter(adapterId) {
		const profile = getAdapterProfile(adapterId);
		if (profile.status !== "available") throw new ThreadRejectedError([`adapter is not available for dispatch: ${adapterId}`]);
		if (profile.dataPolicy !== "local-only" && profile.dataPolicy !== "external-send") throw new ThreadRejectedError([`adapter has an undeclared data policy: ${adapterId}`]);
		const adapter = this.adapters.get(adapterId);
		if (!adapter) throw new ThreadRejectedError([`adapter is not registered in this relay: ${adapterId}`]);
		return adapter;
	}
	/** Frontdoor Prepare uses this to reject a Registry-only Adapter that this Relay cannot execute. */
	assertAdapterRegistered(adapterId, role) {
		const adapter = this.resolveAdapter(adapterId);
		if (!adapterSupportsRole(adapter, role)) throw new ThreadRejectedError([`adapter ${adapterId} is registered for role(s) ${(adapter.supportedRoles ?? [adapter.role]).join(", ")}, not ${role}`]);
	}
	/**
	* Re-checks live transport readiness only at an explicit dispatch boundary. A failed check is
	* thrown before Frontdoor creates a child Job/Thread, and before the direct external-send path
	* can invoke the transport. Non-local-http transports keep their existing approval contract.
	*/
	async assertAdapterReadyForDispatch(adapterId) {
		const profile = getAdapterProfile(adapterId);
		if (profile.connection !== "local-http") return;
		this.resolveAdapter(adapterId);
		const transport = this.requireTransport(adapterId);
		if (transport.connection !== profile.connection) throw new ThreadRejectedError([`profile and transport connection mismatch for ${adapterId}`]);
		if (!transport.isLocalEndpoint?.()) throw new ThreadRejectedError([`local-http adapter target is not confirmed as loopback: ${adapterId}`]);
		if (!transport.checkReadiness) throw new ThreadRejectedError([`local-http adapter has no readiness check: ${adapterId}`]);
		const readiness = await transport.checkReadiness();
		if (!readiness.ready) throw new ThreadRejectedError([`adapter readiness failed for ${adapterId}: ${readiness.detail}`]);
	}
	/** Owner-explicit, detailed readiness for a registered local model Adapter. */
	async localReadiness(adapterId) {
		if (getAdapterProfile(adapterId).connection !== "local-http") throw new ThreadRejectedError([`adapter is not a local-http Adapter: ${adapterId}`]);
		const transport = this.requireTransport(adapterId);
		if (!transport.localReadiness) throw new ThreadRejectedError([`local-http Adapter has no detailed readiness check: ${adapterId}`]);
		return transport.localReadiness();
	}
	/**
	* A local-only adapter named explicitly (not auto-routed) must be one of the Thread's own approved
	* `adapterPlan` selections — the Plan the Owner actually approved via `routingPlanHash`. This closes
	* the gap where an explicit adapterId could reach a `local-only` adapter that was never part of what
	* was approved (e.g. a Task Packet approving `fake-ai-a` while the caller names `ollama-local`).
	* An `external-send` adapter is untouched here: its gate is the separate Owner-approval-file check
	* in `preflightExternalSend`, and `AdapterPlan` can never contain an external-send selection at all
	* (see `validateAdapterPlan`), so this check would reject it for the wrong reason if it ran there too.
	*/
	assertExplicitDispatchIsApprovedPlan(thread, adapterId, role) {
		if (getAdapterProfile(adapterId).dataPolicy !== "local-only") return;
		const membership = checkAdapterPlanMembership(thread.adapterPlan, thread.routingPlanHash, adapterId, role);
		if (!membership.ok) throw new ThreadRejectedError([`explicit adapterId is not part of this Thread's approved adapterPlan: ${adapterId} (role ${role}) — ${membership.detail}`]);
	}
	nextRole(thread) {
		if (thread.turns.length === 0) return thread.adapterPlan.selections[0]?.role ?? "proposal";
		return thread.turns.length % 2 === 0 ? "proposal" : "critic";
	}
	/** Automatic role routing never reaches outside this machine: an external Adapter must be named. */
	adapterForRole(role) {
		for (const adapter of this.adapters.values()) {
			if (!adapterSupportsRole(adapter, role)) continue;
			const profile = getAdapterProfile(adapter.adapterId);
			if (profile.status !== "available") continue;
			if (profile.dataPolicy !== "local-only") continue;
			if (profile.connection === "local-http") continue;
			if (profile.autoSelectable === false) continue;
			return adapter;
		}
		throw new ThreadRejectedError([`no local relay adapter registered for role ${role}`]);
	}
	async persist(thread) {
		await writeJsonAtomic(this.threadPath(thread.threadId), thread);
		return thread;
	}
	eventsPath(threadId) {
		return node_path.default.join(this.threadDirectory(threadId), "thread-events.jsonl");
	}
	async record(threadId, type, details) {
		await appendEvent(this.eventsPath(threadId), {
			type,
			at: this.now(),
			threadId,
			...details
		});
	}
	readThreadEvents(threadId) {
		return readEvents(this.eventsPath(threadId));
	}
	/**
	* How many dispatches have already been attempted for this sequence. Counted from the Ledger
	* rather than the clock, so a fixed test clock cannot collapse two attempts into one id.
	*/
	attemptForSequence(events, sequence) {
		return events.filter((event) => event.type === "relay.dispatch-intent" && typeof event.sequence === "number" && event.sequence === sequence).length;
	}
	recordedDispatchIds(events) {
		const ids = /* @__PURE__ */ new Set();
		for (const event of events) if (typeof event.dispatchId === "string") ids.add(event.dispatchId);
		return ids;
	}
	async readPending(threadId) {
		try {
			return await readJson(this.pendingPath(threadId));
		} catch (error) {
			if (error.code === "ENOENT") return null;
			throw error;
		}
	}
	async clearPending(threadId) {
		await removeFile(this.pendingPath(threadId));
	}
	resultPath(threadId, turnId) {
		return node_path.default.join(this.threadDirectory(threadId), "results", `${turnId}.json`);
	}
	/**
	* Keeps the Job Ledger in step with the conversation. `awaiting-review` is terminal for a Job,
	* so the Job stays `running` while the Thread is mid-conversation and only settles once the
	* Thread reaches a terminal state.
	*/
	async syncJobState(thread, to) {
		const job = await this.jobRuntime.readJob(thread.jobId);
		if (job.state === to) return;
		if (!canTransition(job.state, to)) {
			await this.record(thread.threadId, "job.state-skipped", {
				jobId: thread.jobId,
				from: job.state,
				to
			});
			return;
		}
		await this.jobRuntime.transition(this.jobRuntime.jobDirectory(thread.jobId), job.state, to, { type: `job.${to}` });
		await this.record(thread.threadId, "job.state", {
			jobId: thread.jobId,
			from: job.state,
			to
		});
	}
	jobStateForThread(state) {
		switch (state) {
			case "stopped": return "cancelled";
			case "failed": return "failed";
			case "approved":
			case "completed": return "awaiting-review";
			default: return null;
		}
	}
	/** Re-reads every referenced Result Envelope from disk before the Owner may adopt the Thread. */
	async verifyStoredEvidence(thread) {
		const adoptable = thread.turns.filter((turn) => turn.status === "success" || turn.status === "partial");
		if (adoptable.length === 0) throw new ThreadRejectedError(["approve requires at least one success or partial turn"]);
		let verified = 0;
		for (const turn of adoptable) {
			if (!turn.resultEnvelopeRef || !turn.resultEnvelopeHash) throw new ThreadRejectedError([`turn ${turn.turnId} has no stored result envelope`]);
			let envelope;
			try {
				envelope = await readJson(this.resultPath(thread.threadId, turn.turnId));
			} catch (error) {
				if (error.code === "ENOENT") throw new ThreadRejectedError([`result envelope file is missing for turn ${turn.turnId}`]);
				throw error;
			}
			if (hashJson(envelope) !== turn.resultEnvelopeHash) throw new ThreadRejectedError([`result envelope for turn ${turn.turnId} was modified after it was recorded`]);
			validateResultEnvelope(envelope, {
				taskId: thread.taskId,
				jobId: thread.jobId,
				inputHash: thread.inputHash
			});
			if (envelope.status !== turn.status) throw new ThreadRejectedError([`result envelope status does not match turn ${turn.turnId}`]);
			if (envelope.verification.some((item) => item.status === "pass")) verified += 1;
		}
		if (verified === 0) throw new ThreadRejectedError(["approve requires at least one result envelope with a passing verification"]);
	}
	/**
	* A Thread only exists for an Owner-approved Task that passed the existing delivery gate:
	* `validateApprovedTask → Dispatch Packet → Dispatch ACK → Job registration`. The Thread binds
	* to that registered Job rather than inventing a job id of its own.
	*/
	async startThread(packet, options = {}) {
		validateApprovedTask(packet, this.clock());
		const registration = await this.jobRuntime.registerApprovedJob(packet);
		const job = await this.jobRuntime.readJob(registration.jobId);
		if (job.dispatchState !== "preflight-valid") throw new ThreadRejectedError([`job dispatch is not preflight-valid: ${job.dispatchState}`]);
		const id = `thread-${hashJson([
			packet.taskId,
			packet.approval.approvalId,
			registration.jobId
		]).slice(0, 16)}`;
		await ensureDir(this.threadDirectory(id));
		const existing = await this.tryRead(id);
		if (existing) {
			if (existing.taskId !== packet.taskId || existing.jobId !== registration.jobId || existing.approvalId !== packet.approval.approvalId || existing.scopeHash !== packet.scopeHash || existing.contextHash !== packet.contextHash || existing.routingPlanHash !== packet.approval.routingPlanHash || hashJson(existing.adapterPlan) !== hashJson(packet.adapterPlan) || hashJson(existing.approvedFileSet ?? []) !== hashJson(packet.target.allowedFiles ?? []) || existing.inputHash !== registration.inputHash || hashJson(existing.implementationBinding ?? null) !== hashJson(packet.implementationBinding ?? null)) throw new ThreadRejectedError(["existing Thread binding does not match the approved Packet; recovery-needed"]);
			return existing;
		}
		const thread = createThread({
			threadId: id,
			taskId: packet.taskId,
			jobId: registration.jobId,
			title: options.title ?? packet.objective,
			approvalId: packet.approval.approvalId,
			scopeHash: packet.scopeHash,
			contextHash: packet.contextHash,
			routingPlanHash: packet.approval.routingPlanHash,
			adapterPlan: packet.adapterPlan,
			approvedFileSet: packet.target.allowedFiles,
			...packet.implementationBinding ? { implementationBinding: packet.implementationBinding } : {},
			inputHash: registration.inputHash,
			createdAt: this.now(),
			maxTurns: options.maxTurns ?? 6
		});
		await this.record(id, "thread.created", {
			taskId: packet.taskId,
			jobId: registration.jobId,
			approvalId: packet.approval.approvalId,
			packetHash: job.packetHash,
			maxTurns: thread.maxTurns
		});
		return this.persist(thread);
	}
	/** `send_to_adapter`: hand the approved Thread context to the Adapter and claim the pending dispatch. */
	sendToAdapter(threadId, adapterId, dependencyResults, orchestrationRunId) {
		return this.serialise(threadId, () => this.sendToAdapterUnsafe(threadId, adapterId, dependencyResults, orchestrationRunId));
	}
	async sendToAdapterUnsafe(threadId, adapterId, dependencyResults, orchestrationRunId) {
		const thread = await this.getConversationState(threadId);
		if (thread.state !== "open") throw new ThreadRejectedError([`thread is not open: ${thread.state}`]);
		if (thread.turns.length >= thread.maxTurns) throw new ThreadRejectedError([`max turns exceeded: ${thread.maxTurns}`]);
		const pending = await this.readPending(threadId);
		if (pending) throw new ThreadRejectedError([`a dispatch is already pending for turn ${pending.handle.sequence}`]);
		const expectedRole = this.nextRole(thread);
		const adapter = adapterId ? this.resolveAdapter(adapterId) : this.adapterForRole(expectedRole);
		if (!adapterSupportsRole(adapter, expectedRole)) throw new ThreadRejectedError([`turn ${thread.turns.length} requires role ${expectedRole}, but ${adapter.adapterId} supports ${(adapter.supportedRoles ?? [adapter.role]).join(", ")}`]);
		if (adapterId) this.assertExplicitDispatchIsApprovedPlan(thread, adapterId, expectedRole);
		const parent = lastTurn(thread);
		const sequence = thread.turns.length;
		const events = await this.readThreadEvents(threadId);
		const attempt = this.attemptForSequence(events, sequence);
		const dispatchId = `relay-dispatch-${hashJson([
			threadId,
			sequence,
			adapter.adapterId,
			attempt
		]).slice(0, 20)}`;
		if (this.recordedDispatchIds(events).has(dispatchId)) throw new ThreadRejectedError([`dispatchId ${dispatchId} was already used on this thread; refusing to reuse it`]);
		const boundedPriorTurns = buildBoundedPriorTurns(thread.turns);
		const boundedDependencyResults = boundedDependencies(dependencyResults);
		const budget = contextBudget(boundedPriorTurns, boundedDependencyResults);
		const sentAt = this.now();
		const handle = {
			dispatchId,
			threadId,
			taskId: thread.taskId,
			jobId: thread.jobId,
			adapterId: adapter.adapterId,
			role: expectedRole,
			sequence,
			attempt,
			...parent ? {
				respondsToTurnId: parent.turnId,
				respondsToHash: turnHash(parent)
			} : {},
			sentAt,
			expiresAt: new Date(new Date(sentAt).getTime() + this.pendingTtlMs).toISOString(),
			...boundedDependencyResults?.length ? { dependencyResults: boundedDependencyResults } : {},
			contextBudget: budget,
			...orchestrationRunId ? { orchestrationRunId } : {}
		};
		await this.record(threadId, "relay.dispatch-intent", {
			dispatchId,
			adapterId: adapter.adapterId,
			role: expectedRole,
			sequence,
			attempt
		});
		let acceptance;
		this.inFlight.set(threadId, {
			dispatchId,
			adapterId: adapter.adapterId
		});
		try {
			acceptance = await adapter.send({
				dispatchId,
				taskId: thread.taskId,
				threadId,
				jobId: thread.jobId,
				title: thread.title,
				role: expectedRole,
				sequence,
				priorTurns: boundedPriorTurns,
				attempt,
				inputHash: thread.inputHash,
				scopeHash: thread.scopeHash,
				contextHash: thread.contextHash,
				...thread.approvedFileSet ? { approvedFileSet: thread.approvedFileSet } : {},
				...orchestrationRunId ? { orchestrationRunId } : {},
				...boundedDependencyResults?.length ? { dependencyResults: boundedDependencyResults } : {},
				contextBudget: budget
			});
		} catch (error) {
			await this.record(threadId, "relay.send-failed", {
				dispatchId,
				adapterId: adapter.adapterId,
				sequence,
				attempt,
				sendError: safeErrorText(error)
			});
			throw error;
		} finally {
			this.inFlight.delete(threadId);
		}
		if (acceptance.dispatchId !== dispatchId || acceptance.adapterId !== adapter.adapterId) throw new ThreadRejectedError(["adapter acceptance does not match the dispatch"]);
		try {
			await writeJsonExclusive(this.pendingPath(threadId), {
				handle,
				handleHash: hashJson(handle),
				acceptance
			});
		} catch (error) {
			if (error.code === "EEXIST") throw new ThreadRejectedError(["a dispatch is already pending for this thread"]);
			throw error;
		}
		await this.record(threadId, "relay.sent", {
			dispatchId: handle.dispatchId,
			adapterId: handle.adapterId,
			sequence,
			adapterConversationId: acceptance.adapterConversationId
		});
		await this.syncJobState(thread, "running");
		return handle;
	}
	/**
	* `receive_from_adapter`: accept the Adapter answer as a Turn. The stored pending dispatch is the
	* only source of truth, so a caller cannot substitute a different job, adapter, role or sequence.
	*/
	receiveFromAdapter(handle, payload) {
		return this.serialise(handle.threadId, () => this.receiveFromAdapterUnsafe(handle, payload));
	}
	async receiveFromAdapterUnsafe(handle, payload) {
		const thread = await this.getConversationState(handle.threadId);
		const pending = await this.readPending(handle.threadId);
		if (!pending) throw new ThreadRejectedError(["no pending dispatch for this thread"]);
		if (hashJson(handle) !== pending.handleHash) throw new ThreadRejectedError(["handle does not match the stored pending dispatch"]);
		const stored = pending.handle;
		const adapter = this.resolveAdapter(stored.adapterId);
		const answer = payload ?? await adapter.receive(pending.acceptance);
		const turnId = `turn-${stored.sequence}-${hashJson([stored.dispatchId, answer.content]).slice(0, 12)}`;
		const createdAt = this.now();
		const envelope = this.buildResultEnvelope(thread, stored, answer, turnId, createdAt);
		validateResultEnvelope(envelope, {
			taskId: thread.taskId,
			jobId: thread.jobId,
			inputHash: thread.inputHash
		});
		if (answer.status === "success" && !envelope.verification.some((item) => item.status === "pass")) throw new ThreadRejectedError(["a success turn requires at least one passing verification entry"]);
		const turn = {
			turnId,
			threadId: stored.threadId,
			jobId: stored.jobId,
			dispatchId: stored.dispatchId,
			sequence: stored.sequence,
			adapterId: stored.adapterId,
			role: stored.role,
			...stored.respondsToTurnId ? {
				respondsToTurnId: stored.respondsToTurnId,
				respondsToHash: stored.respondsToHash
			} : {},
			content: answer.content,
			status: answer.status,
			...answer.questions ? { questions: answer.questions } : {},
			...stored.dependencyResults?.length ? { dependencyResults: stored.dependencyResults } : {},
			...stored.contextBudget ? { contextBudget: stored.contextBudget } : {},
			...stored.orchestrationRunId ? { orchestrationRunId: stored.orchestrationRunId } : {},
			resultEnvelopeRef: `threads/${stored.threadId}/results/${turnId}.json`,
			resultEnvelopeHash: hashJson(envelope),
			...answer.errorRef ? { errorRef: answer.errorRef } : {},
			createdAt
		};
		const appended = appendTurn(thread, turn);
		await writeJsonAtomic(this.resultPath(stored.threadId, turnId), envelope);
		await this.writeEvidenceLinks(appended);
		await this.clearPending(stored.threadId);
		await this.record(stored.threadId, "relay.received", {
			dispatchId: stored.dispatchId,
			turnId,
			status: turn.status,
			turnHash: turnHash(turn),
			resultHash: hashJson(envelope)
		});
		const failed = answer.status === "failed" || answer.status === "invalid";
		const reachedLimit = appended.turns.length >= appended.maxTurns;
		const next = failed ? withState(appended, "failed", turn.createdAt, `adapter returned ${answer.status}`) : withState(appended, "awaiting-owner", turn.createdAt, reachedLimit ? `max turns reached: ${appended.maxTurns}` : void 0);
		await this.record(stored.threadId, "thread.state", {
			state: next.state,
			...next.stopReason ? { stopReason: next.stopReason } : {}
		});
		const jobState = this.jobStateForThread(next.state);
		if (jobState) await this.syncJobState(next, jobState);
		return this.persist(next);
	}
	/** ADF owns the identity and hash fields, so an Adapter cannot claim another Task, Job or input. */
	buildResultEnvelope(thread, stored, answer, turnId, createdAt) {
		return {
			resultId: turnId,
			jobId: thread.jobId,
			taskId: thread.taskId,
			adapterId: stored.adapterId,
			role: stored.role,
			inputHash: thread.inputHash,
			scopeHash: thread.scopeHash,
			contextHash: thread.contextHash,
			status: answer.envelopeStatus ?? answer.status,
			content: answer.content,
			summary: answer.summary ?? answer.content.slice(0, 200),
			artifact: {
				...answer.artifact ?? {},
				turnId,
				threadId: thread.threadId,
				sequence: stored.sequence,
				respondsToTurnId: stored.respondsToTurnId ?? null
			},
			verification: answer.verification ?? [],
			risks: answer.risks ?? [],
			...answer.questions ? { questions: answer.questions } : {},
			...stored.dependencyResults?.length ? { dependencyResults: stored.dependencyResults } : {},
			...stored.contextBudget ? { contextBudget: stored.contextBudget } : {},
			...stored.orchestrationRunId ? { orchestrationRunId: stored.orchestrationRunId } : {},
			ownerDecisionRequired: true,
			nextOwnerDecision: answer.status === "success" || answer.status === "partial" ? "このTurnを確認し、継続・停止・承認を判断する" : "Turnの失敗理由を確認し、停止または再設計を判断する",
			createdAt,
			durationMs: 0,
			terminationReason: answer.terminationReason ?? (answer.status === "success" ? "completed" : `adapter-${answer.status}`)
		};
	}
	/**
	* Builds the Owner gate for one external send. Exposed so the UI can show the report without
	* attempting anything, and reused by the Adapter itself immediately before it would transmit.
	*/
	async preflightExternalSend(threadId, adapterId, transport, dependencyResults) {
		const thread = await this.getConversationState(threadId);
		const profile = getAdapterProfile(adapterId);
		this.resolveAdapter(adapterId);
		const nextRole = this.nextRole(thread);
		this.assertAdapterRegistered(adapterId, nextRole);
		const adapterRole = nextRole;
		const events = await this.readThreadEvents(threadId);
		const packet = buildSyntheticPacket(thread, adapterRole, this.attemptForSequence(events, thread.turns.length), this.now(), dependencyResults);
		assertPacketBoundary(packet);
		return preflightExternalSend({
			profile,
			adapterRole,
			transport: transport ?? this.requireTransport(adapterId),
			packet,
			approval: await readExternalApproval(this.runtimeRoot, threadId),
			sendsAlreadyMade: await this.countExternalCalls(threadId),
			now: this.clock(),
			approvedPlanBinding: {
				adapterPlan: thread.adapterPlan,
				routingPlanHash: thread.routingPlanHash
			}
		});
	}
	requireTransport(adapterId) {
		const transport = this.externalTransports.get(adapterId);
		if (!transport) throw new ThreadRejectedError([`no external transport registered for ${adapterId}`]);
		return transport;
	}
	/**
	* Owner cancel by threadId. The renderer never holds an Adapter instance, so the abort path
	* runs entirely inside the main process.
	*/
	cancelExternalSend(threadId, reason = "cancelled by Owner") {
		const open = this.inFlight.get(threadId);
		if (!open) return false;
		return this.adapters.get(open.adapterId)?.cancel?.(open.dispatchId, reason) ?? false;
	}
	/** True while an external dispatch is open for this Thread, so the UI can enable cancel. */
	hasInFlightExternalSend(threadId) {
		return this.inFlight.has(threadId);
	}
	/** Hooks an external Adapter uses to obtain its packet, pass the Owner gate, and record the call. */
	externalHooks(adapterId, transport) {
		return {
			authorise: async (request) => {
				const thread = await this.getConversationState(request.threadId);
				const profile = getAdapterProfile(adapterId);
				const packet = buildSyntheticPacket(thread, request.role, request.attempt ?? 0, this.now(), request.dependencyResults);
				assertPacketBoundary(packet);
				const preflight = preflightExternalSend({
					profile,
					adapterRole: request.role,
					transport,
					packet,
					approval: await readExternalApproval(this.runtimeRoot, request.threadId),
					sendsAlreadyMade: await this.countExternalCalls(request.threadId),
					now: this.clock(),
					approvedPlanBinding: {
						adapterPlan: thread.adapterPlan,
						routingPlanHash: thread.routingPlanHash
					}
				});
				assertExternalSendAllowed(preflight);
				await this.record(request.threadId, "external.preflight-passed", {
					provider: preflight.provider,
					adapterId: preflight.adapterId,
					packetHash: preflight.packetHash,
					approvalId: preflight.approvalId,
					costTier: preflight.costTier
				});
				return {
					packet,
					preflight
				};
			},
			recordCall: async (record) => {
				await appendEvent(node_path.default.join(this.threadDirectory(record.threadId), "external-calls.jsonl"), record);
				await this.record(record.threadId, "external.call-recorded", {
					callId: record.callId,
					provider: record.provider,
					status: record.status,
					durationMs: record.durationMs,
					costTier: record.costTier,
					terminationReason: record.terminationReason
				});
			},
			now: () => this.clock()
		};
	}
	async countExternalCalls(threadId) {
		return (await readEvents(node_path.default.join(this.threadDirectory(threadId), "external-calls.jsonl"))).length;
	}
	async writeEvidenceLinks(thread) {
		await writeJsonAtomic(node_path.default.join(this.threadDirectory(thread.threadId), "evidence-links.json"), {
			threadId: thread.threadId,
			taskId: thread.taskId,
			jobId: thread.jobId,
			approvalId: thread.approvalId,
			jobLedger: `jobs/${thread.jobId}/`,
			turns: thread.turns.map((turn) => ({
				turnId: turn.turnId,
				adapterId: turn.adapterId,
				role: turn.role,
				status: turn.status,
				resultEnvelopeRef: turn.resultEnvelopeRef ?? null,
				resultEnvelopeHash: turn.resultEnvelopeHash ?? null
			}))
		});
	}
	/**
	* `continue_job`: add the next Turn to the same Thread. The Adapter is polled through its own
	* `getState`, so an external Adapter that answers later plugs in without changing this flow.
	*/
	continueJob(threadId, adapterId, dependencyResults, orchestrationRunId) {
		return this.serialise(threadId, () => this.continueJobUnsafe(threadId, adapterId, dependencyResults, orchestrationRunId));
	}
	async continueJobUnsafe(threadId, adapterId, dependencyResults, orchestrationRunId) {
		const thread = await this.getConversationState(threadId);
		if (thread.state === "recovery-needed") throw new ThreadRejectedError(["thread needs recovery; use a recovery action first"]);
		if (thread.turns.length >= thread.maxTurns) {
			const stopped = withState(thread, "failed", this.now(), `max turns reached: ${thread.maxTurns}`);
			await this.record(threadId, "thread.state", {
				state: stopped.state,
				stopReason: stopped.stopReason
			});
			await this.syncJobState(stopped, "failed");
			return this.persist(stopped);
		}
		const handle = await this.sendToAdapterUnsafe(threadId, adapterId, dependencyResults, orchestrationRunId);
		const pending = await this.readPending(threadId);
		if (!pending) throw new ThreadRejectedError(["pending dispatch disappeared before receive"]);
		const state = await this.resolveAdapter(handle.adapterId).getState(pending.acceptance);
		if (state !== "ready") {
			await this.record(threadId, "relay.awaiting-adapter", {
				dispatchId: handle.dispatchId,
				adapterState: state
			});
			throw new ThreadRejectedError([`adapter has not produced an answer yet: ${state}`]);
		}
		return this.receiveFromAdapterUnsafe(handle);
	}
	/**
	* One startup pass over every Thread. Detects sends that were interrupted and moves those
	* Threads to `recovery-needed`. Never retries, never resends, never blocks on one bad Adapter.
	*/
	async scanForRecovery() {
		const detected = [];
		for (const threadId of await this.threadIds()) try {
			const found = await this.serialise(threadId, () => this.detectRecoveryUnsafe(threadId));
			if (found) detected.push(summarize(found));
		} catch (error) {
			await this.record(threadId, "recovery.scan-failed", { scanError: safeErrorText(error) }).catch(() => void 0);
		}
		return detected;
	}
	async detectRecoveryUnsafe(threadId) {
		const thread = await this.tryRead(threadId);
		if (!thread || thread.state !== "open") return null;
		const pending = await this.readPending(threadId);
		if (pending) return this.detectFromPending(thread, pending);
		const orphan = this.unresolvedIntent(await this.readThreadEvents(threadId), thread);
		if (!orphan) return null;
		return this.persist(await this.enterRecoveryFor(thread, {
			reason: "send-unconfirmed",
			dispatchId: String(orphan.dispatchId),
			sequence: Number(orphan.sequence),
			adapterId: String(orphan.adapterId),
			role: orphan.role,
			attempt: Number(orphan.attempt ?? 0),
			sentAt: String(orphan.at),
			detectedAt: this.now()
		}));
	}
	async detectFromPending(thread, pending) {
		const { handle } = pending;
		let probeError;
		try {
			if (await this.resolveAdapter(handle.adapterId).getState(pending.acceptance) === "ready") return null;
		} catch (error) {
			probeError = safeErrorText(error);
		}
		return this.persist(await this.enterRecoveryFor(thread, {
			reason: "answer-unavailable",
			dispatchId: handle.dispatchId,
			sequence: handle.sequence,
			adapterId: handle.adapterId,
			role: handle.role,
			attempt: handle.attempt,
			sentAt: handle.sentAt,
			expiresAt: handle.expiresAt,
			...handle.respondsToTurnId ? {
				respondsToTurnId: handle.respondsToTurnId,
				respondsToHash: handle.respondsToHash
			} : {},
			detectedAt: this.now(),
			...probeError ? { probeError } : {}
		}));
	}
	async enterRecoveryFor(thread, info) {
		const moved = enterRecovery(thread, info, this.now());
		await this.record(thread.threadId, "recovery.detected", {
			reason: info.reason,
			dispatchId: info.dispatchId,
			sequence: info.sequence,
			adapterId: info.adapterId,
			attempt: info.attempt,
			...info.probeError ? { probeError: info.probeError } : {}
		});
		await this.syncJobState(moved, "recovery-needed");
		return moved;
	}
	/**
	* The interrupted dispatch, if any.
	*
	* Only the newest attempt of each sequence is judged: an earlier attempt that was superseded by a
	* later one is history, not an outstanding send. Judging every intent would report a stale
	* `relay.send-failed` attempt as unconfirmed long after a later attempt of the same sequence
	* succeeded. Within the newest attempt, resolution is by `dispatchId`, which keeps a second
	* interruption at the same sequence detectable after a resend.
	*/
	unresolvedIntent(events, thread) {
		const settled = /* @__PURE__ */ new Set();
		for (const turn of thread.turns) if (turn.dispatchId) settled.add(turn.dispatchId);
		const answered = new Set(thread.turns.map((turn) => turn.sequence));
		for (const event of events) {
			if (event.type === "relay.dispatch-intent" || event.type === "relay.send-failed") continue;
			for (const key of ["dispatchId", "previousDispatchId"]) {
				const value = event[key];
				if (typeof value === "string") settled.add(value);
			}
		}
		const newestPerSequence = /* @__PURE__ */ new Map();
		for (const event of events) {
			if (event.type !== "relay.dispatch-intent") continue;
			const { sequence, attempt, dispatchId } = event;
			if (typeof sequence !== "number" || typeof dispatchId !== "string") continue;
			const current = newestPerSequence.get(sequence);
			const currentAttempt = typeof current?.attempt === "number" ? current.attempt : -1;
			if (!current || (typeof attempt === "number" ? attempt : 0) >= currentAttempt) newestPerSequence.set(sequence, event);
		}
		const outstanding = [...newestPerSequence.entries()].filter(([sequence, event]) => !answered.has(sequence) && !settled.has(event.dispatchId)).map(([, event]) => event);
		return outstanding[outstanding.length - 1] ?? null;
	}
	async threadIds() {
		try {
			return (await (0, node_fs_promises.readdir)(node_path.default.join(this.runtimeRoot, "threads"), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
		} catch (error) {
			if (error.code === "ENOENT") return [];
			throw error;
		}
	}
	/** `get_conversation_state`: the Thread as ADF holds it. */
	async getConversationState(threadId) {
		const thread = await this.tryRead(threadId);
		if (!thread) throw new ThreadRejectedError([`thread not found: ${threadId}`]);
		return thread;
	}
	async tryRead(threadId) {
		try {
			return await readJson(this.threadPath(threadId));
		} catch (error) {
			if (error.code === "ENOENT") return null;
			throw error;
		}
	}
	recordOwnerDecision(threadId, action, note) {
		return this.serialise(threadId, () => this.recordOwnerDecisionUnsafe(threadId, action, note));
	}
	async recordOwnerDecisionUnsafe(threadId, action, note) {
		const thread = await this.getConversationState(threadId);
		if (thread.state === "recovery-needed") throw new ThreadRejectedError([`thread needs recovery; use a recovery action instead of ${action}`]);
		if (action === "approve") await this.verifyStoredEvidence(thread);
		const decided = applyOwnerDecision(thread, action, this.now(), note);
		await this.record(threadId, "owner.decision", {
			action,
			state: decided.state,
			...note ? { note } : {}
		});
		const jobState = this.jobStateForThread(decided.state);
		if (jobState) await this.syncJobState(decided, jobState);
		return this.persist(decided);
	}
	/** Owner recovery: discard the interrupted dispatch and send the same sequence again. */
	resendFromRecovery(threadId, note) {
		return this.serialise(threadId, async () => {
			const thread = await this.requireRecovery(threadId);
			const previous = thread.recovery;
			await this.clearPending(threadId);
			await this.persist(leaveRecovery(thread, "open", this.now()));
			await this.record(threadId, "recovery.resent", {
				reason: previous.reason,
				previousDispatchId: previous.dispatchId,
				sequence: previous.sequence,
				previousAttempt: previous.attempt,
				...note ? { note } : {}
			});
			return this.continueJobUnsafe(threadId, previous.adapterId);
		});
	}
	/** Owner recovery: record that no answer was obtained, as a `failed` Turn with Evidence. */
	recordRecoveryFailure(threadId, note) {
		return this.serialise(threadId, async () => {
			const thread = await this.requireRecovery(threadId);
			const info = thread.recovery;
			const turnId = `turn-${info.sequence}-recovery-${info.attempt}`;
			const recordedAt = this.now();
			const errorRecord = {
				reason: info.reason,
				dispatchId: info.dispatchId,
				sequence: info.sequence,
				adapterId: info.adapterId,
				role: info.role,
				attempt: info.attempt,
				sentAt: info.sentAt,
				...info.expiresAt ? { expiresAt: info.expiresAt } : {},
				detectedAt: info.detectedAt,
				recordedAt,
				...info.probeError ? { probeError: info.probeError } : {},
				...note ? { note } : {}
			};
			const errorRef = `threads/${threadId}/errors/${turnId}.json`;
			await writeJsonAtomic(node_path.default.join(this.threadDirectory(threadId), "errors", `${turnId}.json`), errorRecord);
			const envelope = {
				resultId: turnId,
				jobId: thread.jobId,
				taskId: thread.taskId,
				adapterId: info.adapterId,
				role: info.role,
				inputHash: thread.inputHash,
				scopeHash: thread.scopeHash,
				contextHash: thread.contextHash,
				status: "failed",
				content: info.reason === "answer-unavailable" ? "Adapterは受理したが回答を取得できなかった。" : "Adapterへ届いたか確認できないまま中断した。",
				summary: info.reason === "answer-unavailable" ? `Adapterは受理したが回答を取得できなかった（sequence ${info.sequence}、attempt ${info.attempt}）` : `Adapterへ届いたか確認できないまま中断した（sequence ${info.sequence}、attempt ${info.attempt}）`,
				artifact: {
					turnId,
					threadId,
					sequence: info.sequence,
					dispatchId: info.dispatchId,
					errorRef
				},
				verification: [{
					name: "adapter-answer-recovered",
					status: "not-run",
					reason: info.reason
				}],
				risks: info.reason === "answer-unavailable" ? ["Adapterが処理を完了していた可能性がある"] : ["Adapterへ届いたか不明であり、外部AIでは課金が発生している可能性がある"],
				ownerDecisionRequired: true,
				nextOwnerDecision: "この中断を踏まえ、停止・再依頼・これまでのTurnの扱いを判断する",
				createdAt: recordedAt,
				durationMs: 0,
				terminationReason: "recovery-failed"
			};
			validateResultEnvelope(envelope, {
				taskId: thread.taskId,
				jobId: thread.jobId,
				inputHash: thread.inputHash
			});
			await writeJsonAtomic(this.resultPath(threadId, turnId), envelope);
			const parent = lastTurn(thread);
			const appended = appendRecoveryTurn(thread, {
				turnId,
				threadId,
				jobId: thread.jobId,
				dispatchId: info.dispatchId,
				sequence: info.sequence,
				adapterId: info.adapterId,
				role: info.role,
				...parent ? {
					respondsToTurnId: parent.turnId,
					respondsToHash: turnHash(parent)
				} : {},
				content: `【ADFによる復旧記録】このTurnはAdapterの発言ではない。${envelope.summary}。`,
				status: "failed",
				resultEnvelopeRef: `threads/${threadId}/results/${turnId}.json`,
				resultEnvelopeHash: hashJson(envelope),
				errorRef,
				createdAt: recordedAt
			});
			await this.clearPending(threadId);
			await this.writeEvidenceLinks(appended);
			await this.record(threadId, "recovery.failed-recorded", {
				reason: info.reason,
				dispatchId: info.dispatchId,
				sequence: info.sequence,
				turnId,
				...note ? { note } : {}
			});
			const resolved = leaveRecovery(appended, "awaiting-owner", recordedAt);
			await this.syncJobState(resolved, "running");
			return this.persist(resolved);
		});
	}
	/** Owner recovery: abandon the Thread. */
	stopFromRecovery(threadId, note) {
		return this.serialise(threadId, async () => {
			const thread = await this.requireRecovery(threadId);
			const info = thread.recovery;
			await this.clearPending(threadId);
			const stopped = leaveRecovery(thread, "stopped", this.now(), note ?? `stopped during recovery: ${info.reason}`);
			await this.record(threadId, "recovery.stopped", {
				reason: info.reason,
				dispatchId: info.dispatchId,
				sequence: info.sequence,
				...note ? { note } : {}
			});
			await this.syncJobState(stopped, "cancelled");
			return this.persist(stopped);
		});
	}
	async requireRecovery(threadId) {
		const thread = await this.getConversationState(threadId);
		if (thread.state !== "recovery-needed" || !thread.recovery) throw new ThreadRejectedError([`thread is not awaiting recovery: ${thread.state}`]);
		return thread;
	}
	/**
	* One Owner action: record the `continue` decision and add the next Turn inside a single
	* serialised step, so no other Owner action can interleave between the two.
	*/
	continueWithOwnerApproval(threadId, note) {
		return this.serialise(threadId, async () => {
			const decided = await this.recordOwnerDecisionUnsafe(threadId, "continue", note);
			if (decided.state !== "open") return decided;
			return this.continueJobUnsafe(threadId);
		});
	}
	async listThreads() {
		const summaries = [];
		for (const threadId of await this.threadIds()) {
			const thread = await this.tryRead(threadId);
			if (thread) summaries.push(summarize(thread));
		}
		return summaries;
	}
	/**
	* Read-only, Registry-derived candidates for explicit external dispatch — Fake Adapters excluded.
	* Returns only Adapters actually registered on *this* Relay instance, never the full static
	* Registry: a Registry entry marked `available` that this instance never wired up would otherwise
	* look selectable in the UI and then fail with "not registered in this relay" the moment it's used.
	*/
	listExternalAdapterProfiles() {
		return [...this.adapters.keys()].map((adapterId) => getAdapterProfile(adapterId)).filter((profile) => profile.connection !== "fake");
	}
};
//#endregion
//#region src/main/jobLoop/externalTransport.ts
var MissingCredentialError = class extends Error {
	code = "MISSING_CREDENTIAL";
	constructor(variable) {
		super(`${variable} is not set in this process environment; ADF does not store credentials`);
	}
};
var maxAnswerCharacters = 2e3;
function truncateAnswer(text) {
	return text.slice(0, maxAnswerCharacters);
}
//#endregion
//#region src/main/jobLoop/anthropicTransport.ts
/**
* Messages API transport over the built-in `fetch`. Chosen by Project Owner after the environment
* preflight found no Claude CLI and no SDK installed: this adds no dependency to ADF.
*
* The API key is read from the environment at send time and never returned, logged, persisted to
* the Ledger, or written into any ADF record.
*/
var anthropicMessagesEndpoint = "https://api.anthropic.com/v1/messages";
var anthropicApiVersion = "2023-06-01";
var defaultModel = "claude-opus-5";
var AnthropicMessagesTransport = class {
	providerId;
	connection = "api";
	model;
	fetchImpl;
	credentialVariable;
	constructor({ providerId = "anthropic-messages-api", model = defaultModel, fetchImpl, credentialVariable = "ANTHROPIC_API_KEY" } = {}) {
		this.providerId = providerId;
		this.model = model;
		this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init));
		this.credentialVariable = credentialVariable;
	}
	/**
	* Presence only. The value is read here to test it and immediately discarded — it is never
	* returned, logged, or stored, so the Owner gate can report "set / unset" and nothing more.
	*/
	credentialStatus() {
		return {
			required: true,
			present: Boolean(process.env[this.credentialVariable]?.trim()),
			source: `environment variable ${this.credentialVariable}`,
			authMode: "environment-secret"
		};
	}
	async send(packet, options) {
		const key = process.env[this.credentialVariable];
		if (!key) throw new MissingCredentialError(this.credentialVariable);
		const startedAt = Date.now();
		if (options.signal?.aborted) return {
			status: "cancelled",
			terminationReason: "cancelled before the request was sent",
			durationMs: 0
		};
		const controller = new AbortController();
		const timeoutReason = Symbol("external-send-timeout");
		const timer = setTimeout(() => controller.abort(timeoutReason), options.timeoutMs);
		const relayAbort = () => controller.abort(options.signal?.reason ?? /* @__PURE__ */ new Error("cancelled by Owner"));
		options.signal?.addEventListener("abort", relayAbort, { once: true });
		try {
			const response = await this.fetchImpl(anthropicMessagesEndpoint, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"anthropic-version": anthropicApiVersion,
					"x-api-key": key
				},
				body: JSON.stringify({
					model: this.model,
					max_tokens: 512,
					thinking: { type: "disabled" },
					messages: [{
						role: "user",
						content: `${packet.instruction}\n\n役割: ${packet.role}\n形式: ${packet.resultFormat}`
					}]
				}),
				signal: controller.signal
			});
			const durationMs = Date.now() - startedAt;
			if (!response.ok) return {
				status: this.statusForHttp(response.status),
				terminationReason: `http-${response.status}`,
				durationMs,
				errorText: (await this.safeBody(response)).slice(0, 200)
			};
			const body = await response.json();
			if (body.stop_reason === "refusal") return {
				status: "failed",
				terminationReason: `refusal:${body.stop_details?.category ?? "unspecified"}`,
				durationMs
			};
			const text = (body.content ?? []).filter((block) => block.type === "text").map((block) => block.text ?? "").join("").trim();
			if (!text) return {
				status: "invalid",
				terminationReason: `no-text-block:${body.stop_reason ?? "unknown"}`,
				durationMs
			};
			return {
				status: "success",
				content: truncateAnswer(text),
				terminationReason: body.stop_reason === "max_tokens" ? "completed-truncated" : "completed",
				durationMs
			};
		} catch (error) {
			const durationMs = Date.now() - startedAt;
			if (controller.signal.aborted) return controller.signal.reason === timeoutReason ? {
				status: "timeout",
				terminationReason: `no answer within ${options.timeoutMs}ms`,
				durationMs
			} : {
				status: "cancelled",
				terminationReason: "cancelled before the adapter answered",
				durationMs
			};
			throw error;
		} finally {
			clearTimeout(timer);
			options.signal?.removeEventListener("abort", relayAbort);
		}
	}
	/** 429 and 5xx are retryable conditions for the Owner to judge; 4xx are refusals to send. */
	statusForHttp(status) {
		if (status === 429 || status >= 500) return "failed";
		if (status === 401 || status === 403) return "failed";
		return "invalid";
	}
	async safeBody(response) {
		try {
			return await response.text();
		} catch {
			return "response body unavailable";
		}
	}
};
//#endregion
//#region src/main/jobLoop/ollamaTransport.ts
/**
* Local HTTP transport for Ollama (or any Ollama-compatible localhost server). One implementation
* of `ExternalTransport` among others (Anthropic Messages API, future OpenAI/CLI transports) — the
* `local-http` connection mode is not a special case anywhere in Thread, Relay, or Recovery.
*
* `ollama-local` is `status: 'available'` in the Registry and, since
* `ADF-OLLAMA-FIRST-CLASS-ADAPTER-001`, registered as an explicit-adapterId Adapter in the live
* Electron app and Frontdoor CLI through the shared live Relay factory. Auto-routing still
* excludes `local-http` (`supports()`) in all entry points.
*/
var defaultOllamaBaseUrl = "http://127.0.0.1:11434";
var defaultOllamaModel = "llama3";
var defaultOllamaGenerationOptions = {
	num_ctx: 2048,
	num_predict: 128,
	temperature: 0
};
function dependencyPrompt(packet) {
	if (!packet.dependencyContext?.length) return "";
	return `\n\n承認済み依存Resultの内容を踏まえて、Criticとして応答すること。${packet.dependencyContext.map((dependency) => `\n依存Node ${dependency.nodeId} のResult（hash: ${dependency.resultHash}）:\n${dependency.content}`).join("\n")}`;
}
function safeDiagnostic$2(value) {
	return String(value).replace(/(authorization|bearer|api[-_]?key|token|password|secret)=?[^\s,;]*/gi, "$1=[redacted]").replace(/https?:\/\/[^\s]+/gi, "[url-redacted]").slice(0, 200);
}
function nonNegativeMetric$2(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
/** Maps Ollama's numeric response diagnostics without allowing arbitrary response fields through. */
function performanceMetrics(body) {
	const metrics = {};
	const fields = [
		["totalDurationNs", body.total_duration],
		["loadDurationNs", body.load_duration],
		["promptEvalCount", body.prompt_eval_count],
		["promptEvalDurationNs", body.prompt_eval_duration],
		["evalCount", body.eval_count],
		["evalDurationNs", body.eval_duration]
	];
	for (const [name, raw] of fields) {
		const value = nonNegativeMetric$2(raw);
		if (value !== void 0) metrics[name] = value;
	}
	return Object.keys(metrics).length > 0 ? metrics : void 0;
}
function isLoopbackBaseUrl(baseUrl) {
	try {
		const parsed = new URL(baseUrl);
		const host = parsed.hostname;
		return (parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.username && !parsed.password && !parsed.search && !parsed.hash && (parsed.pathname === "" || parsed.pathname === "/") && (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]");
	} catch {
		return false;
	}
}
/**
* Read-only `/api/tags` check, entirely separate from `preflightExternalSend` (which is not
* modified by this Task). Confirms the server answers and the expected model is pulled, before any
* `send()` is attempted. A model name without a tag matches its `:latest` — Ollama's own convention.
*/
async function checkOllamaReadiness({ baseUrl = defaultOllamaBaseUrl, model = defaultOllamaModel, fetchImpl, timeoutMs = 5e3 } = {}) {
	const fetchFn = fetchImpl ?? ((input, init) => fetch(input, init));
	if (!isLoopbackBaseUrl(baseUrl)) return {
		reachable: false,
		modelPresent: false,
		models: [],
		baseUrl: "[invalid-local-endpoint]",
		model,
		detail: "invalid local Ollama endpoint"
	};
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	let response;
	try {
		response = await fetchFn(`${baseUrl}/api/tags`, {
			method: "GET",
			redirect: "error",
			signal: controller.signal
		});
	} catch (error) {
		return {
			reachable: false,
			modelPresent: false,
			models: [],
			baseUrl,
			model,
			detail: controller.signal.aborted ? `readiness timeout after ${timeoutMs}ms` : `not reachable: ${safeDiagnostic$2(error?.message ?? error)}`
		};
	} finally {
		clearTimeout(timer);
	}
	if (!response.ok) return {
		reachable: false,
		modelPresent: false,
		models: [],
		baseUrl,
		model,
		detail: `http-${response.status}`
	};
	let body;
	try {
		body = await response.json();
	} catch {
		return {
			reachable: true,
			modelPresent: false,
			models: [],
			baseUrl,
			model,
			detail: "malformed /api/tags response"
		};
	}
	const models = (body.models ?? []).map((entry) => entry.model ?? entry.name ?? "").filter(Boolean);
	const modelPresent = models.some((name) => name === model || name === `${model}:latest` || name.split(":")[0] === model);
	return {
		reachable: true,
		modelPresent,
		models,
		baseUrl,
		model,
		detail: modelPresent ? `model ${model} present` : `model ${model} not found among: ${models.join(", ") || "(none)"}`
	};
}
var OllamaLocalHttpTransport = class {
	providerId;
	connection = "local-http";
	baseUrl;
	model;
	generationOptions;
	fetchImpl;
	readinessTimeoutMs;
	constructor({ providerId = "ollama-local-http", baseUrl = defaultOllamaBaseUrl, model = defaultOllamaModel, generationOptions, fetchImpl, readinessTimeoutMs = 5e3 } = {}) {
		this.providerId = providerId;
		this.baseUrl = baseUrl;
		this.model = model;
		this.generationOptions = {
			...defaultOllamaGenerationOptions,
			...generationOptions
		};
		this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init));
		this.readinessTimeoutMs = readinessTimeoutMs;
	}
	/** Ollama is unauthenticated by default. No credential to check. */
	credentialStatus() {
		return {
			required: false,
			present: true,
			source: "none — local HTTP endpoint",
			authMode: "none"
		};
	}
	/**
	* The only thing that makes `local-only` honest for this transport: the configured target must
	* actually be the loopback interface, not an external host a misconfiguration could point at
	* (e.g. an Ollama Cloud URL). Backs the `local-endpoint-confirmed` preflight check.
	*/
	isLocalEndpoint() {
		let parsed;
		try {
			parsed = new URL(this.baseUrl);
		} catch {
			return false;
		}
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
		return isLoopbackBaseUrl(this.baseUrl);
	}
	/**
	* Live readiness is separate from construction and from the read-only UI preflight. The
	* Frontdoor invokes this only after the Owner has approved Dispatch, immediately before a Node
	* can create a Job/Thread or send a request.
	*/
	async checkReadiness() {
		const readiness = await checkOllamaReadiness({
			baseUrl: this.baseUrl,
			model: this.model,
			fetchImpl: this.fetchImpl,
			timeoutMs: this.readinessTimeoutMs
		});
		return {
			ready: readiness.reachable && readiness.modelPresent,
			detail: readiness.detail
		};
	}
	async localReadiness() {
		return checkOllamaReadiness({
			baseUrl: this.baseUrl,
			model: this.model,
			fetchImpl: this.fetchImpl,
			timeoutMs: this.readinessTimeoutMs
		});
	}
	async send(packet, options) {
		const startedAt = Date.now();
		if (!this.isLocalEndpoint()) throw new Error("Ollama endpoint is not a safe loopback URL");
		if (options.signal?.aborted) return {
			status: "cancelled",
			terminationReason: "cancelled before the request was sent",
			durationMs: 0
		};
		const controller = new AbortController();
		const timeoutReason = Symbol("external-send-timeout");
		const timer = setTimeout(() => controller.abort(timeoutReason), options.timeoutMs);
		const relayAbort = () => controller.abort(options.signal?.reason ?? /* @__PURE__ */ new Error("cancelled by Owner"));
		options.signal?.addEventListener("abort", relayAbort, { once: true });
		try {
			const response = await this.fetchImpl(`${this.baseUrl}/api/generate`, {
				method: "POST",
				redirect: "error",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					model: this.model,
					stream: false,
					options: this.generationOptions,
					prompt: `${packet.instruction}\n\n役割: ${packet.role}\n形式: ${packet.resultFormat}${dependencyPrompt(packet)}`
				}),
				signal: controller.signal
			});
			const durationMs = Date.now() - startedAt;
			if (!response.ok) return {
				status: this.statusForHttp(response.status),
				terminationReason: `http-${response.status}`,
				durationMs,
				errorText: (await this.safeBody(response)).slice(0, 200)
			};
			const body = await response.json();
			const metrics = performanceMetrics(body);
			if (body.error) return {
				status: "failed",
				terminationReason: `ollama-error:${safeDiagnostic$2(body.error)}`,
				durationMs,
				...metrics ? { metrics } : {}
			};
			const text = (body.response ?? "").trim();
			if (!text) return {
				status: "invalid",
				terminationReason: "no-response-text",
				durationMs,
				...metrics ? { metrics } : {}
			};
			return {
				status: "success",
				content: truncateAnswer(text),
				terminationReason: "completed",
				durationMs,
				...metrics ? { metrics } : {}
			};
		} catch (error) {
			const durationMs = Date.now() - startedAt;
			if (controller.signal.aborted) return controller.signal.reason === timeoutReason ? {
				status: "timeout",
				terminationReason: `no answer within ${options.timeoutMs}ms`,
				durationMs
			} : {
				status: "cancelled",
				terminationReason: "cancelled before the adapter answered",
				durationMs
			};
			throw error;
		} finally {
			clearTimeout(timer);
			options.signal?.removeEventListener("abort", relayAbort);
		}
	}
	/** 429 and 5xx are retryable conditions for the Owner to judge; 4xx are refusals to send. */
	statusForHttp(status) {
		if (status === 429 || status >= 500) return "failed";
		if (status === 401 || status === 403) return "failed";
		return "invalid";
	}
	async safeBody(response) {
		try {
			return safeDiagnostic$2(await response.text());
		} catch {
			return "response body unavailable";
		}
	}
};
//#endregion
//#region src/main/jobLoop/openAiCompatibleTransport.ts
function safeDiagnostic$1(value) {
	return String(value).replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]").replace(/(authorization|api[-_]?key|token|password|secret)=?[^\s,;]*/gi, "$1=[redacted]").replace(/https?:\/\/[^\s]+/gi, "[url-redacted]").slice(0, 200);
}
function nonNegativeMetric$1(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
function usageMetrics$1(usage) {
	if (!usage) return void 0;
	const metrics = {};
	const values = [
		["promptTokens", usage.prompt_tokens],
		["completionTokens", usage.completion_tokens],
		["totalTokens", usage.total_tokens]
	];
	for (const [name, raw] of values) {
		const value = nonNegativeMetric$1(raw);
		if (value !== void 0) metrics[name] = value;
	}
	return Object.keys(metrics).length > 0 ? metrics : void 0;
}
function responseText$1(content) {
	if (typeof content === "string") return content.trim();
	if (!Array.isArray(content)) return "";
	return content.map((part) => {
		if (typeof part === "string") return part;
		if (part && typeof part === "object" && "text" in part) return typeof part.text === "string" ? part.text : "";
		return "";
	}).join("").trim();
}
function endpointFor(baseUrl) {
	const parsed = new URL(baseUrl);
	if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("OpenAI-compatible external endpoint must be an https URL without credentials or query parameters");
	const clean = baseUrl.replace(/\/+$/, "");
	return clean.endsWith("/chat/completions") ? clean : `${clean}/chat/completions`;
}
var OpenAICompatibleTransport = class {
	providerId;
	connection = "api";
	endpoint;
	model;
	credentialVariable;
	fetchImpl;
	maxTokens;
	constructor({ providerId, baseUrl, model, credentialVariable, fetchImpl, maxTokens = 512 }) {
		this.providerId = providerId;
		this.endpoint = endpointFor(baseUrl);
		this.model = model;
		this.credentialVariable = credentialVariable;
		this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init));
		this.maxTokens = maxTokens;
	}
	credentialStatus() {
		return {
			required: true,
			present: Boolean(process.env[this.credentialVariable]?.trim()),
			source: `environment variable ${this.credentialVariable}`,
			authMode: "environment-secret"
		};
	}
	async send(packet, options) {
		const key = process.env[this.credentialVariable];
		if (!key) throw new MissingCredentialError(this.credentialVariable);
		const startedAt = Date.now();
		if (options.signal?.aborted) return {
			status: "cancelled",
			terminationReason: "cancelled before the request was sent",
			durationMs: 0
		};
		const controller = new AbortController();
		const timeoutReason = Symbol("external-send-timeout");
		const timer = setTimeout(() => controller.abort(timeoutReason), options.timeoutMs);
		const relayAbort = () => controller.abort(options.signal?.reason ?? /* @__PURE__ */ new Error("cancelled by Owner"));
		options.signal?.addEventListener("abort", relayAbort, { once: true });
		try {
			const response = await this.fetchImpl(this.endpoint, {
				method: "POST",
				redirect: "error",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${key}`
				},
				body: JSON.stringify({
					model: this.model,
					stream: false,
					max_tokens: this.maxTokens,
					temperature: 0,
					messages: [{
						role: "user",
						content: `${packet.instruction}\n\n役割: ${packet.role}\n形式: ${packet.resultFormat}`
					}]
				}),
				signal: controller.signal
			});
			const durationMs = Date.now() - startedAt;
			if (!response.ok) return {
				status: this.statusForHttp(response.status),
				terminationReason: `http-${response.status}`,
				durationMs,
				errorText: (await this.safeBody(response)).slice(0, 200)
			};
			let body;
			try {
				body = await response.json();
			} catch {
				return {
					status: "invalid",
					terminationReason: "malformed-json-response",
					durationMs
				};
			}
			const metrics = usageMetrics$1(body.usage);
			if (body.error) return {
				status: "failed",
				terminationReason: `provider-error:${safeDiagnostic$1(body.error.type ?? "unknown")}`,
				durationMs,
				errorText: safeDiagnostic$1(body.error.message ?? "provider returned an error"),
				...metrics ? { metrics } : {}
			};
			const text = responseText$1(body.choices?.[0]?.message?.content);
			if (!text) return {
				status: "invalid",
				terminationReason: "no-response-text",
				durationMs,
				...metrics ? { metrics } : {}
			};
			return {
				status: "success",
				content: truncateAnswer(text),
				terminationReason: "completed",
				durationMs,
				...metrics ? { metrics } : {}
			};
		} catch (error) {
			const durationMs = Date.now() - startedAt;
			if (controller.signal.aborted) return controller.signal.reason === timeoutReason ? {
				status: "timeout",
				terminationReason: `no answer within ${options.timeoutMs}ms`,
				durationMs
			} : {
				status: "cancelled",
				terminationReason: "cancelled before the adapter answered",
				durationMs
			};
			throw error;
		} finally {
			clearTimeout(timer);
			options.signal?.removeEventListener("abort", relayAbort);
		}
	}
	statusForHttp(status) {
		if (status === 429 || status >= 500) return "failed";
		if (status === 401 || status === 403) return "failed";
		return "invalid";
	}
	async safeBody(response) {
		try {
			return safeDiagnostic$1(await response.text());
		} catch {
			return "response body unavailable";
		}
	}
};
//#endregion
//#region src/main/jobLoop/localOpenAiCompatibleTransport.ts
var defaultLocalOpenAiCompatibleBaseUrl = "http://127.0.0.1:1234";
function safeDiagnostic(value) {
	return String(value).replace(/(authorization|bearer|api[-_]?key|token|password|secret)=?[^\s,;]*/gi, "$1=[redacted]").replace(/https?:\/\/[^\s]+/gi, "[url-redacted]").slice(0, 200);
}
function nonNegativeMetric(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
function usageMetrics(usage) {
	if (!usage) return void 0;
	const metrics = {};
	const values = [
		["promptTokens", usage.prompt_tokens],
		["completionTokens", usage.completion_tokens],
		["totalTokens", usage.total_tokens]
	];
	for (const [name, raw] of values) {
		const value = nonNegativeMetric(raw);
		if (value !== void 0) metrics[name] = value;
	}
	return Object.keys(metrics).length > 0 ? metrics : void 0;
}
function responseText(content) {
	if (typeof content === "string") return content.trim();
	if (!Array.isArray(content)) return "";
	return content.map((part) => {
		if (typeof part === "string") return part;
		if (part && typeof part === "object" && "text" in part) return typeof part.text === "string" ? part.text : "";
		return "";
	}).join("").trim();
}
function loopbackBaseUrl(baseUrl) {
	try {
		const parsed = new URL(baseUrl);
		return (parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.username && !parsed.password && !parsed.search && !parsed.hash && (parsed.pathname === "" || parsed.pathname === "/" || parsed.pathname === "/v1") && [
			"localhost",
			"127.0.0.1",
			"::1",
			"[::1]"
		].includes(parsed.hostname);
	} catch {
		return false;
	}
}
function apiRoot(baseUrl) {
	return baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "") + "/v1";
}
function modelIds(body) {
	return (body.data ?? []).map((entry) => typeof entry.id === "string" ? entry.id : "").filter(Boolean);
}
async function checkLocalOpenAiCompatibleReadiness({ baseUrl = defaultLocalOpenAiCompatibleBaseUrl, model = "", fetchImpl, timeoutMs = 5e3 } = {}) {
	if (!loopbackBaseUrl(baseUrl)) return {
		reachable: false,
		modelPresent: false,
		models: [],
		baseUrl: "[invalid-local-endpoint]",
		model,
		detail: "invalid local OpenAI-compatible endpoint"
	};
	const fetchFn = fetchImpl ?? ((input, init) => fetch(input, init));
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	let response;
	try {
		response = await fetchFn(`${apiRoot(baseUrl)}/models`, {
			method: "GET",
			redirect: "error",
			signal: controller.signal
		});
	} catch (error) {
		return {
			reachable: false,
			modelPresent: false,
			models: [],
			baseUrl,
			model,
			detail: controller.signal.aborted ? `readiness timeout after ${timeoutMs}ms` : `not reachable: ${safeDiagnostic(error?.message ?? error)}`
		};
	} finally {
		clearTimeout(timer);
	}
	if (!response.ok) return {
		reachable: false,
		modelPresent: false,
		models: [],
		baseUrl,
		model,
		detail: `http-${response.status}`
	};
	let body;
	try {
		body = await response.json();
	} catch {
		return {
			reachable: true,
			modelPresent: false,
			models: [],
			baseUrl,
			model,
			detail: "malformed /v1/models response"
		};
	}
	const models = modelIds(body);
	const modelPresent = Boolean(model) && models.includes(model);
	return {
		reachable: true,
		modelPresent,
		models,
		baseUrl,
		model,
		detail: model ? modelPresent ? `model ${model} present` : `model ${model} not found among: ${models.join(", ") || "(none)"}` : "LM Studio model is not selected; set LM_STUDIO_MODEL"
	};
}
var LocalOpenAICompatibleTransport = class {
	providerId;
	connection = "local-http";
	baseUrl;
	model;
	fetchImpl;
	readinessTimeoutMs;
	constructor({ providerId = "local-openai-compatible", baseUrl = defaultLocalOpenAiCompatibleBaseUrl, model = "", fetchImpl, readinessTimeoutMs = 5e3 } = {}) {
		this.providerId = providerId;
		this.baseUrl = baseUrl;
		this.model = model;
		this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init));
		this.readinessTimeoutMs = readinessTimeoutMs;
	}
	credentialStatus() {
		return {
			required: false,
			present: true,
			source: "none — local HTTP endpoint",
			authMode: "none"
		};
	}
	isLocalEndpoint() {
		return loopbackBaseUrl(this.baseUrl);
	}
	async localReadiness() {
		return checkLocalOpenAiCompatibleReadiness({
			baseUrl: this.baseUrl,
			model: this.model,
			fetchImpl: this.fetchImpl,
			timeoutMs: this.readinessTimeoutMs
		});
	}
	async checkReadiness() {
		const readiness = await this.localReadiness();
		return {
			ready: readiness.reachable && readiness.modelPresent,
			detail: readiness.detail
		};
	}
	async send(packet, options) {
		const startedAt = Date.now();
		if (!this.isLocalEndpoint()) throw new Error("LM Studio endpoint is not a safe loopback URL");
		if (!this.model) throw new Error("LM Studio model is not selected; set LM_STUDIO_MODEL before dispatch");
		if (options.signal?.aborted) return {
			status: "cancelled",
			terminationReason: "cancelled before the request was sent",
			durationMs: 0
		};
		const controller = new AbortController();
		const timeoutReason = Symbol("local-openai-compatible-timeout");
		const timer = setTimeout(() => controller.abort(timeoutReason), options.timeoutMs);
		const relayAbort = () => controller.abort(options.signal?.reason ?? /* @__PURE__ */ new Error("cancelled by Owner"));
		options.signal?.addEventListener("abort", relayAbort, { once: true });
		try {
			const response = await this.fetchImpl(`${apiRoot(this.baseUrl)}/chat/completions`, {
				method: "POST",
				redirect: "error",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					model: this.model,
					stream: false,
					max_tokens: 512,
					temperature: 0,
					messages: [{
						role: "user",
						content: `${packet.instruction}\n\n役割: ${packet.role}\n形式: ${packet.resultFormat}`
					}]
				}),
				signal: controller.signal
			});
			const durationMs = Date.now() - startedAt;
			if (!response.ok) return {
				status: response.status === 429 || response.status >= 500 || response.status === 401 || response.status === 403 ? "failed" : "invalid",
				terminationReason: `http-${response.status}`,
				durationMs,
				errorText: (await this.safeBody(response)).slice(0, 200)
			};
			let body;
			try {
				body = await response.json();
			} catch {
				return {
					status: "invalid",
					terminationReason: "malformed-json-response",
					durationMs
				};
			}
			const metrics = usageMetrics(body.usage);
			if (body.error) return {
				status: "failed",
				terminationReason: `provider-error:${safeDiagnostic(body.error.type ?? "unknown")}`,
				durationMs,
				errorText: safeDiagnostic(body.error.message ?? "LM Studio returned an error"),
				...metrics ? { metrics } : {}
			};
			const text = responseText(body.choices?.[0]?.message?.content);
			if (!text) return {
				status: "invalid",
				terminationReason: "no-response-text",
				durationMs,
				...metrics ? { metrics } : {}
			};
			return {
				status: "success",
				content: truncateAnswer(text),
				terminationReason: "completed",
				durationMs,
				...metrics ? { metrics } : {}
			};
		} catch (error) {
			const durationMs = Date.now() - startedAt;
			if (controller.signal.aborted) return controller.signal.reason === timeoutReason ? {
				status: "timeout",
				terminationReason: `no answer within ${options.timeoutMs}ms`,
				durationMs
			} : {
				status: "cancelled",
				terminationReason: "cancelled before the adapter answered",
				durationMs
			};
			throw error;
		} finally {
			clearTimeout(timer);
			options.signal?.removeEventListener("abort", relayAbort);
		}
	}
	async safeBody(response) {
		try {
			return safeDiagnostic(await response.text());
		} catch {
			return "response body unavailable";
		}
	}
};
//#endregion
//#region src/main/jobLoop/externalAdapter.ts
var defaultExternalTimeoutMs = 6e4;
/** Turn statuses cannot express timeout or cancellation, so those settle as a failed Turn. */
var turnStatusFor = {
	success: "success",
	failed: "failed",
	invalid: "invalid",
	timeout: "failed",
	cancelled: "failed"
};
/**
* One provider behind the common Adapter contract. Everything provider-specific lives in the
* transport, so a second provider is added by supplying another transport, not by changing Relay,
* Thread, Recovery, or Result handling.
*/
var ExternalConversationAdapter = class {
	adapterId;
	transport;
	hooks;
	timeoutMs;
	answers = /* @__PURE__ */ new Map();
	/** One controller per in-flight dispatch, so an Owner cancel reaches the real request. */
	inFlight = /* @__PURE__ */ new Map();
	role;
	supportedRoles;
	constructor(adapterId, role, transport, hooks, timeoutMs = defaultExternalTimeoutMs) {
		this.adapterId = adapterId;
		this.transport = transport;
		this.hooks = hooks;
		this.timeoutMs = timeoutMs;
		this.supportedRoles = Array.isArray(role) ? [...role] : [role];
		if (this.supportedRoles.length === 0) throw new AdapterProtocolError(`adapter ${adapterId} must support at least one role`);
		this.role = this.supportedRoles[0];
	}
	async send(request) {
		if (!adapterSupportsRole(this, request.role)) throw new AdapterProtocolError(`adapter ${this.adapterId} cannot take role ${request.role}`);
		const { packet, preflight } = await this.hooks.authorise(request);
		const startedAt = this.hooks.now();
		const controller = new AbortController();
		this.inFlight.set(request.dispatchId, controller);
		let outcome;
		try {
			outcome = await this.transport.send(packet, {
				timeoutMs: this.timeoutMs,
				signal: controller.signal
			});
		} catch (error) {
			const finishedAt = this.hooks.now();
			await this.hooks.recordCall(this.buildRecord(request, packet, preflight, {
				status: "failed",
				terminationReason: "transport-threw",
				durationMs: finishedAt.getTime() - startedAt.getTime(),
				errorText: String(error?.message ?? error).slice(0, 200)
			}, startedAt, finishedAt));
			throw error;
		} finally {
			this.inFlight.delete(request.dispatchId);
		}
		const finishedAt = this.hooks.now();
		await this.hooks.recordCall(this.buildRecord(request, packet, preflight, outcome, startedAt, finishedAt));
		const answered = outcome.status === "success" && Boolean(outcome.content);
		const payload = {
			content: answered ? outcome.content : `【外部Adapter応答なし】provider=${this.transport.providerId} status=${outcome.status} reason=${outcome.terminationReason}`,
			status: answered ? "success" : turnStatusFor[outcome.status],
			summary: `${this.transport.providerId} / ${request.role} / ${outcome.status}`,
			verification: [{
				name: "external-answer-received",
				status: answered ? "pass" : "not-run",
				reason: outcome.terminationReason
			}],
			risks: answered ? [] : ["外部Adapterから採用可能な回答を得られなかった"],
			envelopeStatus: outcome.status,
			terminationReason: outcome.terminationReason,
			...outcome.errorText ? { errorRef: `external:${outcome.errorText}` } : {}
		};
		const adapterConversationId = `${this.adapterId}:${request.threadId}:${request.sequence}:${request.attempt ?? 0}`;
		this.answers.set(adapterConversationId, {
			payload,
			state: "ready"
		});
		return {
			dispatchId: request.dispatchId,
			adapterId: this.adapterId,
			adapterConversationId,
			acceptedAt: startedAt.toISOString()
		};
	}
	/**
	* Aborts an in-flight external request. Returns false when nothing is in flight for that
	* dispatch — a completed send cannot be recalled, only its Result judged by the Owner.
	*/
	cancel(dispatchId, reason = "cancelled by Owner") {
		const controller = this.inFlight.get(dispatchId);
		if (!controller) return false;
		controller.abort(new Error(reason));
		return true;
	}
	async getState(acceptance) {
		return this.answers.get(acceptance.adapterConversationId)?.state ?? "failed";
	}
	async receive(acceptance) {
		const pending = this.answers.get(acceptance.adapterConversationId);
		if (!pending) throw new AdapterProtocolError(`no pending answer for ${acceptance.adapterConversationId}`);
		this.answers.delete(acceptance.adapterConversationId);
		return pending.payload;
	}
	buildRecord(request, packet, preflight, outcome, startedAt, finishedAt) {
		return {
			callId: `call-${packet.packetHash.slice(0, 12)}-${request.attempt ?? 0}`,
			approvalId: preflight.approvalId ?? "none",
			provider: this.transport.providerId,
			adapterId: this.adapterId,
			role: request.role,
			taskId: request.taskId,
			threadId: request.threadId,
			jobId: request.jobId,
			sequence: request.sequence,
			attempt: request.attempt ?? 0,
			packetHash: packet.packetHash,
			inputHash: request.inputHash ?? "",
			scopeHash: request.scopeHash ?? "",
			contextHash: request.contextHash ?? "",
			status: outcome.status,
			costTier: preflight.costTier,
			durationMs: outcome.durationMs,
			terminationReason: outcome.terminationReason,
			...outcome.metrics ? { metrics: outcome.metrics } : {},
			startedAt: startedAt.toISOString(),
			finishedAt: finishedAt.toISOString(),
			...outcome.errorText ? { errorText: outcome.errorText } : {}
		};
	}
};
//#endregion
//#region src/main/liveRelay.ts
/**
* Builds the live Provider-neutral Relay registration used by Electron Main and local
* verification probes. Constructing this graph does not read credentials or contact a provider;
* network access remains inside an explicit readiness check or send.
*/
function createLiveRelay(runtimeRoot, ollamaOptions = {}) {
	const externalAdapterId = "claude-external";
	const externalTransport = new AnthropicMessagesTransport();
	const ollamaAdapterId = "ollama-local";
	const ollamaTransport = new OllamaLocalHttpTransport(ollamaOptions);
	const lmStudioAdapterId = "lmstudio-local";
	const lmStudioTransport = new LocalOpenAICompatibleTransport({
		providerId: "lmstudio",
		baseUrl: process.env.LM_STUDIO_BASE_URL?.trim() || "http://127.0.0.1:1234",
		model: process.env.LM_STUDIO_MODEL?.trim() || ""
	});
	const deepSeekAdapterId = "deepseek-external";
	const deepSeekTransport = new OpenAICompatibleTransport({
		providerId: "deepseek",
		baseUrl: process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com",
		model: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash",
		credentialVariable: "DEEPSEEK_API_KEY"
	});
	const zaiAdapterId = "zai-external";
	const zaiTransport = new OpenAICompatibleTransport({
		providerId: "zai",
		baseUrl: process.env.ZAI_BASE_URL?.trim() || "https://api.z.ai/api/paas/v4",
		model: process.env.ZAI_MODEL?.trim() || "glm-5.3",
		credentialVariable: "ZAI_API_KEY"
	});
	const qwenAdapterId = "qwen-external";
	const qwenTransport = new OpenAICompatibleTransport({
		providerId: "qwen",
		baseUrl: process.env.QWEN_BASE_URL?.trim() || process.env.DASHSCOPE_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1",
		model: process.env.QWEN_MODEL?.trim() || "qwen3.7-plus",
		credentialVariable: "DASHSCOPE_API_KEY"
	});
	const openRouterAdapterId = "openrouter-free";
	const openRouterTransport = new OpenAICompatibleTransport({
		providerId: "openrouter",
		baseUrl: process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1",
		model: process.env.OPENROUTER_MODEL?.trim() || "openrouter/free",
		credentialVariable: "OPENROUTER_API_KEY"
	});
	let relay;
	relay = new ConversationRelay({
		runtimeRoot,
		externalTransports: {
			[externalAdapterId]: externalTransport,
			[ollamaAdapterId]: ollamaTransport,
			[lmStudioAdapterId]: lmStudioTransport,
			[deepSeekAdapterId]: deepSeekTransport,
			[zaiAdapterId]: zaiTransport,
			[qwenAdapterId]: qwenTransport,
			[openRouterAdapterId]: openRouterTransport
		},
		adapters: [
			new FakeProposalConversationAdapter(),
			new FakeCriticConversationAdapter(),
			new FakeImplementationConversationAdapter(),
			new ExternalConversationAdapter(externalAdapterId, "proposal", externalTransport, {
				authorise: (request) => relay.externalHooks(externalAdapterId, externalTransport).authorise(request),
				recordCall: (record) => relay.externalHooks(externalAdapterId, externalTransport).recordCall(record),
				now: () => /* @__PURE__ */ new Date()
			}),
			new ExternalConversationAdapter(ollamaAdapterId, ["proposal", "critic"], ollamaTransport, {
				authorise: (request) => relay.externalHooks(ollamaAdapterId, ollamaTransport).authorise(request),
				recordCall: (record) => relay.externalHooks(ollamaAdapterId, ollamaTransport).recordCall(record),
				now: () => /* @__PURE__ */ new Date()
			}),
			new ExternalConversationAdapter(lmStudioAdapterId, [
				"proposal",
				"critic",
				"review"
			], lmStudioTransport, {
				authorise: (request) => relay.externalHooks(lmStudioAdapterId, lmStudioTransport).authorise(request),
				recordCall: (record) => relay.externalHooks(lmStudioAdapterId, lmStudioTransport).recordCall(record),
				now: () => /* @__PURE__ */ new Date()
			}),
			new ExternalConversationAdapter(deepSeekAdapterId, [
				"proposal",
				"critic",
				"review"
			], deepSeekTransport, {
				authorise: (request) => relay.externalHooks(deepSeekAdapterId, deepSeekTransport).authorise(request),
				recordCall: (record) => relay.externalHooks(deepSeekAdapterId, deepSeekTransport).recordCall(record),
				now: () => /* @__PURE__ */ new Date()
			}),
			new ExternalConversationAdapter(zaiAdapterId, [
				"proposal",
				"critic",
				"review"
			], zaiTransport, {
				authorise: (request) => relay.externalHooks(zaiAdapterId, zaiTransport).authorise(request),
				recordCall: (record) => relay.externalHooks(zaiAdapterId, zaiTransport).recordCall(record),
				now: () => /* @__PURE__ */ new Date()
			}),
			new ExternalConversationAdapter(qwenAdapterId, [
				"proposal",
				"critic",
				"review"
			], qwenTransport, {
				authorise: (request) => relay.externalHooks(qwenAdapterId, qwenTransport).authorise(request),
				recordCall: (record) => relay.externalHooks(qwenAdapterId, qwenTransport).recordCall(record),
				now: () => /* @__PURE__ */ new Date()
			}),
			new ExternalConversationAdapter(openRouterAdapterId, [
				"proposal",
				"critic",
				"review"
			], openRouterTransport, {
				authorise: (request) => relay.externalHooks(openRouterAdapterId, openRouterTransport).authorise(request),
				recordCall: (record) => relay.externalHooks(openRouterAdapterId, openRouterTransport).recordCall(record),
				now: () => /* @__PURE__ */ new Date()
			})
		]
	});
	return relay;
}
//#endregion
//#region src/main/frontdoor/pathIntegrity.ts
var protectedRoots = [
	adfRepositoryRoot,
	blockDefenseRepositoryRoot,
	obsidianRoot
];
function isSameOrInside(root, candidate) {
	const relative = node_path.default.relative(root, candidate);
	return relative === "" || !relative.startsWith(`..${node_path.default.sep}`) && relative !== ".." && !node_path.default.isAbsolute(relative);
}
async function realpathWithMissingSuffix(value) {
	const missing = [];
	let cursor = node_path.default.resolve(value);
	try {
		return await (0, node_fs_promises.realpath)(cursor);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	while (true) {
		missing.unshift(node_path.default.basename(cursor));
		const parent = node_path.default.dirname(cursor);
		if (parent === cursor) throw new Error("Runtime root cannot be resolved");
		cursor = parent;
		try {
			const existing = await (0, node_fs_promises.realpath)(cursor);
			return node_path.default.join(existing, ...missing);
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
}
async function assertRuntimeRootSafe(runtimeRoot) {
	const resolved = await realpathWithMissingSuffix(runtimeRoot);
	for (const protectedRoot of protectedRoots) {
		const canonical = await (0, node_fs_promises.realpath)(protectedRoot);
		if (isSameOrInside(canonical, resolved) || isSameOrInside(resolved, canonical)) throw new Error("Runtime root overlaps a protected Canonical repo or Obsidian root");
	}
	return resolved;
}
async function assertNoSymlinkComponents(root, candidate) {
	const relative = node_path.default.relative(root, candidate);
	if (relative.startsWith(`..${node_path.default.sep}`) || relative === ".." || node_path.default.isAbsolute(relative)) throw new Error("Runtime path is outside the fixed Runtime root");
	let cursor = root;
	for (const component of relative.split(node_path.default.sep).filter(Boolean)) {
		cursor = node_path.default.join(cursor, component);
		try {
			if ((await (0, node_fs_promises.lstat)(cursor)).isSymbolicLink()) throw new Error("Runtime path contains a symlink");
		} catch (error) {
			if (error.code === "ENOENT") break;
			throw error;
		}
	}
}
async function safeRuntimePath(runtimeRoot, reference) {
	if (typeof reference !== "string" || !reference || node_path.default.isAbsolute(reference) || reference.includes("\0")) throw new Error("Runtime reference is outside the fixed Runtime root");
	if (node_path.default.normalize(reference) !== reference || reference.split(/[\\/]/).includes("..")) throw new Error("Runtime reference contains a parent traversal");
	const root = await assertRuntimeRootSafe(runtimeRoot);
	const candidate = node_path.default.resolve(root, reference);
	await assertNoSymlinkComponents(root, candidate);
	const existing = await (0, node_fs_promises.realpath)(candidate);
	if (!isSameOrInside(root, existing)) throw new Error("Runtime reference is outside the fixed Runtime root");
	await assertNoSymlinkComponents(root, existing);
	return existing;
}
//#endregion
//#region src/main/jobLoop/liveArtifacts.ts
var MAX_CONTENT_LENGTH = 12e3;
function boundedText$1(value) {
	if (typeof value !== "string") return void 0;
	return value.length > MAX_CONTENT_LENGTH ? `${value.slice(0, MAX_CONTENT_LENGTH)}\n…（表示上限により省略）` : value;
}
function errorMessage(error) {
	return error instanceof Error ? error.message : "成果物を検証できませんでした";
}
async function inspectResult(runtimeRoot, thread, turn) {
	const reference = turn.resultEnvelopeRef;
	const base = {
		turnId: turn.turnId,
		adapterId: turn.adapterId,
		role: turn.role,
		status: turn.status,
		reference,
		createdAt: turn.createdAt
	};
	try {
		const envelope = await readJson(await safeRuntimePath(runtimeRoot, reference));
		validateResultEnvelope(envelope, {
			taskId: thread.taskId,
			jobId: thread.jobId,
			inputHash: thread.inputHash
		});
		const actualHash = hashJson(envelope);
		if (!turn.resultEnvelopeHash) throw new Error("Result Envelope hash is missing");
		if (turn.resultEnvelopeHash !== actualHash) throw new Error("Result Envelope hash mismatch");
		return {
			...base,
			artifactStatus: "available",
			hash: actualHash,
			summary: boundedText$1(envelope.summary),
			content: boundedText$1(envelope.content),
			verification: envelope.verification,
			risks: envelope.risks
		};
	} catch (error) {
		return {
			...base,
			artifactStatus: "broken",
			issue: errorMessage(error)
		};
	}
}
async function inspectEvidence(runtimeRoot, thread) {
	const reference = `threads/${thread.threadId}/evidence-links.json`;
	try {
		const evidence = await readJson(await safeRuntimePath(runtimeRoot, reference));
		if (evidence.threadId !== thread.threadId || evidence.taskId !== thread.taskId || evidence.jobId !== thread.jobId) throw new Error("Evidence binding mismatch");
		if (!Array.isArray(evidence.turns)) throw new Error("Evidence turns are invalid");
		const expectedTurns = new Map(thread.turns.filter((turn) => Boolean(turn.resultEnvelopeRef)).map((turn) => [turn.turnId, turn]));
		const seenTurnIds = /* @__PURE__ */ new Set();
		for (const entry of evidence.turns) {
			if (!entry || typeof entry !== "object") throw new Error("Evidence turn entry is invalid");
			const evidenceTurn = entry;
			if (typeof evidenceTurn.turnId !== "string" || typeof evidenceTurn.resultEnvelopeRef !== "string") throw new Error("Evidence turn binding is invalid");
			const expected = expectedTurns.get(evidenceTurn.turnId);
			if (!expected || expected.resultEnvelopeRef !== evidenceTurn.resultEnvelopeRef) throw new Error("Evidence turn reference mismatch");
			if (seenTurnIds.has(evidenceTurn.turnId)) throw new Error("Evidence contains a duplicate Thread turn");
			if (typeof expected.resultEnvelopeHash !== "string" || typeof evidenceTurn.resultEnvelopeHash !== "string") throw new Error("Evidence turn hash is missing");
			if (expected.resultEnvelopeHash !== evidenceTurn.resultEnvelopeHash) throw new Error("Evidence turn hash mismatch");
			seenTurnIds.add(evidenceTurn.turnId);
		}
		if (seenTurnIds.size !== expectedTurns.size) throw new Error("Evidence is missing a Thread turn");
		return {
			artifactStatus: "available",
			reference,
			hash: hashJson(evidence),
			turnCount: evidence.turns.length
		};
	} catch (error) {
		return {
			artifactStatus: "broken",
			reference,
			turnCount: 0,
			issue: errorMessage(error)
		};
	}
}
async function inspectThreadArtifacts(runtimeRoot, thread) {
	if (thread.state !== "completed") throw new Error(`Live artifacts are available only for completed Threads: ${thread.state}`);
	const results = await Promise.all(thread.turns.filter((turn) => Boolean(turn.resultEnvelopeRef)).map((turn) => inspectResult(runtimeRoot, thread, turn)));
	return {
		threadId: thread.threadId,
		taskId: thread.taskId,
		jobId: thread.jobId,
		threadState: thread.state,
		results,
		evidence: await inspectEvidence(runtimeRoot, thread),
		workPlane: {
			artifactStatus: "not-applicable",
			note: "通常のConversation ThreadにはWork Plane Exportはありません。FrontdoorのExport済みArtifactは別のOwner Gate経路で確認します。"
		}
	};
}
//#endregion
//#region src/main/relayService.ts
var ownerActions = [
	"continue",
	"stop",
	"approve",
	"next-task"
];
/**
* Owner-approved Task Packets live on disk and are placed there outside the renderer.
* The renderer can only name an existing taskId, so it cannot invent an approval.
*/
function approvedTaskDirectory(relay) {
	return node_path.default.join(relay.runtimeRoot, "approved-tasks");
}
function asIdentifier(value, label) {
	if (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,120}$/.test(value)) throw new Error(`invalid ${label}`);
	return value;
}
function asOwnerAction(value) {
	if (typeof value !== "string" || !ownerActions.includes(value)) throw new Error("invalid owner action");
	return value;
}
function asNote(value) {
	if (value === void 0 || value === null) return void 0;
	if (typeof value !== "string" || value.length > 400) throw new Error("invalid note");
	return value;
}
async function guard$1(run) {
	try {
		return {
			ok: true,
			value: await run()
		};
	} catch (error) {
		return {
			ok: false,
			error: error.message
		};
	}
}
async function loadApprovedPacket(relay, taskId) {
	const file = node_path.default.join(approvedTaskDirectory(relay), `${taskId}.json`);
	try {
		return await readJson(file);
	} catch (error) {
		if (error.code === "ENOENT") throw new Error(`no approved Task Packet for ${taskId}. Place the Owner-approved packet at approved-tasks/${taskId}.json before starting a Thread.`);
		throw error;
	}
}
function listApprovedTaskIds(relay) {
	return guard$1(async () => {
		try {
			return (await (0, node_fs_promises.readdir)(approvedTaskDirectory(relay), { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name.replace(/\.json$/, "")).sort();
		} catch (error) {
			if (error.code === "ENOENT") return [];
			throw error;
		}
	});
}
function listThreads(relay) {
	return guard$1(() => relay.listThreads());
}
function getThread(relay, threadId) {
	return guard$1(() => relay.getConversationState(asIdentifier(threadId, "threadId")));
}
/** Read-only, hash- and binding-checked Result/Evidence view for a completed Live Board Thread. */
function inspectLiveArtifacts(relay, threadId) {
	return guard$1(async () => {
		const thread = await relay.getConversationState(asIdentifier(threadId, "threadId"));
		return inspectThreadArtifacts(relay.runtimeRoot, thread);
	});
}
/** Starts a Thread only for a Task that already has an Owner-approved packet on disk. */
function startApprovedThread(relay, taskId) {
	return guard$1(async () => relay.startThread(await loadApprovedPacket(relay, asIdentifier(taskId, "taskId"))));
}
/** Sends the first Turn of an `open` Thread. */
function sendFirstTurn(relay, threadId) {
	return guard$1(() => relay.continueJob(asIdentifier(threadId, "threadId")));
}
/** One Owner action: approve continuation and add the next Turn. */
function continueThread(relay, threadId, note) {
	return guard$1(() => relay.continueWithOwnerApproval(asIdentifier(threadId, "threadId"), asNote(note)));
}
var recoveryActions = [
	"resend",
	"record-failure",
	"stop"
];
function asRecoveryAction(value) {
	if (typeof value !== "string" || !recoveryActions.includes(value)) throw new Error("invalid recovery action");
	return value;
}
/** One startup pass. Detects interrupted sends; never resends or fails anything on its own. */
function scanForRecovery(relay) {
	return guard$1(() => relay.scanForRecovery());
}
function recoverThread(relay, threadId, action, note) {
	return guard$1(() => {
		const id = asIdentifier(threadId, "threadId");
		const safeNote = asNote(note);
		switch (asRecoveryAction(action)) {
			case "resend": return relay.resendFromRecovery(id, safeNote);
			case "record-failure": return relay.recordRecoveryFailure(id, safeNote);
			default: return relay.stopFromRecovery(id, safeNote);
		}
	});
}
/**
* Read-only Owner gate report. Opens no connection: it only reads Thread state, the Registry and
* the Owner approval file. The renderer cannot create or edit that file through any IPC.
*/
function preflightExternal(relay, threadId, adapterId) {
	return guard$1(() => relay.preflightExternalSend(asIdentifier(threadId, "threadId"), asIdentifier(adapterId, "adapterId")));
}
/**
* One external send, on one explicit Owner action. The gate runs again inside the Adapter, so a
* stale preflight in the UI cannot authorise anything. No retry and no fallback.
*/
function sendExternal(relay, threadId, adapterId) {
	return guard$1(async () => {
		const id = asIdentifier(threadId, "threadId");
		const adapter = asIdentifier(adapterId, "adapterId");
		const preflight = await relay.preflightExternalSend(id, adapter);
		if (!preflight.ok) throw new Error(`external send blocked: ${preflight.blockingReasons.join("; ")}`);
		await relay.assertAdapterReadyForDispatch(adapter);
		return relay.continueJob(id, adapter);
	});
}
function cancelExternal(relay, threadId, note) {
	return guard$1(async () => ({ cancelled: relay.cancelExternalSend(asIdentifier(threadId, "threadId"), asNote(note) ?? "cancelled by Owner") }));
}
function externalSendState(relay, threadId) {
	return guard$1(async () => ({ inFlight: relay.hasInFlightExternalSend(asIdentifier(threadId, "threadId")) }));
}
/** Read-only, Registry-derived candidates for explicit external dispatch. Opens no connection. */
function listExternalAdapters(relay) {
	return guard$1(async () => relay.listExternalAdapterProfiles());
}
/**
* Owner-explicit only. The one IPC in this file that actually reaches a network endpoint
* (`/api/tags`, read-only) — callers must never invoke it from startup, Thread selection, or a
* polling loop.
*/
function ollamaReadiness() {
	return guard$1(() => checkOllamaReadiness());
}
/** Owner-explicit only. Checks the selected registered local model Adapter; never polls. */
function localReadiness(relay, adapterId) {
	return guard$1(() => relay.localReadiness(asIdentifier(adapterId, "adapterId")));
}
function decideThread(relay, threadId, action, note) {
	return guard$1(() => {
		const action_ = asOwnerAction(action);
		if (action_ === "continue") throw new Error("use continueThread so that continue is a single Owner action");
		return relay.recordOwnerDecision(asIdentifier(threadId, "threadId"), action_, asNote(note));
	});
}
//#endregion
//#region src/main/frontdoor/participantRegistry.ts
/**
* Registry of possible AI participants. These profiles describe capabilities,
* not permanent roles. The same participant may be assigned as frontdoor,
* specialist, reviewer, or integrator by an approved Phase/Task plan.
*/
var participantProfiles = [
	{
		participantId: "codex",
		displayName: "Codex",
		connection: "mcp",
		status: "available",
		roles: [
			"frontdoor",
			"specialist",
			"reviewer",
			"integrator"
		],
		capabilities: ["read", "propose"],
		dataPolicy: "local-only"
	},
	{
		participantId: "cursor",
		displayName: "Cursor",
		connection: "mcp",
		status: "available",
		roles: [
			"frontdoor",
			"specialist",
			"reviewer",
			"integrator"
		],
		capabilities: ["read", "propose"],
		dataPolicy: "unknown"
	},
	{
		participantId: "claude-code",
		displayName: "Claude Code",
		connection: "cli",
		status: "planned",
		roles: [
			"frontdoor",
			"specialist",
			"reviewer",
			"integrator"
		],
		capabilities: ["read", "propose"],
		dataPolicy: "external-send"
	}
];
var ParticipantRegistryError = class extends Error {
	code = "PARTICIPANT_REGISTRY_REJECTED";
};
function getParticipantProfile(participantId) {
	const profile = participantProfiles.find((candidate) => candidate.participantId === participantId);
	if (!profile) throw new ParticipantRegistryError(`unknown participant: ${participantId}`);
	return profile;
}
function validateParticipantAssignment(participantId, role, capabilities) {
	const profile = getParticipantProfile(participantId);
	if (profile.status !== "available") throw new ParticipantRegistryError(`participant is not available: ${participantId}`);
	if (!profile.roles.includes(role)) throw new ParticipantRegistryError(`participant ${participantId} does not support role ${role}`);
	if (!capabilities.every((capability) => profile.capabilities.includes(capability))) throw new ParticipantRegistryError(`participant ${participantId} does not support the requested capabilities`);
}
function participantAssignmentId(runId, node) {
	const assignment = node.participantAssignment;
	if (!assignment) throw new ParticipantRegistryError(`node has no participant assignment: ${node.nodeId}`);
	return assignment.assignmentId ?? `assignment-${hashJson([
		runId,
		node.nodeId,
		assignment
	]).slice(0, 24)}`;
}
//#endregion
//#region src/main/frontdoor/decomposition.ts
var DecompositionRejectedError = class extends Error {
	code = "DECOMPOSITION_REJECTED";
	details;
	constructor(details) {
		super(`Decomposition rejected: ${details.join("; ")}`);
		this.details = details;
	}
};
function subset(values, allowed) {
	return values.every((value) => allowed.includes(value));
}
function capabilitiesSubset(node, request) {
	return node.capabilities.every((capability) => request.constraints.allowedCapabilities.includes(capability));
}
function validateNode(node, request, ids) {
	const errors = [];
	if (!node.nodeId) errors.push("nodeId is required");
	if (ids.has(node.nodeId)) errors.push(`duplicate nodeId: ${node.nodeId}`);
	if (!node.objective.trim()) errors.push(`node objective is required: ${node.nodeId}`);
	if (!node.adapterId || !node.role) errors.push(`node adapter and role are required: ${node.nodeId}`);
	if (node.participantAssignment) if (!node.participantAssignment.participantId || !node.participantAssignment.role) errors.push(`participant assignment is incomplete: ${node.nodeId}`);
	else {
		try {
			validateParticipantAssignment(node.participantAssignment.participantId, node.participantAssignment.role, node.participantAssignment.capabilities);
		} catch (error) {
			errors.push(`participant assignment is invalid for ${node.nodeId}: ${error.message}`);
		}
		if (!node.participantAssignment.capabilities.every((capability) => node.capabilities.includes(capability))) errors.push(`participant assignment exceeds node capability grant: ${node.nodeId}`);
	}
	if (!subset(node.scope.inScope, request.scope.inScope)) errors.push(`node scope exceeds parent scope: ${node.nodeId}`);
	if (!subset(node.contextReferences, request.contextReferences)) errors.push(`node context exceeds parent context: ${node.nodeId}`);
	if (!request.scope.outOfScope.every((item) => node.scope.outOfScope.includes(item))) errors.push(`node removes a parent out-of-scope boundary: ${node.nodeId}`);
	if (!capabilitiesSubset(node, request)) errors.push(`node capability exceeds parent grant: ${node.nodeId}`);
	if (node.depth < 1 || node.depth > request.constraints.maxDepth) errors.push(`node depth is outside the approved limit: ${node.nodeId}`);
	return errors;
}
function assertAcyclic(nodes) {
	const byId = new Map(nodes.map((node) => [node.nodeId, node]));
	const visiting = /* @__PURE__ */ new Set();
	const visited = /* @__PURE__ */ new Set();
	const visit = (nodeId) => {
		if (visiting.has(nodeId)) throw new DecompositionRejectedError([`cyclic dependency detected at ${nodeId}`]);
		if (visited.has(nodeId)) return;
		const node = byId.get(nodeId);
		if (!node) throw new DecompositionRejectedError([`dependency references unknown node: ${nodeId}`]);
		visiting.add(nodeId);
		node.dependsOn.forEach(visit);
		visiting.delete(nodeId);
		visited.add(nodeId);
	};
	nodes.forEach((node) => visit(node.nodeId));
}
function computedDepths(nodes) {
	const byId = new Map(nodes.map((node) => [node.nodeId, node]));
	const memo = /* @__PURE__ */ new Map();
	const depthOf = (nodeId) => {
		const cached = memo.get(nodeId);
		if (cached) return cached;
		const node = byId.get(nodeId);
		if (!node) throw new DecompositionRejectedError([`dependency references unknown node: ${nodeId}`]);
		const depth = node.dependsOn.length === 0 ? 1 : Math.max(...node.dependsOn.map((dependency) => depthOf(dependency))) + 1;
		memo.set(nodeId, depth);
		return depth;
	};
	nodes.forEach((node) => depthOf(node.nodeId));
	return memo;
}
function validateDecompositionPlan(request, plan) {
	const errors = [];
	if (plan.requestId !== request.requestId) errors.push("plan requestId mismatch");
	if (!Number.isInteger(plan.version) || plan.version < 1) errors.push("plan version is invalid");
	if (!Array.isArray(plan.nodes) || plan.nodes.length === 0) errors.push("plan must contain at least one node");
	if (plan.nodes.length > request.constraints.maxNodes) errors.push("plan exceeds maxNodes");
	if (plan.nodeReviewPolicy !== void 0 && !["auto-continue-safe", "owner-each-node"].includes(plan.nodeReviewPolicy)) errors.push("plan nodeReviewPolicy is invalid");
	const ids = /* @__PURE__ */ new Set();
	for (const node of plan.nodes) errors.push(...validateNode(node, request, ids)), ids.add(node.nodeId);
	if (errors.length) throw new DecompositionRejectedError(errors);
	assertAcyclic(plan.nodes);
	const depths = computedDepths(plan.nodes);
	const depthErrors = plan.nodes.filter((node) => node.depth !== depths.get(node.nodeId)).map((node) => `node depth does not match dependency depth: ${node.nodeId}`);
	if (depthErrors.length) throw new DecompositionRejectedError(depthErrors);
}
function createDecompositionPlan(request, input) {
	validateDecompositionPlan(request, input);
	const nodeReviewPolicy = input.nodeReviewPolicy ?? "auto-continue-safe";
	const normalizedInput = {
		...input,
		nodeReviewPolicy
	};
	return {
		...normalizedInput,
		planHash: hashJson(normalizedInput)
	};
}
function nodeReviewPolicyForPlan(plan) {
	return plan.nodeReviewPolicy ?? "auto-continue-safe";
}
function readyNodeIds(runNodes) {
	const completed = new Set(runNodes.filter((record) => record.state === "completed").map((record) => record.node.nodeId));
	return runNodes.filter((record) => record.state === "queued" && record.node.dependsOn.every((dependency) => completed.has(dependency))).map((record) => record.node.nodeId);
}
//#endregion
//#region src/main/frontdoor/intake.ts
var FrontdoorRequestRejectedError = class extends Error {
	code = "FRONTDOOR_REQUEST_REJECTED";
	details;
	constructor(details) {
		super(`Frontdoor request rejected: ${details.join("; ")}`);
		this.details = details;
	}
};
function validateFrontdoorRequest(input) {
	const errors = [];
	const nonEmptyText = (value) => typeof value === "string" && value.trim().length > 0;
	if (!nonEmptyText(input?.requestId) || !/^[A-Za-z0-9._:-]{1,120}$/.test(input.requestId)) errors.push("requestId must be a safe non-empty identifier");
	if (!nonEmptyText(input?.objective)) errors.push("objective is required");
	if (!nonEmptyText(input?.userInput)) errors.push("userInput is required");
	if (!nonEmptyText(input?.projectRef)) errors.push("projectRef is required");
	if (!nonEmptyText(input?.requestedOutput)) errors.push("requestedOutput is required");
	if (![
		"codex",
		"chatgpt",
		"owner",
		"participant",
		"test"
	].includes(input?.source)) errors.push("source is invalid");
	if (input?.sourceParticipantId !== void 0 && input.sourceParticipantRole === void 0) errors.push("sourceParticipantRole is required when sourceParticipantId is provided");
	if (input?.sourceParticipantRole !== void 0 && input.sourceParticipantId === void 0) errors.push("sourceParticipantId is required when sourceParticipantRole is provided");
	if (input?.sourceParticipantId && input?.sourceParticipantRole) try {
		validateParticipantAssignment(input.sourceParticipantId, input.sourceParticipantRole, input.constraints?.allowedCapabilities ?? []);
	} catch (error) {
		errors.push(`source participant assignment is invalid: ${error.message}`);
	}
	if (!Array.isArray(input?.contextReferences)) errors.push("contextReferences must be an array");
	if (!Array.isArray(input?.scope?.inScope) || !Array.isArray(input?.scope?.outOfScope)) errors.push("scope is invalid");
	if (!input?.constraints || input.constraints.externalSend !== false) errors.push("externalSend must be false");
	if (!Array.isArray(input?.constraints?.allowedCapabilities) || input.constraints.allowedCapabilities.length === 0) errors.push("allowedCapabilities are required");
	if (!Number.isInteger(input?.constraints?.maxNodes) || input.constraints.maxNodes < 1) errors.push("maxNodes must be a positive integer");
	if (!Number.isInteger(input?.constraints?.maxDepth) || input.constraints.maxDepth < 1) errors.push("maxDepth must be a positive integer");
	if (input?.sourceCandidateBinding) {
		const binding = input.sourceCandidateBinding;
		const identifiers = [
			["candidateId", binding.candidateId],
			["artifactRef", binding.artifactRef],
			["reviewDecisionId", binding.reviewDecisionId],
			["childRunId", binding.childRunId],
			["parentRunId", binding.parentRunId],
			["sourceAggregateRef", binding.sourceAggregateRef],
			["sourceResultRef", binding.sourceResultRef],
			["sourceEvidenceRef", binding.sourceEvidenceRef]
		];
		for (const [label, value] of identifiers) if (!nonEmptyText(value) || value.includes("..")) errors.push(`sourceCandidateBinding.${label} is invalid`);
		const hashes = [
			["candidateHash", binding.candidateHash],
			["reviewTargetHash", binding.reviewTargetHash],
			["sourceAggregateHash", binding.sourceAggregateHash],
			["sourceResultHash", binding.sourceResultHash],
			["sourceEvidenceHash", binding.sourceEvidenceHash],
			["bindingHash", binding.bindingHash]
		];
		for (const [label, value] of hashes) if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) errors.push(`sourceCandidateBinding.${label} must be a SHA-256 hash`);
	}
	if (errors.length) throw new FrontdoorRequestRejectedError(errors);
}
function createFrontdoorRequest(input, receivedAt = (/* @__PURE__ */ new Date()).toISOString()) {
	validateFrontdoorRequest(input);
	return {
		...input,
		state: "ready-for-decomposition",
		receivedAt,
		inputHash: hashJson({
			...input,
			receivedAt
		})
	};
}
//#endregion
//#region src/main/frontdoor/frontdoorPrepareService.ts
function isRecord$3(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function normalizeInput(value) {
	if (!isRecord$3(value) || !isRecord$3(value.request) || !isRecord$3(value.plan)) throw new Error("prepare input must contain request and plan objects");
	return {
		request: value.request,
		plan: value.plan
	};
}
function requestBody(request) {
	const { state: _state, receivedAt: _receivedAt, inputHash: _inputHash, ...body } = request;
	return body;
}
function planBody(plan) {
	const { planHash: _planHash, ...body } = plan;
	return {
		...body,
		nodeReviewPolicy: body.nodeReviewPolicy ?? "auto-continue-safe"
	};
}
function assertLocalAdapterPlan(orchestrator, plan) {
	for (const node of plan.nodes) {
		let profile;
		try {
			profile = getAdapterProfile(node.adapterId);
		} catch (error) {
			throw new Error(`plan adapter rejected for ${node.nodeId}: ${error.message}`);
		}
		if (profile.status !== "available") throw new Error(`plan adapter is not available: ${node.adapterId}`);
		if (!profile.roles.includes(node.role)) throw new Error(`plan adapter ${node.adapterId} does not support role ${node.role}`);
		if (profile.dataPolicy !== "local-only") throw new Error(`plan adapter ${node.adapterId} is outside the local-only Intake boundary`);
		if (!node.capabilities.every((capability) => profile.capabilities.includes(capability))) throw new Error(`plan adapter ${node.adapterId} does not support the capabilities for ${node.nodeId}`);
		orchestrator.relay.assertAdapterRegistered(node.adapterId, node.role);
	}
}
async function existingRunForRequest(orchestrator, requestId) {
	let entries;
	try {
		entries = await (0, node_fs_promises.readdir)(node_path.default.join(orchestrator.runtimeRoot, "frontdoor-runs"), { withFileTypes: true });
	} catch (error) {
		if (error.code === "ENOENT") return null;
		throw error;
	}
	for (const entry of entries) {
		if (!entry.isDirectory() || !/^[A-Za-z0-9._:-]{1,240}$/.test(entry.name) || entry.name.includes("..")) continue;
		try {
			const request = await readJson(node_path.default.join(orchestrator.runtimeRoot, "frontdoor-runs", entry.name, "request.json"));
			if (request.requestId !== requestId) continue;
			const plan = await readJson(node_path.default.join(orchestrator.runtimeRoot, "frontdoor-runs", entry.name, "plan.json"));
			return {
				run: await orchestrator.getRun(entry.name),
				request,
				plan
			};
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
	return null;
}
async function prepareFrontdoorRunOrThrow(orchestrator, value, options = {}) {
	const input = normalizeInput(value);
	if (input.request.sourceCandidateBinding) {
		if (!options.trustedSourceCandidateBinding || hashJson(input.request.sourceCandidateBinding) !== hashJson(options.trustedSourceCandidateBinding)) throw new Error("sourceCandidateBinding must be created by the accepted Candidate Request flow");
	}
	const request = createFrontdoorRequest(input.request);
	const plan = createDecompositionPlan(request, input.plan);
	assertLocalAdapterPlan(orchestrator, input.plan);
	const existing = await existingRunForRequest(orchestrator, request.requestId);
	if (existing) {
		if (hashJson(requestBody(existing.request)) !== hashJson(input.request)) throw new Error(`requestId already exists with different Request content: ${request.requestId}`);
		if (hashJson(planBody(existing.plan)) !== hashJson(planBody(plan))) throw new Error(`requestId already exists with different Plan content: ${request.requestId}`);
		return {
			run: existing.run,
			reused: true
		};
	}
	return {
		run: await orchestrator.createRun(input.request, input.plan),
		reused: false
	};
}
//#endregion
//#region src/main/frontdoor/eventLedger.ts
var frontdoorGenesisHash = "frontdoor-ledger-genesis-v1";
/**
* The persisted run is a rebuildable projection. Keep this semantic projection
* stable so replay comparisons do not depend on cache timestamps or manifests.
*/
function frontdoorRunProjection(run) {
	return {
		runId: run.runId,
		requestId: run.requestId,
		requestHash: run.requestHash,
		planHash: run.planHash,
		state: run.state,
		ownerGate: run.ownerGate,
		nodes: run.nodes,
		approvalIds: run.approvalIds,
		openQuestionIds: run.openQuestionIds,
		aggregateResultRef: run.aggregateResultRef,
		nodeReview: run.nodeReview,
		runKind: run.runKind,
		implementationBinding: run.implementationBinding,
		sourceCandidateBinding: run.sourceCandidateBinding
	};
}
function frontdoorEventsPath(runtimeRoot, runId) {
	return node_path.default.join(runtimeRoot, "frontdoor-runs", runId, "events.jsonl");
}
function eventHash(event) {
	return hashJson(event);
}
function hasDecision$2(decisions, gate, values) {
	return [...decisions.values()].some((decision) => decision.gate === gate && values.includes(decision.decision));
}
function advanceOwnerGate(run, decisions) {
	if ([
		"complete",
		"partial",
		"failed",
		"cancelled"
	].includes(run.state) || run.ownerGate === "completed" || run.ownerGate === "stopped") return run;
	if (!hasDecision$2(decisions, "intake", ["proceed"])) return run;
	if (!hasDecision$2(decisions, "completion-shape", ["approve"])) return {
		...run,
		ownerGate: "awaiting-owner:completion-shape"
	};
	if (!hasDecision$2(decisions, "decomposition", ["approve-selected"])) return {
		...run,
		ownerGate: "awaiting-owner:decomposition"
	};
	return {
		...run,
		ownerGate: "awaiting-owner:dispatch"
	};
}
async function readFrontdoorEvents(runtimeRoot, runId) {
	try {
		return (await (0, node_fs_promises.readFile)(frontdoorEventsPath(runtimeRoot, runId), "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line));
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw error;
	}
}
function validateFrontdoorEventChain(events, expectedRunId) {
	let previous = frontdoorGenesisHash;
	events.forEach((event, index) => {
		if (event.schemaVersion !== 1) throw new Error(`unsupported Frontdoor event schema at sequence ${event.sequence}`);
		if (event.sequence !== index) throw new Error(`Frontdoor event sequence gap at ${event.sequence}`);
		if (!event.eventId || !event.type || !event.occurredAt || !event.payload || typeof event.payload !== "object") throw new Error(`Frontdoor event envelope is incomplete at sequence ${event.sequence}`);
		if (index === 0 && event.type !== "frontdoor.run-created") throw new Error("Frontdoor Ledger must begin with run-created");
		if (index > 0 && event.type === "frontdoor.run-created") throw new Error("Frontdoor Ledger contains a duplicate run-created event");
		if (expectedRunId && event.runId !== expectedRunId) throw new Error(`Frontdoor event runId mismatch at ${event.sequence}`);
		if (event.previousEventHash !== previous) throw new Error(`Frontdoor event previous hash mismatch at ${event.sequence}`);
		const { eventHash: storedHash, ...withoutHash } = event;
		if (eventHash(withoutHash) !== storedHash) throw new Error(`Frontdoor event hash mismatch at ${event.sequence}`);
		previous = storedHash;
	});
}
async function appendFrontdoorEvent(runtimeRoot, runId, type, payload, occurredAt = (/* @__PURE__ */ new Date()).toISOString()) {
	const events = await readFrontdoorEvents(runtimeRoot, runId);
	validateFrontdoorEventChain(events, runId);
	const previousEventHash = events.at(-1)?.eventHash ?? "frontdoor-ledger-genesis-v1";
	const sequence = events.length;
	const base = {
		schemaVersion: 1,
		sequence,
		eventId: `frontdoor-event-${hashJson([
			runId,
			sequence,
			type,
			payload,
			occurredAt
		]).slice(0, 20)}`,
		runId,
		occurredAt,
		previousEventHash,
		type,
		payload
	};
	const event = {
		...base,
		eventHash: eventHash(base)
	};
	await ensureDir(node_path.default.dirname(frontdoorEventsPath(runtimeRoot, runId)));
	await (0, node_fs_promises.writeFile)(frontdoorEventsPath(runtimeRoot, runId), `${JSON.stringify(event)}\n`, {
		encoding: "utf8",
		flag: "a"
	});
	return event;
}
function replayFrontdoorRun(events) {
	validateFrontdoorEventChain(events);
	const created = events.find((event) => event.type === "frontdoor.run-created");
	const initial = created?.payload.snapshot;
	if (!initial || typeof initial !== "object") throw new Error("Frontdoor Ledger has no run-created snapshot");
	let run = structuredClone(initial);
	const decisions = /* @__PURE__ */ new Map();
	for (const event of events.slice((created?.sequence ?? 0) + 1)) {
		const payload = event.payload;
		const nodeId = typeof payload.nodeId === "string" ? payload.nodeId : void 0;
		const currentNode = nodeId ? run.nodes.find((node) => node.node.nodeId === nodeId) : void 0;
		if (event.type === "frontdoor.approval-bound" && run.state !== "ready-for-approval") throw new Error("Frontdoor approval-bound event has an invalid prior state");
		if (event.type === "frontdoor.completion-proposed") {
			const unfinishedNodes = run.nodes.some((node) => [
				"queued",
				"ready",
				"running",
				"recovery-needed"
			].includes(node.state));
			const completionProposalCanFollowExecution = run.state === "running" && !unfinishedNodes;
			if (!["awaiting-owner", "blocked-by-question"].includes(run.state) && !completionProposalCanFollowExecution) throw new Error("Frontdoor completion-proposed event has an invalid prior state");
		}
		if (event.type === "frontdoor.completion-approved" && run.state !== "awaiting-owner") throw new Error("Frontdoor completion-approved event has an invalid prior state");
		if (event.type === "frontdoor.node-review-opened" && (!currentNode || ![
			"completed",
			"failed",
			"awaiting-question"
		].includes(currentNode.state) || !payload.nodeReview || typeof payload.nodeReview !== "object")) throw new Error("Frontdoor node-review-opened event has an invalid prior state");
		if (event.type === "frontdoor.owner-decision-recorded") {
			const decision = payload.decision;
			if (!decision || decision.runId !== event.runId || !decision.requestId || !decision.decisionId || !decision.approvedBy || !/^[a-f0-9]{64}$/.test(decision.targetHash)) throw new Error("Frontdoor Owner Decision envelope is invalid");
			if (decisions.has(decision.decisionId)) throw new Error("Frontdoor Owner Decision is duplicated");
			decisions.set(decision.decisionId, decision);
			run = advanceOwnerGate(run, decisions);
		}
		if (event.type === "frontdoor.candidate-request-created") {
			const binding = run.sourceCandidateBinding;
			if (!binding || payload.requestId !== run.requestId || payload.requestHash !== run.requestHash || payload.sourceCandidateBindingHash !== binding.bindingHash || payload.candidateId !== binding.candidateId || payload.candidateHash !== binding.candidateHash || payload.artifactRef !== binding.artifactRef || payload.reviewDecisionId !== binding.reviewDecisionId || payload.reviewTargetHash !== binding.reviewTargetHash || payload.sourceRunId !== binding.childRunId || payload.parentRunId !== binding.parentRunId) throw new Error("Candidate Request creation Event is not bound to the persisted Request source Candidate");
		}
		if (event.type === "frontdoor.node-approved") {
			const decisionId = typeof payload.decisionId === "string" ? payload.decisionId : "";
			const decision = decisions.get(decisionId);
			if (!decision || decision.gate !== "dispatch" || decision.targetHash !== payload.targetHash || typeof payload.nodeId !== "string" || typeof payload.nodeTargetHash !== "string") throw new Error("Frontdoor Node approval is not bound to a valid dispatch Decision");
		}
		if (event.type === "frontdoor.question-answered" || event.type === "frontdoor.result-reviewed" || event.type === "frontdoor.completion-approved" || event.type === "frontdoor.node-review-continued") {
			const decision = event.type === "frontdoor.result-reviewed" || event.type === "frontdoor.completion-approved" ? payload.decision : decisions.get(String(payload.decisionId));
			const expectedGate = event.type === "frontdoor.question-answered" ? "question" : event.type === "frontdoor.result-reviewed" ? "result-review" : event.type === "frontdoor.node-review-continued" ? "node-review" : "completion";
			if (!decision || decision.runId !== event.runId || decision.gate !== expectedGate || !decisions.has(decision.decisionId)) throw new Error(`Frontdoor ${event.type} is not bound to an Owner Decision`);
		}
		if (event.type === "frontdoor.approval-bound" && payload.decisionId !== void 0) {
			const decision = decisions.get(String(payload.decisionId));
			if (!decision || decision.gate !== "dispatch" || !["dispatch", "approve-selected"].includes(decision.decision) || decision.targetHash !== payload.targetHash) throw new Error("Frontdoor approval-bound event is not bound to the current Dispatch Decision");
		}
		if (event.type === "frontdoor.node-started" && (run.state !== "running" || !currentNode || ![
			"queued",
			"ready",
			"recovery-needed"
		].includes(currentNode.state))) throw new Error("Frontdoor node-started event has an invalid prior state");
		if (event.type === "frontdoor.node-completed" && nodeId && nodeId !== "dependency-resolution" && (!currentNode || currentNode.state !== "running")) throw new Error("Frontdoor node completion event has an invalid prior state");
		if (event.type === "frontdoor.node-failed" && nodeId && nodeId !== "dependency-resolution" && (!currentNode || ![
			"queued",
			"ready",
			"running",
			"recovery-needed"
		].includes(currentNode.state))) throw new Error("Frontdoor node failure event has an invalid prior state");
		if (event.type === "frontdoor.run-recovery-needed" && !["running", "awaiting-owner"].includes(run.state)) throw new Error("Frontdoor recovery event has an invalid prior state");
		if (event.type === "frontdoor.run-completed" && [
			"ready-for-approval",
			"complete",
			"partial",
			"failed",
			"cancelled"
		].includes(run.state)) throw new Error("Frontdoor completion event has an invalid prior state");
		const nodeRecords = Array.isArray(payload.nodeRecords) ? payload.nodeRecords : payload.nodeRecord ? [payload.nodeRecord] : [];
		for (const record of nodeRecords) if (record && typeof record === "object" && "node" in record && typeof record.node === "object") {
			const recordNodeId = record.node.nodeId;
			if (typeof recordNodeId === "string") run = updateNode(run, recordNodeId, () => structuredClone(record));
		}
		if (event.type === "frontdoor.approval-bound") run = {
			...run,
			state: "running",
			ownerGate: "running",
			approvalIds: Array.isArray(payload.approvalIds) ? payload.approvalIds : run.approvalIds
		};
		if (event.type === "frontdoor.owner-gate-opened" && typeof payload.gate === "string") run = {
			...run,
			ownerGate: `awaiting-owner:${payload.gate}`
		};
		if (event.type === "frontdoor.node-started" && nodeId) run = updateNode(run, nodeId, (node) => ({
			...node,
			state: "running",
			attempt: typeof payload.attempt === "number" ? payload.attempt : node.attempt + 1
		}));
		if (event.type === "frontdoor.node-review-opened") run = {
			...run,
			state: "awaiting-owner",
			ownerGate: "awaiting-owner:node-review",
			nodeReview: structuredClone(payload.nodeReview)
		};
		if (event.type === "frontdoor.node-review-continued") run = {
			...run,
			state: "ready-for-approval",
			ownerGate: "awaiting-owner:dispatch",
			approvalIds: [],
			nodeReview: void 0
		};
		if (event.type === "frontdoor.question-answered") run = {
			...run,
			state: "ready-for-approval",
			ownerGate: "awaiting-owner:dispatch",
			approvalIds: [],
			aggregateResultRef: void 0,
			openQuestionIds: run.openQuestionIds.filter((id) => id !== payload.questionId)
		};
		if (event.type === "frontdoor.run-recovery-needed") run = {
			...run,
			state: "awaiting-owner",
			ownerGate: "awaiting-owner:dispatch"
		};
		if (event.type === "frontdoor.question-opened") run = {
			...run,
			state: "blocked-by-question",
			ownerGate: "awaiting-owner:question",
			aggregateResultRef: typeof payload.aggregateRef === "string" ? payload.aggregateRef : run.aggregateResultRef,
			openQuestionIds: Array.isArray(payload.questionIds) ? payload.questionIds : run.openQuestionIds
		};
		if (event.type === "frontdoor.completion-proposed") run = {
			...run,
			state: "awaiting-owner",
			ownerGate: "awaiting-owner:result-review",
			aggregateResultRef: typeof payload.aggregateRef === "string" ? payload.aggregateRef : run.aggregateResultRef
		};
		if (event.type === "frontdoor.result-reviewed" && payload.decision?.decision === "accept") run = {
			...run,
			ownerGate: "awaiting-owner:completion"
		};
		if (event.type === "frontdoor.run-stopped") run = {
			...run,
			state: "cancelled",
			ownerGate: "stopped",
			nodeReview: void 0
		};
		if (event.type === "frontdoor.run-completed") run = {
			...run,
			state: payload.status,
			ownerGate: payload.status === "complete" ? "completed" : run.ownerGate,
			aggregateResultRef: typeof payload.aggregateRef === "string" ? payload.aggregateRef : run.aggregateResultRef,
			openQuestionIds: Array.isArray(payload.openQuestionIds) ? payload.openQuestionIds : run.openQuestionIds
		};
		if (typeof payload.runState === "string") run = {
			...run,
			state: payload.runState
		};
	}
	return run;
}
function updateNode(run, nodeId, update) {
	return {
		...run,
		nodes: run.nodes.map((node) => node.node.nodeId === nodeId ? update(node) : node)
	};
}
//#endregion
//#region src/main/frontdoor/ledger.ts
function runDirectory(runtimeRoot, runId) {
	return node_path.default.join(runtimeRoot, "frontdoor-runs", runId);
}
async function writeRunBundleExclusive(runtimeRoot, request, plan, run) {
	await assertRuntimeRootSafe(runtimeRoot);
	const directory = runDirectory(runtimeRoot, run.runId);
	await ensureDir(node_path.default.dirname(directory));
	const stagingDirectory = `${directory}.staging-${process.pid}-${Date.now()}`;
	await (0, node_fs_promises.mkdir)(stagingDirectory);
	try {
		await writeJsonExclusive(node_path.default.join(stagingDirectory, "request.json"), request);
		await writeJsonExclusive(node_path.default.join(stagingDirectory, "plan.json"), plan);
		await writeJsonExclusive(node_path.default.join(stagingDirectory, "run.json"), run);
		await writeJsonExclusive(node_path.default.join(stagingDirectory, "bundle.manifest.json"), {
			requestHash: hashJson(request),
			planHash: hashJson(plan),
			runHash: hashJson(run)
		});
		await writeJsonExclusive(node_path.default.join(stagingDirectory, "bundle.ready"), { bundleHash: hashJson({
			request,
			plan,
			run
		}) });
		await (0, node_fs_promises.rename)(stagingDirectory, directory);
	} catch (error) {
		await (0, node_fs_promises.rm)(stagingDirectory, {
			recursive: true,
			force: true
		});
		throw error;
	}
}
async function writeRun(runtimeRoot, run) {
	await assertRuntimeRootSafe(runtimeRoot);
	const directory = runDirectory(runtimeRoot, run.runId);
	const request = await readJson(node_path.default.join(directory, "request.json"));
	const plan = await readJson(node_path.default.join(directory, "plan.json"));
	await writeJsonAtomic(node_path.default.join(directory, "run.json"), run);
	await writeJsonAtomic(node_path.default.join(directory, "bundle.manifest.json"), {
		requestHash: hashJson(request),
		planHash: hashJson(plan),
		runHash: hashJson(run)
	});
	await writeJsonAtomic(node_path.default.join(directory, "bundle.ready"), { bundleHash: hashJson({
		request,
		plan,
		run
	}) });
}
async function writeAggregate(runtimeRoot, runId, aggregate) {
	await assertRuntimeRootSafe(runtimeRoot);
	const ref = `frontdoor-runs/${runId}/aggregate.json`;
	await writeJsonAtomic(node_path.default.join(runtimeRoot, ref), aggregate);
	return ref;
}
async function readRun(runtimeRoot, runId) {
	return readJson(node_path.default.join(runDirectory(runtimeRoot, runId), "run.json"));
}
function projectionWithoutOwnerGate(run) {
	const { ownerGate: _ownerGate, ...withoutOwnerGate } = frontdoorRunProjection(run);
	return withoutOwnerGate;
}
/**
* Read the Ledger-derived Run projection and repair only the known rebuildable
* Owner Gate cache drift. Any node/result/state divergence remains fail-closed.
*/
async function readProjectedRun(runtimeRoot, runId, options = {}) {
	const persisted = await readRun(runtimeRoot, runId);
	const projected = replayFrontdoorRun(await readRunEvents(runtimeRoot, runId));
	if (hashJson(frontdoorRunProjection(persisted)) === hashJson(frontdoorRunProjection(projected))) return projected;
	if (hashJson(projectionWithoutOwnerGate(persisted)) !== hashJson(projectionWithoutOwnerGate(projected))) throw new Error("Frontdoor event replay/projection integrity diverges beyond Owner Gate; stale or tampered Run projection rejected");
	if (options.repair !== false) await writeRun(runtimeRoot, projected);
	return projected;
}
async function readRequest(runtimeRoot, runId) {
	return readJson(node_path.default.join(runDirectory(runtimeRoot, runId), "request.json"));
}
async function readPlan(runtimeRoot, runId) {
	return readJson(node_path.default.join(runDirectory(runtimeRoot, runId), "plan.json"));
}
async function readRunEvents(runtimeRoot, runId) {
	const events = await readFrontdoorEvents(runtimeRoot, runId);
	validateFrontdoorEventChain(events, runId);
	return events;
}
async function assertBundleReady(runtimeRoot, runId) {
	const directory = runDirectory(runtimeRoot, runId);
	const ready = await readJson(node_path.default.join(directory, "bundle.ready"));
	const request = await readJson(node_path.default.join(directory, "request.json"));
	const plan = await readJson(node_path.default.join(directory, "plan.json"));
	const run = await readJson(node_path.default.join(directory, "run.json"));
	const manifest = await readJson(node_path.default.join(directory, "bundle.manifest.json"));
	if (manifest.requestHash !== hashJson(request) || manifest.planHash !== hashJson(plan) || manifest.runHash !== hashJson(run)) throw new Error("Frontdoor bundle manifest does not match its files");
	if (ready.bundleHash !== hashJson({
		request,
		plan,
		run
	})) throw new Error("Frontdoor bundle ready marker does not match its files");
}
async function replayRunFromEvents(runtimeRoot, runId) {
	return replayFrontdoorRun(await readRunEvents(runtimeRoot, runId));
}
async function readRunClaim(runtimeRoot, runId) {
	try {
		return await readJson(node_path.default.join(runDirectory(runtimeRoot, runId), "run.claim.json"));
	} catch (error) {
		if (error.code === "ENOENT") return null;
		throw error;
	}
}
async function claimRun(runtimeRoot, runId, owner) {
	await assertRuntimeRootSafe(runtimeRoot);
	const claim = {
		runId,
		owner,
		token: `claim-${hashJson([
			runId,
			owner,
			process.pid,
			Date.now()
		])}`,
		pid: process.pid,
		hostname: process.env.HOSTNAME ?? "unknown",
		claimedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
	await writeJsonExclusive(node_path.default.join(runDirectory(runtimeRoot, runId), "run.claim.json"), claim);
	return claim;
}
async function releaseRun(runtimeRoot, runId, token) {
	const claim = await readRunClaim(runtimeRoot, runId);
	if (!claim || token && claim.token !== token) return;
	await removeFile(node_path.default.join(runDirectory(runtimeRoot, runId), "run.claim.json"));
}
async function recordRunEvent(runtimeRoot, runId, type, details, occurredAt) {
	await assertRuntimeRootSafe(runtimeRoot);
	return appendFrontdoorEvent(runtimeRoot, runId, type, details, occurredAt);
}
//#endregion
//#region src/main/frontdoor/implementationBinding.ts
async function assertImplementationSourceArtifacts(runtimeRoot, binding) {
	const result = await readJson(await safeRuntimePath(runtimeRoot, binding.sourceResultRef));
	if (hashJson(result) !== binding.sourceResultHash || result.taskId !== binding.sourceTaskId || result.jobId !== binding.sourceJobId || result.orchestrationRunId !== binding.parentRunId) throw new Error("Implementation source Result binding changed");
	const evidence = await readJson(await safeRuntimePath(runtimeRoot, binding.sourceEvidenceRef));
	if (hashJson(evidence) !== binding.sourceEvidenceHash || evidence.threadId !== binding.sourceThreadId || evidence.taskId !== binding.sourceTaskId || evidence.jobId !== binding.sourceJobId || !evidence.turns?.some((turn) => turn.resultEnvelopeRef === binding.sourceResultRef)) throw new Error("Implementation source Evidence binding changed");
	const thread = await readJson(await safeRuntimePath(runtimeRoot, `threads/${binding.sourceThreadId}/thread.json`));
	if (thread.threadId !== binding.sourceThreadId || thread.taskId !== binding.sourceTaskId || thread.jobId !== binding.sourceJobId || !thread.turns?.some((turn) => turn.resultEnvelopeRef === binding.sourceResultRef && turn.resultEnvelopeHash === binding.sourceResultHash && turn.orchestrationRunId === binding.parentRunId)) throw new Error("Implementation source Thread binding changed");
	const job = await readJson(await safeRuntimePath(runtimeRoot, `jobs/${binding.sourceJobId}/request.json`));
	if (job.jobId !== binding.sourceJobId || job.task.taskId !== binding.sourceTaskId || job.inputHash !== hashJson(job.task) || job.task.frontdoorBinding?.runId !== binding.parentRunId || job.task.frontdoorBinding?.requestHash !== binding.parentRequestHash || job.task.frontdoorBinding?.planHash !== binding.parentPlanHash || job.task.frontdoorBinding?.nodeId !== binding.sourceNodeId || hashJson(job.task.implementationBinding ?? null) !== hashJson(null)) throw new Error("Implementation source Job binding changed");
}
//#endregion
//#region src/main/frontdoor/runIntegrity.ts
function childTaskId$1(requestId, nodeId) {
	return `${requestId}::${nodeId}`;
}
function requestHash(request) {
	const { state: _state, inputHash: _inputHash, ...body } = request;
	return hashJson(body);
}
function planHash(plan) {
	const { planHash: _planHash, ...body } = plan;
	return hashJson(body);
}
async function assertRunIntegrity(runtimeRoot, run, request, plan, verifyBundle = true) {
	await assertRuntimeRootSafe(runtimeRoot);
	if (verifyBundle) await assertBundleReady(runtimeRoot, run.runId);
	if (requestHash(request) !== run.requestHash || request.inputHash !== run.requestHash) throw new Error("Frontdoor request hash integrity check failed");
	if (planHash(plan) !== run.planHash || plan.planHash !== run.planHash) throw new Error("Frontdoor plan hash integrity check failed");
	const expectedRunId = `run-${hashJson([
		request.requestId,
		request.inputHash,
		plan.planHash
	]).slice(0, 20)}`;
	if (run.runId !== expectedRunId) throw new Error("Frontdoor run binding hash integrity check failed");
	if (run.requestId !== request.requestId) throw new Error("Frontdoor run request binding mismatch");
	if (run.runKind !== request.runKind || hashJson(run.implementationBinding ?? null) !== hashJson(request.implementationBinding ?? null)) throw new Error("Frontdoor implementation binding mismatch");
	if (!Array.isArray(run.nodes) || run.nodes.some((record) => record.childTaskId !== childTaskId$1(request.requestId, record.node.nodeId) || !Number.isInteger(record.attempt) || record.attempt < 0)) throw new Error("Frontdoor node record binding is invalid");
	const isNodeReviewContinuation = run.state === "ready-for-approval" && run.ownerGate === "awaiting-owner:dispatch" && run.nodes.some((record) => record.state === "completed" || record.state === "failed" || record.state === "awaiting-question");
	if (run.state === "ready-for-approval" && (!isNodeReviewContinuation && run.nodes.some((record) => record.state !== "queued" || record.resultRef || record.threadId || record.childJobId) || run.approvalIds.length > 0 || run.aggregateResultRef || run.nodeReview)) throw new Error("Frontdoor ready state is inconsistent with node records");
	if ([
		"complete",
		"partial",
		"failed",
		"cancelled"
	].includes(run.state) && run.nodes.some((record) => record.state === "queued" || record.state === "running")) throw new Error("Frontdoor terminal state has unfinished nodes");
	validateDecompositionPlan(request, plan);
	if (run.nodes.length !== plan.nodes.length || run.nodes.some((record) => {
		const expected = plan.nodes.find((node) => node.nodeId === record.node.nodeId);
		return !expected || hashJson(record.node) !== hashJson(expected);
	})) throw new Error("Frontdoor run node plan does not match the persisted plan");
}
function assertRunEventConsistency(run, events) {
	if (events.length === 0) throw new Error("Frontdoor run has no ledger events");
	if (hashJson(frontdoorRunProjection(replayFrontdoorRun(events))) !== hashJson(frontdoorRunProjection(run))) throw new Error("Frontdoor event replay does not match run.json");
	const lastResume = Math.max(-1, ...events.filter((event) => event.type === "frontdoor.question-answered" || event.type === "frontdoor.node-review-continued").map((event) => event.sequence));
	const progressed = events.some((event) => event.sequence > lastResume && [
		"frontdoor.approval-bound",
		"frontdoor.node-started",
		"frontdoor.node-completed",
		"frontdoor.node-failed",
		"frontdoor.run-completed",
		"frontdoor.run-stopped"
	].includes(event.type));
	if (run.state === "ready-for-approval" && progressed) throw new Error("Frontdoor ready state conflicts with persisted execution events");
	if ([
		"complete",
		"partial",
		"failed",
		"blocked-by-question",
		"cancelled"
	].includes(run.state) && !events.some((event) => event.type === "frontdoor.run-completed" || event.type === "frontdoor.run-stopped")) throw new Error("Frontdoor terminal state has no terminal ledger event");
}
function isRecord$2(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function candidatePath(value) {
	if (typeof value !== "string" || value.length === 0 || value.includes("\0") || node_path.default.isAbsolute(value)) return false;
	const normalized = node_path.default.posix.normalize(value.replaceAll("\\", "/"));
	return normalized === value.replaceAll("\\", "/") && normalized !== "." && !normalized.split("/").includes("..");
}
/**
* The pattern set moved to `secretSentinel.ts`. It is a superset of the one that lived here, so
* everything this rejected before is still rejected.
*/
function containsSecretSentinel(content) {
	return containsSecret(content);
}
function candidateHash(candidate) {
	return hashJson({
		kind: candidate.kind,
		baseSnapshotHash: candidate.baseSnapshotHash,
		files: candidate.files
	});
}
function validateImplementationCandidate(value, allowedFiles) {
	if (!isRecord$2(value) || value.kind !== "candidate-file-set" || typeof value.baseSnapshotHash !== "string" || !Array.isArray(value.files) || typeof value.candidateHash !== "string") throw new Error("implementation candidate schema is invalid");
	if (value.files.length === 0 || value.files.length > 8) throw new Error("implementation candidate file count exceeds the approved limit");
	const allowed = new Set(allowedFiles);
	const files = [];
	let totalBytes = 0;
	for (const entry of value.files) {
		if (!isRecord$2(entry) || !candidatePath(entry.relativePath) || typeof entry.content !== "string" || typeof entry.contentHash !== "string") throw new Error("implementation candidate file shape is invalid");
		if (!allowed.has(entry.relativePath)) throw new Error(`implementation candidate file is outside the approved file set: ${entry.relativePath}`);
		if (containsSecretSentinel(entry.content)) throw new Error(`implementation candidate contains a secret sentinel: ${entry.relativePath}`);
		const bytes = Buffer.byteLength(entry.content, "utf8");
		if (bytes > 16384) throw new Error(`implementation candidate file exceeds the size limit: ${entry.relativePath}`);
		if (files.some((file) => file.relativePath === entry.relativePath)) throw new Error(`implementation candidate contains a duplicate path: ${entry.relativePath}`);
		if (hashJson(entry.content) !== entry.contentHash) throw new Error(`implementation candidate content hash mismatch: ${entry.relativePath}`);
		totalBytes += bytes;
		files.push({
			relativePath: entry.relativePath,
			content: entry.content,
			contentHash: entry.contentHash
		});
	}
	if (totalBytes > 65536) throw new Error("implementation candidate exceeds the total size limit");
	const candidate = {
		kind: "candidate-file-set",
		baseSnapshotHash: value.baseSnapshotHash,
		files,
		candidateHash: value.candidateHash
	};
	if (candidateHash(candidate) !== candidate.candidateHash) throw new Error("implementation candidate hash mismatch");
	return candidate;
}
//#endregion
//#region src/main/frontdoor/workPlaneArtifact.ts
function isRecord$1(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function latestWorkPlaneArtifactManifest(events) {
	const event = [...events].reverse().find((candidate) => candidate.type === "frontdoor.owner-decision-recorded" && isRecord$1(candidate.payload.artifact));
	return event && isRecord$1(event.payload.artifact) ? event.payload.artifact : void 0;
}
async function readVerifiedWorkPlaneArtifact(runtimeRoot, requestedRunId, manifest) {
	if (manifest.runId !== requestedRunId) throw new Error("Work Plane artifact belongs to another Run");
	const expectedPath = `frontdoor-runs/${manifest.runId}/work-plane/${manifest.artifactId}.json`;
	if (manifest.relativePath !== expectedPath) throw new Error("Work Plane artifact path is not bound to its Run and artifactId");
	const stored = await readJson(await safeRuntimePath(runtimeRoot, manifest.relativePath));
	if (!stored.manifest || hashJson(stored.manifest) !== hashJson(manifest)) throw new Error("Work Plane artifact manifest mismatch");
	if (hashJson(stored.content) !== manifest.contentHash) throw new Error("Work Plane artifact content hash mismatch");
	return {
		manifest,
		content: stored.content
	};
}
//#endregion
//#region src/main/frontdoor/ownerGates.ts
var decisionByGate = {
	intake: [
		"clarify",
		"edit",
		"reject",
		"proceed",
		"stop"
	],
	"completion-shape": [
		"edit",
		"approve",
		"reject",
		"stop"
	],
	decomposition: [
		"edit",
		"approve-selected",
		"reject",
		"stop"
	],
	dispatch: [
		"dispatch",
		"approve-selected",
		"defer",
		"stop"
	],
	"node-review": ["continue", "stop"],
	question: [
		"answer",
		"revise-plan",
		"stop"
	],
	"result-review": [
		"accept",
		"follow-up",
		"reject",
		"stop"
	],
	completion: [
		"approve",
		"continue",
		"stop",
		"complete"
	],
	"artifact-export": ["export", "stop"],
	"candidate-review": [
		"accept",
		"reject",
		"follow-up",
		"stop"
	]
};
function canApprove(input) {
	return input.approvedBy.trim().length > 0 && input.targetHash.length > 0 && input.targetHash === input.expectedTargetHash && decisionByGate[input.gate].includes(input.decision);
}
function sortedPacketHashes(packetHashes) {
	return Object.fromEntries(Object.entries(packetHashes).sort(([left], [right]) => left.localeCompare(right)));
}
function boundedArtifactText(value, limit) {
	return typeof value === "string" ? maskSecrets(value.slice(0, limit)) : void 0;
}
function dispatchTargetHash(run, nodeIds, packetHashes) {
	return hashJson({
		runId: run.runId,
		requestId: run.requestId,
		planHash: run.planHash,
		nodeIds: [...nodeIds].sort(),
		executionContext: (run.nodes ?? []).filter((record) => nodeIds.includes(record.node.nodeId)).map((record) => ({
			nodeId: record.node.nodeId,
			state: record.state,
			resultHash: record.resultHash ?? null,
			childInputHash: record.childInputHash ?? null
		})).sort((left, right) => left.nodeId.localeCompare(right.nodeId)),
		...packetHashes ? { packetHashes: sortedPacketHashes(packetHashes) } : {}
	});
}
function nodeTargetHash(run, record) {
	return hashJson({
		runId: run.runId,
		requestId: run.requestId,
		planHash: run.planHash,
		nodeId: record.node.nodeId,
		nodeHash: hashJson(record.node)
	});
}
function completionShapeTargetHash(run, requestedOutput) {
	return hashJson({
		runId: run.runId,
		requestId: run.requestId,
		requestHash: run.requestHash,
		requestedOutput
	});
}
function resultReviewTargetHash(runId, aggregateRef, aggregate) {
	return hashJson({
		runId,
		aggregateRef,
		aggregateHash: hashJson(aggregate)
	});
}
function artifactExportTargetHash(runId, aggregateRef, aggregateHash, nodes) {
	return hashJson({
		runId,
		aggregateRef,
		aggregateHash,
		nodes: nodes.map((record) => ({
			nodeId: record.node.nodeId,
			childTaskId: record.childTaskId,
			childJobId: record.childJobId,
			threadId: record.threadId,
			resultRef: record.resultRef,
			resultHash: record.resultHash,
			childInputHash: record.childInputHash
		})).sort((left, right) => left.nodeId.localeCompare(right.nodeId))
	});
}
function nodeReviewTargetHash(run, nodeId, resultHash, nextNodeIds) {
	return hashJson({
		runId: run.runId,
		requestId: run.requestId,
		planHash: run.planHash,
		nodeId,
		resultHash: resultHash ?? null,
		nextNodeIds: [...nextNodeIds].sort()
	});
}
function questionTargetHash(question) {
	return hashJson({
		questionId: question.questionId,
		runId: question.runId,
		nodeId: question.nodeId,
		text: question.text
	});
}
function candidateReviewTargetHash(runId, candidateId, candidateHash, sourceResultHash, parentReviewDecisionId) {
	return hashJson({
		runId,
		candidateId,
		candidateHash,
		sourceResultHash,
		parentReviewDecisionId
	});
}
function canDispatch(run, nodeIds, input, packetHashes) {
	return run.state === "ready-for-approval" && input.gate === "dispatch" && canApprove({
		...input,
		expectedTargetHash: dispatchTargetHash(run, nodeIds, packetHashes)
	});
}
function canAnswer(question, input) {
	return question.status === "open" && input.gate === "question" && Boolean(input.answerRef || input.note?.trim()) && canApprove({
		...input,
		expectedTargetHash: questionTargetHash(question)
	});
}
function canReviewResult(input) {
	return input.gate === "result-review" && [
		"accept",
		"follow-up",
		"reject",
		"stop"
	].includes(input.decision) && canApprove({
		...input,
		expectedTargetHash: input.expectedTargetHash
	});
}
function canComplete(run, input, expectedTargetHash, resultReviewed) {
	return run.state === "awaiting-owner" && resultReviewed && input.gate === "completion" && canApprove({
		...input,
		expectedTargetHash
	});
}
function buildDecisionEnvelope(run, gate, decision, targetHash, approvedBy, now, options = {}) {
	return {
		decisionId: `owner-decision-${hashJson([
			run.runId,
			gate,
			decision,
			targetHash,
			approvedBy,
			now
		]).slice(0, 20)}`,
		runId: run.runId,
		requestId: run.requestId,
		gate,
		decision,
		targetHash,
		approvedBy,
		decidedAt: now,
		...options
	};
}
async function assertDecisionBinding(runtimeRoot, envelope) {
	const run = await readProjectedRun(runtimeRoot, envelope.runId);
	if ((await readRequest(runtimeRoot, envelope.runId)).requestId !== envelope.requestId || run.requestId !== envelope.requestId) throw new Error("Owner Decision request binding mismatch");
	if (!envelope.targetHash || envelope.targetHash.length !== 64) throw new Error("Owner Decision target hash is invalid");
	return run;
}
function assertAggregateBelongsToRun(runId, aggregate) {
	if (aggregate.runId !== runId) throw new Error("Aggregate Result belongs to another Run");
	if (aggregate.openQuestions.some((question) => question.runId !== runId)) throw new Error("Aggregate Question belongs to another Run");
}
async function assertAggregateResultsCurrent(runtimeRoot, runId, run, aggregate) {
	for (const child of aggregate.childResults) {
		const record = run.nodes.find((candidate) => candidate.node.nodeId === child.nodeId);
		if (!record || !record.resultRef || !record.resultHash) throw new Error(`Result Review requires a bound Result: ${child.nodeId}`);
		if (record.resultRef !== child.resultRef || record.resultHash !== child.resultHash) throw new Error(`Result Review Result binding is stale: ${child.nodeId}`);
		const result = await readJson(await safeRuntimePath(runtimeRoot, record.resultRef));
		if (hashJson(result) !== record.resultHash) throw new Error(`Result Review Result hash mismatch: ${child.nodeId}`);
		if (result.orchestrationRunId !== runId || result.taskId !== record.childTaskId || result.jobId !== record.childJobId || result.inputHash !== record.childInputHash) throw new Error(`Result Review Result identity mismatch: ${child.nodeId}`);
		validateResultEnvelope(result, {
			taskId: record.childTaskId,
			jobId: record.childJobId,
			inputHash: record.childInputHash
		});
	}
}
function hasDecision$1(events, gate, decisions, targetHash) {
	return events.some((event) => {
		if (event.type !== "frontdoor.owner-decision-recorded") return false;
		const decision = event.payload.decision;
		return decision?.gate === gate && decisions.includes(decision.decision) && decision.targetHash === targetHash;
	});
}
function latestResultReviewDecision(events, targetHash) {
	for (const event of [...events].reverse()) {
		if (event.type !== "frontdoor.result-reviewed") continue;
		const decision = event.payload.decision;
		if (!decision || decision.gate !== "result-review" || decision.targetHash !== targetHash) continue;
		return events.some((candidate) => {
			if (candidate.type !== "frontdoor.owner-decision-recorded") return false;
			const stored = candidate.payload.decision;
			return stored?.decisionId === decision.decisionId && hashJson(stored) === hashJson(decision);
		}) ? decision : void 0;
	}
}
function assertDecisionNotExpired(decision, now) {
	if (!decision.expiresAt || !Number.isFinite(Date.parse(decision.expiresAt)) || Date.parse(decision.expiresAt) <= Date.parse(now)) throw new Error("Owner Decision is missing or past its expiry");
}
async function assertImplementationParentBindingCurrent(runtimeRoot, binding, now) {
	if ((await readRun(runtimeRoot, binding.parentRunId)).aggregateResultRef !== binding.sourceAggregateRef) throw new Error("Implementation parent Aggregate binding changed");
	const aggregate = await readJson(await safeRuntimePath(runtimeRoot, binding.sourceAggregateRef));
	assertAggregateBelongsToRun(binding.parentRunId, aggregate);
	if (hashJson(aggregate) !== binding.sourceAggregateHash) throw new Error("Implementation parent Aggregate hash changed");
	const decision = latestResultReviewDecision(await readRunEvents(runtimeRoot, binding.parentRunId), binding.parentReviewTargetHash);
	if (!decision || decision.decision !== "accept" || decision.decisionId !== binding.parentReviewDecisionId || decision.targetHash !== binding.parentReviewTargetHash || decision.expiresAt !== binding.parentReviewExpiresAt) throw new Error("Implementation parent Result Review binding changed");
	assertDecisionNotExpired(decision, now);
}
async function readApprovedPacketHashes(runtimeRoot, run, nodeIds) {
	const hashes = {};
	let missing = 0;
	for (const nodeId of nodeIds) {
		const record = run.nodes.find((candidate) => candidate.node.nodeId === nodeId);
		if (!record) throw new Error(`Dispatch references an unknown Node: ${nodeId}`);
		try {
			hashes[nodeId] = hashJson(await readJson(node_path.default.join(runtimeRoot, "approved-tasks", `${record.childTaskId}.json`)));
		} catch (error) {
			if (error.code === "ENOENT") {
				missing += 1;
				continue;
			}
			throw error;
		}
	}
	if (missing === nodeIds.length) return void 0;
	if (missing > 0) throw new Error("Dispatch approval packet set is incomplete");
	return hashes;
}
async function assertDispatchApproved(runtimeRoot, runId, nodeIds, packetHashes, requirePacketBinding = false) {
	const run = await readProjectedRun(runtimeRoot, runId);
	const expectedPacketHashes = packetHashes ?? await readApprovedPacketHashes(runtimeRoot, run, nodeIds);
	const packetBoundTargetHash = dispatchTargetHash(run, nodeIds, expectedPacketHashes);
	const legacyTargetHash = dispatchTargetHash(run, nodeIds);
	const events = await readRunEvents(runtimeRoot, runId);
	const allowedTargetHashes = requirePacketBinding ? [packetBoundTargetHash] : [packetBoundTargetHash, legacyTargetHash];
	const decision = events.find((event) => event.type === "frontdoor.owner-decision-recorded" && event.payload.decision?.gate === "dispatch" && allowedTargetHashes.includes(event.payload.decision?.targetHash ?? "") && ["dispatch", "approve-selected"].includes(String(event.payload.decision.decision)));
	if (!decision) throw new Error(requirePacketBinding ? "Frontdoor local-http dispatch requires a Packet-bound Owner Decision" : "Frontdoor dispatch requires a matching Owner Decision");
	if (run.state !== "ready-for-approval" || run.ownerGate !== "awaiting-owner:dispatch") throw new Error("Frontdoor dispatch requires the current Dispatch Gate");
	const approvedTargetHash = decision.payload.decision.targetHash;
	if (events.some((event) => event.type === "frontdoor.approval-bound" && event.payload.targetHash === approvedTargetHash)) throw new Error("Frontdoor Dispatch Decision has already been consumed");
	const packetBindingEstablished = approvedTargetHash === packetBoundTargetHash;
	const approvedNodes = new Set(events.filter((event) => {
		if (event.type !== "frontdoor.node-approved" || event.payload.targetHash !== approvedTargetHash || typeof event.payload.nodeTargetHash !== "string") return false;
		const record = run.nodes.find((candidate) => candidate.node.nodeId === event.payload.nodeId);
		return Boolean(record && event.payload.nodeTargetHash === nodeTargetHash(run, record) && (!packetBindingEstablished || event.payload.packetHash === expectedPacketHashes?.[String(event.payload.nodeId)]));
	}).map((event) => String(event.payload.nodeId)));
	if (nodeIds.some((nodeId) => !approvedNodes.has(nodeId))) throw new Error("Frontdoor dispatch has an unapproved Node");
	return decision.payload.decision;
}
var FrontdoorOwnerGateService = class {
	runtimeRoot;
	clock;
	constructor({ runtimeRoot, clock = () => /* @__PURE__ */ new Date() }) {
		this.runtimeRoot = runtimeRoot;
		this.clock = clock;
	}
	async recordDecision(runId, gate, decision, targetHash, approvedBy, options = {}) {
		const claim = await claimRun(this.runtimeRoot, runId, `owner-${gate}-${process.pid}`);
		try {
			const run = await readProjectedRun(this.runtimeRoot, runId);
			const events = await readRunEvents(this.runtimeRoot, runId);
			const expectedGate = run.ownerGate?.startsWith("awaiting-owner:") ? run.ownerGate.slice(15) : void 0;
			if (expectedGate !== gate) throw new Error(`Owner Decision gate mismatch: expected ${expectedGate ?? "none"}, received ${gate}`);
			const existing = [...events].reverse().find((event) => {
				if (event.type !== "frontdoor.owner-decision-recorded") return false;
				const stored = event.payload.decision;
				return stored?.gate === gate && stored.decision === decision && stored.targetHash === targetHash;
			});
			if (existing) {
				const stored = existing.payload.decision;
				if (stored.approvedBy !== approvedBy) throw new Error("Owner Decision already exists for this target with another Owner identity");
				return stored;
			}
			const envelope = buildDecisionEnvelope(run, gate, decision, targetHash, approvedBy, this.clock().toISOString(), options);
			if (!canApprove({
				gate,
				decision,
				targetHash,
				expectedTargetHash: targetHash,
				approvedBy
			})) throw new Error(`Owner Decision is invalid for ${gate}`);
			await assertDecisionBinding(this.runtimeRoot, envelope);
			await recordRunEvent(this.runtimeRoot, runId, "frontdoor.owner-decision-recorded", { decision: envelope });
			return envelope;
		} finally {
			await releaseRun(this.runtimeRoot, runId, claim.token);
		}
	}
	async approveIntake(runId, approvedBy = "Project Owner", note) {
		const request = await readRequest(this.runtimeRoot, runId);
		return this.recordDecision(runId, "intake", "proceed", request.inputHash, approvedBy, { note });
	}
	async approveCompletionShape(runId, approvedBy = "Project Owner", note) {
		const run = await readProjectedRun(this.runtimeRoot, runId);
		const request = await readRequest(this.runtimeRoot, runId);
		return this.recordDecision(runId, "completion-shape", "approve", completionShapeTargetHash(run, request.requestedOutput), approvedBy, { note });
	}
	async approveDecomposition(runId, approvedBy = "Project Owner", note) {
		const plan = await readPlan(this.runtimeRoot, runId);
		return this.recordDecision(runId, "decomposition", "approve-selected", plan.planHash, approvedBy, { note });
	}
	async approveDispatch(runId, nodeIds, approvedBy, note) {
		const claim = await claimRun(this.runtimeRoot, runId, `owner-dispatch-${process.pid}`);
		try {
			const run = await readProjectedRun(this.runtimeRoot, runId);
			const plan = await readPlan(this.runtimeRoot, runId);
			if (run.ownerGate !== "awaiting-owner:dispatch") throw new Error("Dispatch approval requires the current Dispatch Gate");
			const expectedNodeIds = plan.nodes.map((node) => node.nodeId).sort();
			const selectedNodeIds = [...new Set(nodeIds)].sort();
			if (selectedNodeIds.join("|") !== expectedNodeIds.join("|")) throw new Error("Dispatch approval must identify the exact Node set");
			const request = await readRequest(this.runtimeRoot, runId);
			const events = await readRunEvents(this.runtimeRoot, runId);
			if (!hasDecision$1(events, "intake", ["proceed"], request.inputHash)) throw new Error("Dispatch requires an approved Intake");
			if (!hasDecision$1(events, "completion-shape", ["approve"], completionShapeTargetHash(run, request.requestedOutput))) throw new Error("Dispatch requires an approved Completion Shape");
			if (!hasDecision$1(events, "decomposition", ["approve-selected"], plan.planHash)) throw new Error("Dispatch requires an approved Decomposition");
			const packetHashes = await readApprovedPacketHashes(this.runtimeRoot, run, selectedNodeIds);
			const targetHash = dispatchTargetHash(run, selectedNodeIds, packetHashes);
			const envelope = buildDecisionEnvelope(run, "dispatch", "dispatch", targetHash, approvedBy, this.clock().toISOString(), { note });
			if (!canDispatch(run, selectedNodeIds, envelope, packetHashes)) throw new Error("Dispatch approval is invalid or stale");
			const existing = (await readRunEvents(this.runtimeRoot, runId)).find((event) => event.type === "frontdoor.owner-decision-recorded" && event.payload.decision?.gate === "dispatch" && event.payload.decision?.targetHash === targetHash);
			if (existing) {
				const stored = existing.payload.decision;
				if (stored.approvedBy !== approvedBy) throw new Error("Dispatch Decision already exists for this target with another Owner identity");
				return stored;
			}
			await assertDecisionBinding(this.runtimeRoot, envelope);
			await recordRunEvent(this.runtimeRoot, runId, "frontdoor.owner-decision-recorded", { decision: envelope });
			for (const nodeId of selectedNodeIds) {
				const record = run.nodes.find((candidate) => candidate.node.nodeId === nodeId);
				if (!record) throw new Error(`Dispatch approval references an unknown Node: ${nodeId}`);
				await recordRunEvent(this.runtimeRoot, runId, "frontdoor.node-approved", {
					nodeId,
					targetHash,
					nodeTargetHash: nodeTargetHash(run, record),
					...packetHashes ? { packetHash: packetHashes[nodeId] } : {},
					decisionId: envelope.decisionId
				});
			}
			return envelope;
		} finally {
			await releaseRun(this.runtimeRoot, runId, claim.token);
		}
	}
	async answerQuestion(runId, question, approvedBy, answerRef, note) {
		const run = await readProjectedRun(this.runtimeRoot, runId);
		if (!run.aggregateResultRef) throw new Error("Question answer requires a persisted aggregate");
		const aggregate = await readJson(node_path.default.join(this.runtimeRoot, run.aggregateResultRef));
		assertAggregateBelongsToRun(runId, aggregate);
		const currentQuestion = aggregate.openQuestions.find((candidate) => candidate.questionId === question.questionId);
		if (!currentQuestion || currentQuestion.status !== "open") throw new Error("Question answer must reference the current open Question");
		const targetHash = questionTargetHash(currentQuestion);
		const envelope = buildDecisionEnvelope(run, "question", "answer", targetHash, approvedBy, this.clock().toISOString(), {
			nodeId: currentQuestion.nodeId,
			answerRef,
			note
		});
		if (!canAnswer(currentQuestion, envelope)) throw new Error("Question answer requires an open question and explicit Owner content");
		await assertDecisionBinding(this.runtimeRoot, envelope);
		await recordRunEvent(this.runtimeRoot, runId, "frontdoor.owner-decision-recorded", { decision: envelope });
		const resumed = {
			...run,
			state: "ready-for-approval",
			ownerGate: "awaiting-owner:dispatch",
			approvalIds: [],
			openQuestionIds: run.openQuestionIds.filter((id) => id !== question.questionId),
			aggregateResultRef: void 0,
			nodes: run.nodes.map((record) => record.state === "awaiting-question" || record.state === "cancelled" && record.error === "blocked by Owner question" ? {
				...record,
				state: "queued",
				childJobId: void 0,
				threadId: void 0,
				resultStatus: void 0,
				resultRef: void 0,
				resultHash: void 0,
				childInputHash: void 0,
				questionIds: [],
				error: void 0
			} : record),
			updatedAt: this.clock().toISOString()
		};
		await writeRun(this.runtimeRoot, resumed);
		await recordRunEvent(this.runtimeRoot, runId, "frontdoor.question-answered", {
			questionId: question.questionId,
			targetHash,
			decisionId: envelope.decisionId,
			answerRef,
			note,
			nodeRecords: resumed.nodes,
			runState: resumed.state
		});
		return envelope;
	}
	async reviewResult(runId, approvedBy, decision = "accept", note) {
		const run = await readProjectedRun(this.runtimeRoot, runId);
		if (!run.aggregateResultRef) throw new Error("Result review requires a proposed aggregate");
		const aggregate = await readJson(node_path.default.join(this.runtimeRoot, run.aggregateResultRef));
		assertAggregateBelongsToRun(runId, aggregate);
		const proposed = (await readRunEvents(this.runtimeRoot, runId)).find((event) => event.type === "frontdoor.completion-proposed" && event.payload.aggregateRef === run.aggregateResultRef);
		if (!proposed || proposed.payload.aggregateHash !== hashJson(aggregate)) throw new Error("Result review aggregate does not match the proposed Evidence");
		if (run.runKind === "implementation" && run.implementationBinding) {
			await assertImplementationParentBindingCurrent(this.runtimeRoot, run.implementationBinding, this.clock().toISOString());
			for (const record of run.nodes) {
				if (!record.resultRef) throw new Error(`Implementation Result Review requires a Result: ${record.node.nodeId}`);
				validateImplementationCandidate((await readJson(await safeRuntimePath(this.runtimeRoot, record.resultRef))).artifact, record.node.scope.inScope);
			}
		}
		await assertAggregateResultsCurrent(this.runtimeRoot, runId, run, aggregate);
		const targetHash = resultReviewTargetHash(runId, run.aggregateResultRef, aggregate);
		const envelope = buildDecisionEnvelope(run, "result-review", decision, targetHash, approvedBy, this.clock().toISOString(), {
			note,
			expiresAt: new Date(this.clock().getTime() + 36e5).toISOString()
		});
		if (!canReviewResult({
			gate: "result-review",
			decision,
			targetHash,
			expectedTargetHash: targetHash,
			approvedBy
		})) throw new Error("Result review decision is invalid");
		await assertDecisionBinding(this.runtimeRoot, envelope);
		await recordRunEvent(this.runtimeRoot, runId, "frontdoor.owner-decision-recorded", { decision: envelope });
		await recordRunEvent(this.runtimeRoot, runId, "frontdoor.result-reviewed", {
			decision: envelope,
			aggregateRef: run.aggregateResultRef,
			aggregateHash: hashJson(aggregate)
		});
		if (decision === "accept") await writeRun(this.runtimeRoot, {
			...run,
			ownerGate: "awaiting-owner:completion",
			updatedAt: this.clock().toISOString()
		});
		return envelope;
	}
	async reviewNode(runId, nodeId, approvedBy, decision = "continue", note) {
		const claim = await claimRun(this.runtimeRoot, runId, `owner-node-review-${process.pid}`);
		try {
			const run = await readProjectedRun(this.runtimeRoot, runId);
			const review = run.nodeReview;
			if (run.state !== "awaiting-owner" || run.ownerGate !== "awaiting-owner:node-review" || !review || review.nodeId !== nodeId) throw new Error("Node review is not the current Owner Gate");
			const targetHash = nodeReviewTargetHash(run, review.nodeId, review.resultHash, review.nextNodeIds);
			if (review.targetHash !== targetHash) throw new Error("Node review target is stale or tampered");
			const envelope = buildDecisionEnvelope(run, "node-review", decision, targetHash, approvedBy, this.clock().toISOString(), {
				nodeId,
				note
			});
			if (decision !== "continue" && decision !== "stop") throw new Error("Node review decision is invalid");
			if (!canApprove({
				gate: "node-review",
				decision,
				targetHash,
				expectedTargetHash: targetHash,
				approvedBy
			})) throw new Error("Node review decision is invalid");
			await assertDecisionBinding(this.runtimeRoot, envelope);
			await recordRunEvent(this.runtimeRoot, runId, "frontdoor.owner-decision-recorded", { decision: envelope });
			if (decision === "stop") {
				const stopped = {
					...run,
					state: "cancelled",
					ownerGate: "stopped",
					nodeReview: void 0,
					nodes: run.nodes.map((node) => [
						"queued",
						"ready",
						"running",
						"recovery-needed",
						"awaiting-question"
					].includes(node.state) ? {
						...node,
						state: "cancelled",
						error: note ?? "Owner stopped after Node review"
					} : node),
					updatedAt: this.clock().toISOString()
				};
				await writeRun(this.runtimeRoot, stopped);
				await recordRunEvent(this.runtimeRoot, runId, "frontdoor.run-stopped", {
					note: note ?? "Owner stopped after Node review",
					nodeRecords: stopped.nodes,
					runState: stopped.state
				});
				return envelope;
			}
			const resumed = {
				...run,
				state: "ready-for-approval",
				ownerGate: "awaiting-owner:dispatch",
				approvalIds: [],
				nodeReview: void 0,
				updatedAt: this.clock().toISOString()
			};
			await writeRun(this.runtimeRoot, resumed);
			await recordRunEvent(this.runtimeRoot, runId, "frontdoor.node-review-continued", {
				nodeId,
				targetHash,
				decisionId: envelope.decisionId,
				nextNodeIds: review.nextNodeIds,
				runState: resumed.state
			});
			return envelope;
		} finally {
			await releaseRun(this.runtimeRoot, runId, claim.token);
		}
	}
	async completeRun(runId, approvedBy, note) {
		const claim = await claimRun(this.runtimeRoot, runId, `owner-completion-${process.pid}`);
		try {
			const run = await readProjectedRun(this.runtimeRoot, runId);
			if (!run.aggregateResultRef) throw new Error("Completion requires a proposed aggregate");
			const aggregate = await readJson(node_path.default.join(this.runtimeRoot, run.aggregateResultRef));
			if (aggregate.openQuestions.length > 0) throw new Error("Completion requires all blocking questions to be resolved");
			const targetHash = resultReviewTargetHash(runId, run.aggregateResultRef, aggregate);
			assertAggregateBelongsToRun(runId, aggregate);
			const reviewDecision = latestResultReviewDecision(await readRunEvents(this.runtimeRoot, runId), targetHash);
			const reviewed = reviewDecision?.decision === "accept";
			if (reviewDecision?.decision === "accept") assertDecisionNotExpired(reviewDecision, this.clock().toISOString());
			const envelope = buildDecisionEnvelope(run, "completion", "complete", targetHash, approvedBy, this.clock().toISOString(), { note });
			if (!canComplete(run, envelope, targetHash, reviewed)) throw new Error("Completion requires an accepted Result review bound to the current aggregate");
			await recordRunEvent(this.runtimeRoot, runId, "frontdoor.owner-decision-recorded", { decision: envelope });
			await recordRunEvent(this.runtimeRoot, runId, "frontdoor.completion-approved", { decision: envelope });
			const completed = {
				...run,
				state: "complete",
				ownerGate: "completed",
				updatedAt: this.clock().toISOString()
			};
			await writeRun(this.runtimeRoot, completed);
			await recordRunEvent(this.runtimeRoot, runId, "frontdoor.run-completed", {
				status: "complete",
				aggregateRef: run.aggregateResultRef,
				openQuestionIds: [],
				runState: "complete"
			});
			return completed;
		} finally {
			await releaseRun(this.runtimeRoot, runId, claim.token);
		}
	}
	async exportWorkPlaneArtifact(runId, approvedBy, note) {
		const claim = await claimRun(this.runtimeRoot, runId, `owner-artifact-export-${process.pid}`);
		try {
			const run = await readProjectedRun(this.runtimeRoot, runId);
			const request = await readRequest(this.runtimeRoot, runId);
			const plan = await readPlan(this.runtimeRoot, runId);
			await assertRunIntegrity(this.runtimeRoot, run, request, plan);
			const events = await readRunEvents(this.runtimeRoot, runId);
			assertRunEventConsistency(run, events);
			if (!["awaiting-owner", "complete"].includes(run.state) || !run.aggregateResultRef) throw new Error("Work Plane export requires an accepted Result Review before or after completion");
			const aggregate = await readJson(node_path.default.join(this.runtimeRoot, run.aggregateResultRef));
			assertAggregateBelongsToRun(runId, aggregate);
			const proposed = events.find((event) => event.type === "frontdoor.completion-proposed" && event.payload.aggregateRef === run.aggregateResultRef);
			if (!proposed || proposed.payload.aggregateHash !== hashJson(aggregate)) throw new Error("Work Plane export aggregate does not match proposed Evidence");
			const reviewTargetHash = resultReviewTargetHash(runId, run.aggregateResultRef, aggregate);
			const reviewDecision = latestResultReviewDecision(events, reviewTargetHash);
			if (!reviewDecision || reviewDecision.decision !== "accept") throw new Error("Work Plane export requires an accepted Result Review; the latest Result Review is not accepted");
			assertDecisionNotExpired(reviewDecision, this.clock().toISOString());
			if (run.state === "complete" && !hasDecision$1(events, "completion", ["complete"], reviewTargetHash)) throw new Error("Work Plane export requires a Completion Decision bound to the current Result Review");
			if (run.runKind === "implementation" && run.implementationBinding) {
				await assertImplementationParentBindingCurrent(this.runtimeRoot, run.implementationBinding, this.clock().toISOString());
				await assertImplementationSourceArtifacts(this.runtimeRoot, run.implementationBinding);
			}
			const records = run.nodes.map((record) => {
				if (!record.childTaskId || !record.childJobId || !record.threadId || !record.resultRef || !record.resultHash || !record.evidenceHash || !record.childInputHash) throw new Error(`Work Plane export evidence is incomplete: ${record.node.nodeId}`);
				if (!record.node.capabilities.includes("propose")) throw new Error(`Work Plane export requires the propose capability: ${record.node.nodeId}`);
				if (getAdapterProfile(record.node.adapterId).dataPolicy !== "local-only") throw new Error(`Work Plane export requires a local-only Adapter: ${record.node.adapterId}`);
				return record;
			});
			const targetHash = artifactExportTargetHash(runId, run.aggregateResultRef, hashJson(aggregate), run.nodes);
			const createdAt = this.clock().toISOString();
			const envelope = buildDecisionEnvelope(run, "artifact-export", "export", targetHash, approvedBy, createdAt, {
				note,
				allowedCapability: "propose",
				dataPolicy: "local-only",
				expiresAt: new Date(this.clock().getTime() + 3e5).toISOString()
			});
			if (!canApprove({
				gate: "artifact-export",
				decision: "export",
				targetHash,
				expectedTargetHash: targetHash,
				approvedBy
			})) throw new Error("Work Plane export decision is invalid");
			assertDecisionNotExpired(envelope, createdAt);
			const results = await Promise.all(records.map(async (record) => {
				const result = await readJson(await safeRuntimePath(this.runtimeRoot, record.resultRef));
				if (hashJson(result) !== record.resultHash) throw new Error(`Work Plane export Result hash mismatch: ${record.node.nodeId}`);
				if (result.taskId !== record.childTaskId || result.jobId !== record.childJobId || result.adapterId !== record.node.adapterId || result.role !== record.node.role || result.inputHash !== record.childInputHash || result.orchestrationRunId !== runId) throw new Error(`Work Plane export Result binding mismatch: ${record.node.nodeId}`);
				const jobRequest = await readJson(await safeRuntimePath(this.runtimeRoot, `jobs/${record.childJobId}/request.json`));
				const jobSelection = jobRequest.task.adapterPlan.selections.length === 1 ? jobRequest.task.adapterPlan.selections[0] : void 0;
				if (jobRequest.jobId !== record.childJobId || jobRequest.inputHash !== record.childInputHash || jobRequest.inputHash !== hashJson(jobRequest.task) || jobRequest.task.taskId !== record.childTaskId || jobRequest.task.objective !== record.node.objective || jobSelection?.adapterId !== record.node.adapterId || jobSelection.role !== record.node.role || run.runKind === "implementation" && hashJson(jobRequest.task.implementationBinding) !== hashJson(run.implementationBinding)) throw new Error(`Work Plane export Job binding mismatch: ${record.node.nodeId}`);
				const thread = await readJson(await safeRuntimePath(this.runtimeRoot, `threads/${record.threadId}/thread.json`));
				if (thread.threadId !== record.threadId || thread.taskId !== record.childTaskId || thread.jobId !== record.childJobId || run.runKind === "implementation" && hashJson(thread.implementationBinding) !== hashJson(run.implementationBinding)) throw new Error(`Work Plane export Thread binding mismatch: ${record.node.nodeId}`);
				if (!thread.turns?.some((turn) => turn.resultEnvelopeRef === record.resultRef && turn.resultEnvelopeHash === record.resultHash && turn.orchestrationRunId === runId)) throw new Error(`Work Plane export Thread turn binding mismatch: ${record.node.nodeId}`);
				const evidence = await readJson(await safeRuntimePath(this.runtimeRoot, `threads/${record.threadId}/evidence-links.json`));
				if (evidence.threadId !== record.threadId || evidence.taskId !== record.childTaskId || evidence.jobId !== record.childJobId || hashJson(evidence) !== record.evidenceHash || !evidence.turns?.some((turn) => turn.resultEnvelopeRef === record.resultRef && turn.resultEnvelopeHash === record.resultHash)) throw new Error(`Work Plane export Evidence binding mismatch: ${record.node.nodeId}`);
				const candidate = run.runKind === "implementation" ? validateImplementationCandidate(result.artifact, record.node.scope.inScope) : void 0;
				return {
					nodeId: record.node.nodeId,
					taskId: record.childTaskId,
					jobId: record.childJobId,
					threadId: record.threadId,
					resultRef: record.resultRef,
					resultHash: record.resultHash,
					inputHash: record.childInputHash,
					adapterId: record.node.adapterId,
					role: record.node.role,
					result: {
						status: result.status,
						summary: boundedArtifactText(result.summary, 2e3),
						content: boundedArtifactText(result.content, 12e3),
						verification: result.verification,
						risks: result.risks
					},
					...candidate ? { candidate } : {}
				};
			}));
			const artifactId = `artifact-${hashJson([runId, targetHash]).slice(0, 20)}`;
			const relativePath = `frontdoor-runs/${runId}/work-plane/${artifactId}.json`;
			const content = {
				artifactId,
				runId,
				requestId: run.requestId,
				requestHash: run.requestHash,
				planHash: run.planHash,
				aggregateRef: run.aggregateResultRef,
				aggregateHash: hashJson(aggregate),
				nodes: results,
				exportedAt: createdAt
			};
			const candidate = run.runKind === "implementation" ? results[0].candidate : void 0;
			const manifest = {
				artifactId,
				runId,
				requestId: run.requestId,
				taskId: records[0].childTaskId,
				nodeId: records.length === 1 ? records[0].node.nodeId : "aggregate",
				jobId: records.length === 1 ? records[0].childJobId : "multiple",
				threadId: records.length === 1 ? records[0].threadId : "multiple",
				requestHash: run.requestHash,
				planHash: run.planHash,
				resultHash: hashJson(results.map((result) => ({
					nodeId: result.nodeId,
					resultHash: result.resultHash
				}))),
				aggregateHash: hashJson(aggregate),
				contentHash: hashJson(content),
				resultRef: records[0].resultRef,
				relativePath,
				contentType: "application/json",
				ownerDecisionIds: [reviewDecision.decisionId, envelope.decisionId],
				createdAt,
				status: "exported",
				...candidate ? {
					candidateKind: candidate.kind,
					candidateHash: candidate.candidateHash,
					candidateFiles: candidate.files.map((file) => ({
						relativePath: file.relativePath,
						contentHash: file.contentHash
					})),
					parentRunId: run.implementationBinding?.parentRunId,
					sourceAggregateRef: run.implementationBinding?.sourceAggregateRef,
					sourceAggregateHash: run.implementationBinding?.sourceAggregateHash,
					sourceResultHash: run.implementationBinding?.sourceResultHash,
					contextBundleHash: run.implementationBinding?.contextBundleHash
				} : {}
			};
			const runDirectory = await safeRuntimePath(this.runtimeRoot, `frontdoor-runs/${runId}`);
			const workPlaneDirectory = node_path.default.join(runDirectory, "work-plane");
			await assertDecisionBinding(this.runtimeRoot, envelope);
			await assertNoSymlinkComponents(runDirectory, workPlaneDirectory);
			try {
				await (0, node_fs_promises.mkdir)(workPlaneDirectory);
			} catch (error) {
				if (error.code === "EEXIST") throw new Error("Work Plane export is blocked by an existing or incomplete artifact state (recovery-needed)");
				throw error;
			}
			const artifactPath = node_path.default.join(workPlaneDirectory, `${artifactId}.json`);
			const temporaryArtifactPath = node_path.default.join(workPlaneDirectory, `${artifactId}.${process.pid}.${Date.now()}.tmp`);
			try {
				await (0, node_fs_promises.writeFile)(temporaryArtifactPath, `${JSON.stringify({
					manifest,
					content
				}, null, 2)}\n`, {
					encoding: "utf8",
					flag: "wx"
				});
				await (0, node_fs_promises.link)(temporaryArtifactPath, artifactPath);
				await (0, node_fs_promises.rm)(temporaryArtifactPath, { force: true });
				await recordRunEvent(this.runtimeRoot, runId, "frontdoor.owner-decision-recorded", {
					decision: envelope,
					artifact: manifest
				});
			} catch (error) {
				await (0, node_fs_promises.rm)(temporaryArtifactPath, { force: true });
				try {
					await (0, node_fs_promises.writeFile)(node_path.default.join(workPlaneDirectory, "recovery-needed.json"), `${JSON.stringify({
						runId,
						artifactId,
						reason: "artifact export interrupted before Ledger binding",
						detectedAt: this.clock().toISOString()
					})}\n`, {
						encoding: "utf8",
						flag: "wx"
					});
				} catch {}
				throw error;
			}
			return manifest;
		} finally {
			await releaseRun(this.runtimeRoot, runId, claim.token);
		}
	}
	async inspectWorkPlaneArtifact(runId) {
		const run = await readProjectedRun(this.runtimeRoot, runId);
		const request = await readRequest(this.runtimeRoot, runId);
		const plan = await readPlan(this.runtimeRoot, runId);
		await assertRunIntegrity(this.runtimeRoot, run, request, plan);
		const events = await readRunEvents(this.runtimeRoot, runId);
		assertRunEventConsistency(run, events);
		const manifest = latestWorkPlaneArtifactManifest(events);
		if (!manifest) throw new Error("Frontdoor Run has no exported Work Plane artifact");
		const verified = await readVerifiedWorkPlaneArtifact(this.runtimeRoot, runId, manifest);
		return {
			runId,
			manifest: verified.manifest,
			content: verified.content
		};
	}
	async listReviewableCandidates() {
		const runsDir = node_path.default.join(this.runtimeRoot, "frontdoor-runs");
		let runDirs = [];
		try {
			runDirs = (await (0, node_fs_promises.readdir)(runsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
		} catch (error) {
			if (error.code === "ENOENT") return [];
			throw error;
		}
		const summaries = [];
		for (const runId of runDirs) {
			const workPlaneDir = node_path.default.join(runsDir, runId, "work-plane");
			let files = [];
			try {
				files = (await (0, node_fs_promises.readdir)(workPlaneDir, { withFileTypes: true })).filter((e) => e.isFile() && e.name.startsWith("artifact-") && e.name.endsWith(".json")).map((e) => e.name);
			} catch {
				continue;
			}
			if (files.length === 0) continue;
			const events = await readRunEvents(this.runtimeRoot, runId).catch(() => []);
			for (const file of files) {
				const artifactPath = node_path.default.join(workPlaneDir, file);
				try {
					const raw = await readJson(artifactPath);
					const manifest = raw.manifest;
					if (manifest.candidateKind !== "candidate-file-set" || !manifest.candidateHash) continue;
					const candidateId = manifest.artifactId;
					const candidateEvents = events.filter((e) => e.payload.candidateId === candidateId || e.payload.decision?.candidateId === candidateId);
					let state = "generated";
					const reviewed = [...candidateEvents].reverse().find((e) => e.type === "frontdoor.candidate-reviewed" || e.type === "frontdoor.owner-decision-recorded" && e.payload.decision?.gate === "candidate-review");
					if (reviewed) {
						const decisionEnvelope = reviewed.payload.decision;
						const decision = String(decisionEnvelope?.decision ?? reviewed.payload.decision);
						if (decision === "accept") state = "accepted";
						else if (decision === "reject") state = "rejected";
						else if (decision === "follow-up") state = "follow-up";
					} else if (candidateEvents.some((e) => e.type === "frontdoor.candidate-review-started")) state = "owner-review";
					const fileCount = manifest.candidateFiles?.length ?? 0;
					const totalBytes = raw.content?.nodes?.[0]?.candidate?.files?.reduce((sum, f) => sum + Buffer.byteLength(f.content ?? "", "utf8"), 0) ?? 0;
					summaries.push({
						candidateId,
						parentRunId: manifest.parentRunId ?? "",
						childRunId: runId,
						candidateHash: manifest.candidateHash,
						fileCount,
						totalBytes,
						state,
						exportedAt: manifest.createdAt
					});
				} catch {
					continue;
				}
			}
		}
		return summaries.sort((a, b) => b.exportedAt.localeCompare(a.exportedAt));
	}
	async inspectCandidate(candidateId) {
		const summary = (await this.listReviewableCandidates()).find((s) => s.candidateId === candidateId);
		if (!summary) throw new Error(`Candidate not found: ${candidateId}`);
		const relativePath = `frontdoor-runs/${summary.childRunId}/work-plane/${candidateId}.json`;
		const raw = await readJson(node_path.default.join(this.runtimeRoot, relativePath));
		const { manifest, content } = await readVerifiedWorkPlaneArtifact(this.runtimeRoot, summary.childRunId, raw.manifest);
		if (manifest.artifactId !== candidateId || manifest.candidateKind !== "candidate-file-set") throw new Error(`Invalid Candidate artifact: ${candidateId}`);
		const node = content.nodes.find((n) => n.candidate);
		if (!node?.candidate) throw new Error(`Candidate payload missing in artifact: ${candidateId}`);
		const run = await readRun(this.runtimeRoot, summary.childRunId);
		if (!run.implementationBinding) throw new Error(`Candidate implementation binding missing: ${candidateId}`);
		await this.startCandidateReview(candidateId);
		const updatedSummary = (await this.listReviewableCandidates()).find((s) => s.candidateId === candidateId) ?? summary;
		const targetHash = candidateReviewTargetHash(summary.childRunId, candidateId, manifest.candidateHash, run.implementationBinding.sourceResultHash, run.implementationBinding.parentReviewDecisionId);
		return {
			summary: updatedSummary,
			candidate: node.candidate,
			binding: run.implementationBinding,
			manifest,
			state: updatedSummary.state,
			targetHash
		};
	}
	async startCandidateReview(candidateId) {
		const summary = (await this.listReviewableCandidates()).find((s) => s.candidateId === candidateId);
		if (!summary) throw new Error(`Candidate not found: ${candidateId}`);
		const existing = (await readRunEvents(this.runtimeRoot, summary.childRunId)).find((e) => e.type === "frontdoor.candidate-review-started" && e.payload.candidateId === candidateId);
		const startedAt = (existing?.payload)?.startedAt ?? this.clock().toISOString();
		if (!existing) await recordRunEvent(this.runtimeRoot, summary.childRunId, "frontdoor.candidate-review-started", {
			candidateId,
			startedAt
		});
		return {
			candidateId,
			state: "owner-review",
			startedAt
		};
	}
	async reviewCandidate(input) {
		if (!input.approvedBy || input.approvedBy.trim().length === 0) throw new Error("approvedBy is required");
		if (![
			"accept",
			"reject",
			"follow-up"
		].includes(input.decision)) throw new Error(`Invalid candidate decision: ${input.decision}`);
		const summary = (await this.listReviewableCandidates()).find((s) => s.candidateId === input.candidateId);
		if (!summary) throw new Error(`Candidate not found: ${input.candidateId}`);
		if (summary.state === "accepted" || summary.state === "rejected" || summary.state === "follow-up") throw new Error(`Candidate review is already in a terminal state: ${summary.state}`);
		if (!(await readRunEvents(this.runtimeRoot, summary.childRunId)).find((e) => e.type === "frontdoor.candidate-review-started" && e.payload.candidateId === input.candidateId)) throw new Error("candidate review was not started");
		const relativePath = `frontdoor-runs/${summary.childRunId}/work-plane/${input.candidateId}.json`;
		const raw = await readJson(node_path.default.join(this.runtimeRoot, relativePath));
		const { manifest } = await readVerifiedWorkPlaneArtifact(this.runtimeRoot, summary.childRunId, raw.manifest);
		if (manifest.artifactId !== input.candidateId || manifest.candidateKind !== "candidate-file-set" || manifest.candidateHash !== summary.candidateHash) throw new Error("candidate artifact hash mismatch");
		const run = await readRun(this.runtimeRoot, summary.childRunId);
		if (!run.implementationBinding) throw new Error("candidate binding mismatch");
		await assertImplementationParentBindingCurrent(this.runtimeRoot, run.implementationBinding, this.clock().toISOString());
		await assertImplementationSourceArtifacts(this.runtimeRoot, run.implementationBinding);
		const expectedTargetHash = candidateReviewTargetHash(summary.childRunId, input.candidateId, manifest.candidateHash, run.implementationBinding.sourceResultHash, run.implementationBinding.parentReviewDecisionId);
		if (input.targetHash !== expectedTargetHash) throw new Error(`candidate review target hash mismatch: expected ${expectedTargetHash}, got ${input.targetHash}`);
		const decidedAt = this.clock().toISOString();
		const expiresAt = new Date(this.clock().getTime() + 36e5).toISOString();
		const decisionId = `owner-decision-${hashJson([
			summary.childRunId,
			"candidate-review",
			input.candidateId,
			input.decision,
			input.targetHash,
			input.approvedBy,
			decidedAt
		]).slice(0, 20)}`;
		const envelope = {
			decisionId,
			runId: summary.childRunId,
			requestId: run.requestId,
			taskId: manifest.taskId,
			candidateId: input.candidateId,
			candidateHash: manifest.candidateHash,
			targetHash: input.targetHash,
			approvedBy: input.approvedBy,
			capability: "candidate-review",
			decidedAt,
			expiresAt,
			decision: input.decision,
			note: input.note
		};
		const genericEnvelope = {
			decisionId,
			runId: summary.childRunId,
			requestId: run.requestId,
			gate: "candidate-review",
			decision: input.decision,
			targetHash: input.targetHash,
			approvedBy: input.approvedBy,
			decidedAt,
			allowedCapability: "propose",
			dataPolicy: "local-only",
			expiresAt,
			note: input.note
		};
		await recordRunEvent(this.runtimeRoot, summary.childRunId, "frontdoor.owner-decision-recorded", {
			decision: genericEnvelope,
			candidateId: input.candidateId
		});
		await recordRunEvent(this.runtimeRoot, summary.childRunId, "frontdoor.candidate-reviewed", {
			decision: envelope,
			candidateId: input.candidateId,
			state: input.decision
		});
		return envelope;
	}
};
//#endregion
//#region src/main/frontdoor/frontdoorService.ts
function prepareFrontdoorRun(orchestrator, input) {
	return guard(() => prepareFrontdoorRunOrThrow(orchestrator, input));
}
function proposeFrontdoorPlan(planner, input) {
	return guard(async () => {
		if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("planner input must be a Request object");
		return planner.propose(createFrontdoorRequest(input));
	});
}
function guard(run) {
	return run().then((value) => ({
		ok: true,
		value
	}), (error) => ({
		ok: false,
		error: safeError(error)
	}));
}
function safeError(error) {
	return String(error?.message ?? error).replace(/\s+/g, " ").slice(0, 500);
}
function identifier(value, label) {
	if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,240}$/.test(value) || value.includes("..")) throw new Error(`invalid ${label}`);
	return value;
}
function owner(value) {
	if (typeof value !== "string" || value.trim().length === 0 || value.length > 120) throw new Error("approvedBy is required");
	return value.trim();
}
function note(value) {
	if (value === void 0 || value === null) return void 0;
	if (typeof value !== "string" || value.length > 400) throw new Error("invalid note");
	return value;
}
function gate(value) {
	if (value === "intake" || value === "completion-shape" || value === "decomposition" || value === "dispatch") return value;
	throw new Error("invalid approval gate");
}
function nodeIds(value) {
	if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string")) throw new Error("dispatch requires a non-empty nodeIds array");
	const ids = value.map((entry) => identifier(entry, "nodeId"));
	if (new Set(ids).size !== ids.length) throw new Error("dispatch nodeIds must be unique");
	return ids;
}
function reviewDecision(value) {
	if (value === "accept" || value === "follow-up" || value === "reject") return value;
	throw new Error("invalid result review decision");
}
function nodeReviewDecision(value) {
	if (value === "continue" || value === "stop") return value;
	throw new Error("invalid Node review decision");
}
function packetPath(runtimeRoot, taskId) {
	const file = node_path.default.join(runtimeRoot, "approved-tasks", `${taskId}.json`);
	if (node_path.default.basename(file) !== `${taskId}.json`) throw new Error(`invalid child Task Packet identifier: ${taskId}`);
	return file;
}
async function packetsForRun(orchestrator, run) {
	const packets = {};
	for (const record of run.nodes) {
		const taskId = record.childTaskId;
		try {
			packets[record.node.nodeId] = await readJson(packetPath(orchestrator.runtimeRoot, taskId));
		} catch (error) {
			if (error.code === "ENOENT") throw new Error(`Owner-approved child Packet is missing: approved-tasks/${taskId}.json`);
			throw error;
		}
	}
	return packets;
}
async function packetsReady(orchestrator, run) {
	try {
		await Promise.all(run.nodes.map((record) => (0, node_fs_promises.access)(packetPath(orchestrator.runtimeRoot, record.childTaskId))));
		return true;
	} catch {
		return false;
	}
}
async function runIds(orchestrator) {
	try {
		return (await (0, node_fs_promises.readdir)(node_path.default.join(orchestrator.runtimeRoot, "frontdoor-runs"), { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^[A-Za-z0-9._:-]{1,240}$/.test(entry.name) && !entry.name.includes("..")).map((entry) => entry.name).sort();
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw error;
	}
}
function listFrontdoorRuns(orchestrator) {
	return guard(async () => {
		const summaries = [];
		for (const runId of await runIds(orchestrator)) {
			const inspection = await orchestrator.inspectRun(runId);
			summaries.push({
				runId,
				requestId: inspection.request.requestId,
				objective: inspection.request.objective,
				state: inspection.run.state,
				ownerGate: inspection.run.ownerGate,
				updatedAt: inspection.run.updatedAt,
				nodeCount: inspection.run.nodes.length,
				openQuestionCount: inspection.openQuestions.length,
				packetsReady: await packetsReady(orchestrator, inspection.run)
			});
		}
		return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	});
}
function inspectFrontdoorRun(orchestrator, runId) {
	return guard(() => orchestrator.inspectRun(identifier(runId, "runId")));
}
function inspectFrontdoorArtifact(orchestrator, runId) {
	return guard(() => orchestrator.inspectWorkPlaneArtifact(identifier(runId, "runId")));
}
function approveFrontdoorRun(orchestrator, input) {
	return guard(async () => {
		const runId = identifier(input.runId, "runId");
		const approvedBy = owner(input.approvedBy);
		const selectedGate = gate(input.gate);
		const safeNote = note(input.note);
		if (selectedGate === "intake") return orchestrator.approveIntake(runId, approvedBy, safeNote);
		if (selectedGate === "completion-shape") return orchestrator.approveCompletionShape(runId, approvedBy, safeNote);
		if (selectedGate === "decomposition") return orchestrator.approveDecomposition(runId, approvedBy, safeNote);
		return orchestrator.approveDispatch(runId, nodeIds(input.nodeIds), approvedBy, safeNote);
	});
}
function dispatchFrontdoorRun(orchestrator, runId, options = {}) {
	return guard(async () => {
		const run = await orchestrator.getRun(identifier(runId, "runId"));
		return orchestrator.executeApprovedRun(run.runId, await packetsForRun(orchestrator, run), options);
	});
}
function answerFrontdoorQuestion(orchestrator, input) {
	return guard(async () => {
		const runId = identifier(input.runId, "runId");
		const questionId = identifier(input.questionId, "questionId");
		const answerRef = input.answerRef === void 0 || input.answerRef === null ? void 0 : identifier(input.answerRef, "answerRef");
		const safeNote = note(input.note);
		if (!answerRef && !safeNote) throw new Error("answer requires answerRef or note");
		return orchestrator.answerQuestion(runId, await orchestrator.getOpenQuestion(runId, questionId), owner(input.approvedBy), answerRef, safeNote);
	});
}
function reviewFrontdoorResult(orchestrator, input) {
	return guard(() => orchestrator.reviewResult(identifier(input.runId, "runId"), owner(input.approvedBy), reviewDecision(input.decision), note(input.note)));
}
function reviewFrontdoorNode(orchestrator, input) {
	return guard(async () => {
		const runId = identifier(input.runId, "runId");
		const nodeId = identifier(input.nodeId, "nodeId");
		const decision = await orchestrator.reviewNode(runId, nodeId, owner(input.approvedBy), nodeReviewDecision(input.decision), note(input.note));
		if (decision.decision === "stop") return { decision };
		const execution = await dispatchFrontdoorRun(orchestrator, runId, { requirePacketBinding: true });
		if (!execution.ok) throw new Error(`Node review continued, but next Node dispatch failed: ${execution.error}`);
		return {
			decision,
			execution: execution.value
		};
	});
}
function completeFrontdoorRun(orchestrator, input) {
	return guard(() => orchestrator.completeRun(identifier(input.runId, "runId"), owner(input.approvedBy), note(input.note)));
}
function exportFrontdoorArtifact(orchestrator, input) {
	return guard(() => orchestrator.exportWorkPlaneArtifact(identifier(input.runId, "runId"), owner(input.approvedBy), note(input.note)));
}
function stopFrontdoorRun(orchestrator, input) {
	return guard(() => orchestrator.stopRun(identifier(input.runId, "runId"), note(input.note) ?? "Owner stopped Frontdoor run", owner(input.approvedBy)));
}
function recoverFrontdoorRun(orchestrator, runId) {
	return guard(() => orchestrator.recoverRun(identifier(runId, "runId")));
}
function listReviewableCandidates(orchestrator) {
	return guard(() => orchestrator.listReviewableCandidates());
}
function inspectCandidate(orchestrator, candidateId) {
	return guard(() => orchestrator.inspectCandidate(identifier(candidateId, "candidateId")));
}
function startCandidateReview(orchestrator, candidateId) {
	return guard(() => orchestrator.startCandidateReview(identifier(candidateId, "candidateId")));
}
function reviewCandidate(orchestrator, input) {
	return guard(async () => {
		if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("candidate review input must be an object");
		const raw = input;
		const candidateId = identifier(raw.candidateId, "candidateId");
		const approvedBy = owner(raw.approvedBy);
		const decision = raw.decision;
		if (decision !== "accept" && decision !== "reject" && decision !== "follow-up") throw new Error("invalid candidate decision");
		const targetHash = identifier(raw.targetHash, "targetHash");
		const safeNote = note(raw.note);
		return orchestrator.reviewCandidate({
			candidateId,
			approvedBy,
			decision,
			targetHash,
			note: safeNote
		});
	});
}
//#endregion
//#region src/main/frontdoor/questionAggregator.ts
function questionsFromThread(runId, node, thread) {
	const turn = thread.turns[thread.turns.length - 1];
	if (!turn?.questions?.length) return [];
	return turn.questions.map((draft, index) => ({
		questionId: `question-${hashJson([
			runId,
			node.node.nodeId,
			turn.turnId,
			index,
			draft
		]).slice(0, 20)}`,
		runId,
		nodeId: node.node.nodeId,
		sourceResultId: turn.resultEnvelopeRef,
		kind: draft.kind,
		text: draft.text,
		required: draft.required ?? true,
		blocking: draft.blocking ?? false,
		options: draft.options ?? [],
		status: "open"
	}));
}
function openBlockingQuestions(questions) {
	return questions.filter((question) => question.status === "open" && question.blocking);
}
//#endregion
//#region src/main/frontdoor/returnEnvelope.ts
function aggregateResults(runId, nodes, questions, evidenceRefs, createdAt) {
	const completedNodes = nodes.filter((node) => node.state === "completed").map((node) => node.node.nodeId);
	const failedNodes = nodes.filter((node) => node.state === "failed").map((node) => node.node.nodeId);
	const partialNodes = nodes.filter((node) => node.resultStatus === "partial").map((node) => node.node.nodeId);
	const childResults = nodes.filter((node) => node.resultStatus).map((node) => ({
		nodeId: node.node.nodeId,
		status: node.resultStatus,
		resultRef: node.resultRef,
		resultHash: node.resultHash
	}));
	const blocking = openBlockingQuestions(questions);
	const hasCancelled = nodes.some((node) => node.state === "cancelled");
	const status = blocking.length > 0 ? "blocked-by-question" : failedNodes.length > 0 && completedNodes.length === 0 ? "failed" : failedNodes.length > 0 || partialNodes.length > 0 ? "partial" : hasCancelled ? "cancelled" : "complete";
	const nextAction = blocking.length > 0 ? "Ownerが質問へ回答してから、該当Nodeの再開可否を判断する" : status === "complete" ? "OwnerがEvidenceを確認し、採用・継続・停止を判断する" : status === "partial" ? "Ownerが部分Resultと失敗Nodeを確認し、継続・再設計・停止を判断する" : "Ownerが失敗・停止理由を確認し、次のTaskを判断する";
	return {
		aggregateId: `aggregate-${hashJson([
			runId,
			nodes.map((node) => [
				node.node.nodeId,
				node.resultStatus,
				node.resultRef
			]),
			questions
		]).slice(0, 20)}`,
		runId,
		status,
		completedNodes,
		failedNodes,
		partialNodes,
		childResults,
		openQuestions: questions.filter((question) => question.status === "open"),
		conflicts: [],
		evidenceRefs: [...evidenceRefs],
		ownerDecisionRequired: true,
		nextAction,
		createdAt
	};
}
function buildFrontdoorReturn(request, aggregate) {
	const answer = openBlockingQuestions(aggregate.openQuestions).length > 0 ? "子AIからの質問があり、回答またはOwner判断が必要です。" : aggregate.status === "complete" ? `${aggregate.completedNodes.length}件の子Taskが完了し、Evidenceを集約しました。` : `${aggregate.completedNodes.length}件完了、${aggregate.failedNodes.length}件失敗、${aggregate.partialNodes.length}件部分結果です。`;
	return {
		requestId: request.requestId,
		runId: aggregate.runId,
		status: aggregate.status,
		summary: answer,
		answer,
		childResultRefs: aggregate.childResults.flatMap((result) => result.resultRef ? [result.resultRef] : []),
		openQuestions: aggregate.openQuestions,
		unresolvedRisks: aggregate.status === "complete" ? [] : ["Owner判断または追加検証が必要"],
		evidenceRefs: aggregate.evidenceRefs,
		ownerDecisionRequired: aggregate.ownerDecisionRequired,
		nextAction: aggregate.nextAction
	};
}
//#endregion
//#region src/shared/participantTypes.ts
/**
* The participant-authored free text in one submission, as `{ field: value }` for the shared
* credential guard.
*
* Both ends of the participant path call this — the MCP server before it writes the file, and the
* Frontdoor ingestion before it adopts one. Deriving the field set in a single place is the point:
* when the two ends disagree about what to scan, the weaker end becomes the boundary.
*/
function submissionScanFields(submission) {
	const fields = {
		summary: submission.summary,
		content: submission.content
	};
	submission.verification?.forEach((entry, index) => {
		fields[`verification[${index}].name`] = entry?.name;
		if (entry?.reason !== void 0) fields[`verification[${index}].reason`] = entry.reason;
	});
	submission.risks?.forEach((risk, index) => {
		fields[`risks[${index}]`] = risk;
	});
	return fields;
}
//#endregion
//#region src/main/frontdoor/participantEvidence.ts
var maxSubmissions = 100;
var maxText = 12e3;
function isRecord(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function safeIdentifier(value, label) {
	if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,240}$/.test(value) || value.includes("..")) throw new Error(`invalid ${label}`);
	return value;
}
function hash(value, label) {
	if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`participant submission ${label} must be a SHA-256 hash`);
	return value;
}
function boundedText(value, label, limit = maxText) {
	if (typeof value !== "string" || value.length > limit) throw new Error(`participant submission ${label} is invalid`);
	return value;
}
function approvalState(events, run, node) {
	const targetHash = nodeTargetHash(run, { node });
	return {
		ownerNodeApproved: events.some((event) => event.type === "frontdoor.node-approved" && event.payload.nodeId === node.nodeId && event.payload.nodeTargetHash === targetHash),
		ownerPacketDispatchApproved: events.some((event) => event.type === "frontdoor.approval-bound" && typeof event.payload.targetHash === "string" && Array.isArray(event.payload.nodeIds) && event.payload.nodeIds.includes(node.nodeId) && isRecord(event.payload.packetHashes) && typeof event.payload.packetHashes[node.nodeId] === "string")
	};
}
function validateSubmissionShape(value, participantId, assignmentIdFromPath) {
	if (!isRecord(value)) throw new Error("participant submission must be an object");
	const submission = value;
	if (submission.status !== "submitted") throw new Error("participant submission status is invalid");
	if (submission.participantId !== participantId) throw new Error("participant submission participant binding mismatch");
	if (submission.assignmentId !== assignmentIdFromPath) throw new Error("participant submission assignment path mismatch");
	safeIdentifier(submission.assignmentId, "assignmentId");
	safeIdentifier(submission.runId, "runId");
	safeIdentifier(submission.requestId, "requestId");
	safeIdentifier(submission.nodeId, "nodeId");
	if (typeof submission.submissionId !== "string" || submission.submissionId !== `submission-${hashJson([
		submission.participantId,
		submission.assignmentId,
		submission.targetHash
	]).slice(0, 24)}`) throw new Error("participant submission id binding mismatch");
	hash(submission.requestHash, "requestHash");
	hash(submission.planHash, "planHash");
	hash(submission.targetHash, "targetHash");
	hash(submission.assignmentHash, "assignmentHash");
	boundedText(submission.summary, "summary", 2e3);
	boundedText(submission.content, "content");
	if (!Array.isArray(submission.verification) || submission.verification.length > 20 || !submission.verification.every((entry) => isRecord(entry) && typeof entry.name === "string" && entry.name.length <= 500 && [
		"pass",
		"fail",
		"not-run"
	].includes(String(entry.status)))) throw new Error("participant submission verification is invalid");
	if (!Array.isArray(submission.risks) || submission.risks.length > 20 || !submission.risks.every((risk) => typeof risk === "string" && risk.length <= 500)) throw new Error("participant submission risks are invalid");
	if (typeof submission.createdAt !== "string" || Number.isNaN(Date.parse(submission.createdAt))) throw new Error("participant submission createdAt is invalid");
	assertNoCredentialShapedText("participant submission", submissionScanFields(submission));
	return submission;
}
async function verifySubmission(runtimeRoot, submissionRef, participantId, assignmentIdFromPath, runCache) {
	const submission = validateSubmissionShape(await readJson(await safeRuntimePath(runtimeRoot, submissionRef)), participantId, assignmentIdFromPath);
	let bundle = runCache.get(submission.runId);
	if (!bundle) {
		const run = await readProjectedRun(runtimeRoot, submission.runId, { repair: false });
		const [request, plan, events] = await Promise.all([
			readRequest(runtimeRoot, submission.runId),
			readPlan(runtimeRoot, submission.runId),
			readRunEvents(runtimeRoot, submission.runId)
		]);
		if (request.inputHash !== run.requestHash || plan.planHash !== run.planHash) throw new Error(`participant evidence binding mismatch: ${submission.runId}`);
		bundle = {
			run,
			request,
			plan,
			events
		};
		runCache.set(submission.runId, bundle);
	}
	const record = bundle.run.nodes.find((candidate) => candidate.node.nodeId === submission.nodeId);
	if (!record?.node.participantAssignment) throw new Error(`participant evidence Node assignment not found: ${submission.nodeId}`);
	const assignment = record.node.participantAssignment;
	if (assignment.participantId !== participantId || assignment.role !== submission.participantRole) throw new Error(`participant evidence role binding mismatch: ${submission.nodeId}`);
	validateParticipantAssignment(assignment.participantId, assignment.role, assignment.capabilities);
	if (participantAssignmentId(submission.runId, record.node) !== submission.assignmentId) throw new Error(`participant evidence assignmentId mismatch: ${submission.nodeId}`);
	if (hashJson(assignment) !== submission.assignmentHash) throw new Error(`participant evidence assignment hash mismatch: ${submission.nodeId}`);
	if (submission.requestId !== bundle.request.requestId || submission.requestHash !== bundle.run.requestHash || submission.planHash !== bundle.run.planHash) throw new Error(`participant evidence Request/Plan binding mismatch: ${submission.nodeId}`);
	const targetHash = nodeTargetHash(bundle.run, record);
	if (submission.targetHash !== targetHash) throw new Error(`participant evidence target hash mismatch: ${submission.nodeId}`);
	const approvals = approvalState(bundle.events, bundle.run, record.node);
	if (!approvals.ownerPacketDispatchApproved) throw new Error(`participant evidence has no Owner Packet-bound Dispatch: ${submission.nodeId}`);
	const submissionHash = hashJson(submission);
	return {
		evidenceId: `participant-evidence-${hashJson([
			submission.runId,
			submission.nodeId,
			submission.submissionId
		]).slice(0, 24)}`,
		submissionRef,
		evidenceHash: submissionHash,
		status: "awaiting-owner-review",
		runId: submission.runId,
		requestId: submission.requestId,
		nodeId: submission.nodeId,
		participantId: submission.participantId,
		participantRole: submission.participantRole,
		requestHash: submission.requestHash,
		planHash: submission.planHash,
		targetHash: submission.targetHash,
		assignmentHash: submission.assignmentHash,
		summary: submission.summary,
		content: submission.content,
		verification: submission.verification,
		risks: submission.risks,
		createdAt: submission.createdAt,
		ownerNodeApproved: approvals.ownerNodeApproved,
		ownerPacketDispatchApproved: approvals.ownerPacketDispatchApproved
	};
}
async function listParticipantEvidence(runtimeRoot, runId) {
	const safeRoot = await assertRuntimeRootSafe(runtimeRoot);
	if (runId !== void 0) safeIdentifier(runId, "runId");
	const submissionsRoot = node_path.default.join(safeRoot, "participant-submissions");
	let participants;
	try {
		participants = await (0, node_fs_promises.readdir)(submissionsRoot, { withFileTypes: true });
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw error;
	}
	const runCache = /* @__PURE__ */ new Map();
	const verified = [];
	for (const participantEntry of participants.filter((entry) => entry.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
		const participantId = safeIdentifier(participantEntry.name, "participantId");
		const participantDirectory = node_path.default.join(submissionsRoot, participantId);
		const files = await (0, node_fs_promises.readdir)(participantDirectory, { withFileTypes: true });
		for (const file of files.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).sort((left, right) => left.name.localeCompare(right.name))) {
			const assignmentId = safeIdentifier(file.name.slice(0, -5), "assignmentId");
			const candidate = await verifySubmission(safeRoot, `participant-submissions/${participantId}/${file.name}`, participantId, assignmentId, runCache);
			if (runId === void 0 || candidate.runId === runId) verified.push(candidate);
			if (verified.length > maxSubmissions) throw new Error(`participant evidence exceeds the limit of ${maxSubmissions}`);
		}
	}
	return verified.sort((left, right) => `${left.runId}:${left.nodeId}`.localeCompare(`${right.runId}:${right.nodeId}`));
}
//#endregion
//#region src/main/frontdoor/activityTrace.ts
function text(value, fallback) {
	return typeof value === "string" && value.trim().length > 0 ? maskSecrets(value.slice(0, 240)) : fallback;
}
function nodeContext(run, payload) {
	const nodeId = typeof payload.nodeId === "string" ? payload.nodeId : void 0;
	const node = nodeId ? run.nodes.find((record) => record.node.nodeId === nodeId)?.node : void 0;
	return {
		nodeId,
		adapterId: node?.adapterId,
		role: node?.role,
		skillId: node?.skillId ?? (typeof payload.skillId === "string" ? payload.skillId : void 0)
	};
}
function definition(event, run) {
	const payload = event.payload;
	const context = nodeContext(run, payload);
	let kind = "system";
	let status = "complete";
	let label = event.type;
	let detail = "ADF Event Ledgerに記録されました。";
	switch (event.type) {
		case "frontdoor.run-created":
			label = "Request受領";
			detail = "Frontdoor Runを作成しました。";
			break;
		case "frontdoor.candidate-request-created":
			kind = "agent";
			label = "採用CandidateからRequest生成";
			detail = "窓口AIが明示したRequestにCandidateの来歴を束縛しました。";
			break;
		case "frontdoor.owner-gate-opened":
			kind = "owner";
			status = "waiting";
			label = `Owner Gate待ち: ${text(payload.gate, "unknown")}`;
			detail = "Ownerの判断を待っています。";
			break;
		case "frontdoor.owner-decision-recorded": {
			kind = "owner";
			const decision = payload.decision && typeof payload.decision === "object" ? payload.decision : {};
			label = `Owner Decision: ${text(decision.gate, "unknown")} / ${text(decision.decision, "unknown")}`;
			detail = `承認者: ${text(decision.approvedBy, "未記録")}`;
			break;
		}
		case "frontdoor.approval-bound":
			label = "Dispatch承認を束縛";
			detail = "承認済みPacketとRunの実行境界を固定しました。";
			break;
		case "frontdoor.node-approved":
			kind = "owner";
			label = `Node承認: ${text(payload.nodeId, "unknown")}`;
			detail = "OwnerがこのNodeのDispatchを承認しました。";
			break;
		case "frontdoor.node-started":
			kind = "agent";
			status = "running";
			label = `AI Node実行開始: ${text(context.nodeId, "unknown")}`;
			detail = `${context.adapterId ?? "Adapter未記録"} / ${context.role ?? "role未記録"}`;
			break;
		case "frontdoor.node-completed":
			kind = "agent";
			label = `AI Node Result受領: ${text(context.nodeId, "unknown")}`;
			detail = payload.autoContinued === true ? `${context.adapterId ?? "Adapter未記録"} / 安全条件を満たしたため次のNodeへ自動継続しました。` : `${context.adapterId ?? "Adapter未記録"} / ResultをEvidence検証へ渡しました。`;
			break;
		case "frontdoor.node-failed":
			kind = "agent";
			status = "failed";
			label = `AI Node失敗: ${text(context.nodeId, "unknown")}`;
			detail = text(payload.error, "Nodeの実行に失敗しました。");
			break;
		case "frontdoor.node-review-opened":
			kind = "verification";
			status = "waiting";
			label = `Node Result確認待ち: ${text(payload.nodeId, "unknown")}`;
			detail = "Result、Evidence、リスクをOwnerが確認します。";
			break;
		case "frontdoor.node-review-continued":
			kind = "owner";
			label = "Node Review継続";
			detail = "Ownerの継続判断を記録しました。";
			break;
		case "frontdoor.question-opened":
			kind = "owner";
			status = "waiting";
			label = "AI Question待ち";
			detail = "AIからの質問へのOwner回答が必要です。";
			break;
		case "frontdoor.question-answered":
			kind = "owner";
			label = "AI Question回答";
			detail = "Owner回答を記録しました。";
			break;
		case "frontdoor.completion-proposed":
			kind = "verification";
			status = "waiting";
			label = "Aggregate Result確認待ち";
			detail = "集約ResultをOwnerが確認します。";
			break;
		case "frontdoor.result-reviewed":
			kind = "owner";
			label = `Result Review: ${text(payload.decision?.decision, "unknown")}`;
			detail = "OwnerのResult判断を記録しました。";
			break;
		case "frontdoor.completion-approved":
			kind = "owner";
			label = "Completion承認";
			detail = "OwnerがCompletionを承認しました。";
			break;
		case "frontdoor.run-recovery-needed":
			status = "waiting";
			label = "Recovery確認待ち";
			detail = "中断状態を検出しました。OwnerのRecovery判断が必要です。";
			break;
		case "frontdoor.run-stopped":
			status = "stopped";
			label = "Run停止";
			detail = text(payload.reason, "Ownerまたは停止条件により停止しました。");
			break;
		case "frontdoor.run-completed": {
			const resultStatus = text(payload.status, "unknown");
			status = resultStatus === "complete" ? "complete" : resultStatus === "failed" ? "failed" : "complete";
			label = `Run完了: ${resultStatus}`;
			detail = "Runの終端状態をLedgerへ記録しました。";
			break;
		}
		case "frontdoor.plan-revised":
			kind = "owner";
			label = "Plan改訂";
			detail = "Plan改訂と旧Decisionの無効化を記録しました。";
			break;
		default: label = event.type;
	}
	return {
		kind,
		status,
		label,
		detail,
		...context
	};
}
function buildActivityTrace(events, run, limit = 100) {
	return events.slice(-limit).map((event) => ({
		activityId: event.eventId,
		occurredAt: event.occurredAt,
		eventType: event.type,
		...definition(event, run)
	}));
}
//#endregion
//#region src/main/frontdoor/collaborationTrace.ts
var maxContentChars = 1600;
var maxSummaryChars = 240;
function bounded(value, limit) {
	if (typeof value !== "string") return "";
	return value.slice(0, limit).replace(/(sk-|api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,}]+/gi, "$1=<redacted>");
}
function estimateTokens(text) {
	return Math.max(1, Math.ceil(text.length / 4));
}
function participantId(node) {
	return node.participantAssignment?.participantId ?? node.adapterId;
}
function message(input) {
	const content = bounded(input.content, maxContentChars);
	const body = {
		...input,
		content,
		context: {
			mode: "bounded",
			chars: content.length,
			estimatedTokens: estimateTokens(content),
			referenceCount: input.referenceCount ?? 0
		}
	};
	return {
		...body,
		messageId: `collab-${hashJson(body).slice(0, 20)}`
	};
}
function resultKind(role) {
	if (role === "proposal") return "proposal";
	if (role === "critic" || role === "review") return "review";
	return "result";
}
function resultStatus(status) {
	if (status === "failed" || status === "invalid" || status === "timeout" || status === "cancelled") return "blocked";
	if (status === "partial") return "waiting";
	return "completed";
}
async function buildCollaborationTrace(runtimeRoot, run, request) {
	const conversationId = `collaboration-${run.runId}`;
	const recipients = run.nodes.map((record) => participantId(record.node)).sort();
	const messages = [message({
		projectRef: request.projectRef,
		conversationId,
		runId: run.runId,
		senderParticipantId: "frontdoor-ai",
		senderRole: "frontdoor",
		recipientParticipantIds: recipients,
		kind: "request",
		status: "posted",
		summary: bounded(request.objective, maxSummaryChars),
		content: request.userInput,
		referenceCount: request.contextReferences.length,
		createdAt: request.receivedAt
	})];
	const resultMessages = await Promise.all(run.nodes.filter((record) => record.resultRef && record.resultHash).map(async (record) => {
		const result = await readJson(await safeRuntimePath(runtimeRoot, record.resultRef));
		const currentParticipant = participantId(record.node);
		const dependencies = result.dependencyResults ?? [];
		const handoffs = dependencies.map((dependency) => message({
			projectRef: request.projectRef,
			conversationId,
			runId: run.runId,
			senderParticipantId: run.nodes.find((candidate) => candidate.node.nodeId === dependency.nodeId)?.node ? participantId(run.nodes.find((candidate) => candidate.node.nodeId === dependency.nodeId).node) : dependency.nodeId,
			senderRole: run.nodes.find((candidate) => candidate.node.nodeId === dependency.nodeId)?.node.role ?? "participant",
			recipientParticipantIds: [currentParticipant],
			kind: "handoff",
			status: "posted",
			summary: `${dependency.nodeId}のbounded Resultを${record.node.nodeId}へ引き渡し`,
			content: dependency.content ?? "",
			nodeId: dependency.nodeId,
			parentMessageId: void 0,
			executionThreadId: record.threadId,
			resultRef: dependency.resultRef,
			resultHash: dependency.resultHash,
			referenceCount: 1,
			createdAt: (/* @__PURE__ */ new Date(Date.parse(result.createdAt) - 1)).toISOString()
		}));
		const current = message({
			projectRef: request.projectRef,
			conversationId,
			runId: run.runId,
			senderParticipantId: currentParticipant,
			senderRole: record.node.role,
			recipientParticipantIds: ["frontdoor-ai"],
			kind: resultKind(record.node.role),
			status: resultStatus(result.status),
			summary: bounded(result.summary, maxSummaryChars),
			content: result.content ?? result.summary,
			nodeId: record.node.nodeId,
			executionThreadId: record.threadId,
			resultRef: record.resultRef,
			resultHash: record.resultHash,
			referenceCount: dependencies.length + request.contextReferences.length,
			createdAt: result.createdAt
		});
		return [...handoffs, current];
	}));
	return [...messages, ...resultMessages.flat()].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.messageId.localeCompare(right.messageId));
}
//#endregion
//#region src/main/frontdoor/goalAlignment.ts
var northStar = "Owner入力 → 窓口AI → ADF → 複数AI → 統合Result → 次の指示";
var ownerGates = [
	"intake",
	"completion-shape",
	"decomposition",
	"dispatch",
	"node-review",
	"question",
	"result-review",
	"completion",
	"artifact-export",
	"candidate-review"
];
function hasDecision(decisions, gate, values) {
	return decisions.some((decision) => decision.gate === gate && values.includes(decision.decision));
}
function actualGate(ownerGate) {
	return ownerGate?.startsWith("awaiting-owner:") ? ownerGate.slice(15) : ownerGate;
}
function signal(code, severity, message) {
	return {
		code,
		severity,
		message
	};
}
function deriveStep(input) {
	const { run, decisions, aggregate } = input;
	const intakeApproved = hasDecision(decisions, "intake", ["proceed"]);
	const shapeApproved = hasDecision(decisions, "completion-shape", ["approve"]);
	const decompositionApproved = hasDecision(decisions, "decomposition", ["approve-selected"]);
	const dispatchApproved = hasDecision(decisions, "dispatch", ["dispatch", "approve-selected"]);
	const resultAccepted = hasDecision(decisions, "result-review", ["accept"]);
	const completed = run.state === "complete" || hasDecision(decisions, "completion", ["complete"]);
	const completedSteps = [];
	if (intakeApproved) completedSteps.push("intake");
	if (shapeApproved && decompositionApproved) completedSteps.push("plan");
	if (dispatchApproved) completedSteps.push("dispatch");
	if (run.nodes.some((node) => node.state === "running" || node.state === "completed" || node.state === "failed" || node.state === "awaiting-question")) completedSteps.push("ai-execution");
	if (run.nodeReview) completedSteps.push("node-review");
	if (aggregate) completedSteps.push("result-review");
	if (resultAccepted) completedSteps.push("completion");
	if (completed) completedSteps.push("completed");
	if (completed) return {
		currentStep: "completed",
		completedSteps,
		nextUnlockedStep: "next-request",
		nextAction: "次のRequestを窓口AIから投入できます。"
	};
	if (aggregate && !resultAccepted) return {
		currentStep: "result-review",
		expectedOwnerGate: "result-review",
		completedSteps,
		nextAction: "OwnerがAggregate ResultとEvidenceを確認します。"
	};
	if (resultAccepted) return {
		currentStep: "completion",
		expectedOwnerGate: "completion",
		completedSteps,
		nextAction: "OwnerがこのRunのCompletionを確認します。"
	};
	if (run.nodeReview) return {
		currentStep: "node-review",
		expectedOwnerGate: "node-review",
		completedSteps,
		nextAction: "OwnerがNode Resultを確認し、継続または停止を判断します。"
	};
	if (run.nodes.some((node) => node.state === "running")) return {
		currentStep: "ai-execution",
		completedSteps,
		nextAction: "複数AI Nodeの実行とResult受領を待ちます。"
	};
	if (!intakeApproved) return {
		currentStep: "intake",
		expectedOwnerGate: "intake",
		completedSteps,
		nextAction: "OwnerがIntakeを確認します。"
	};
	if (!shapeApproved) return {
		currentStep: "plan",
		expectedOwnerGate: "completion-shape",
		completedSteps,
		nextAction: "OwnerがCompletion Shapeを確認します。"
	};
	if (!decompositionApproved) return {
		currentStep: "plan",
		expectedOwnerGate: "decomposition",
		completedSteps,
		nextAction: "Ownerが2Node分解と依存関係を確認します。"
	};
	if (!dispatchApproved) return {
		currentStep: "dispatch",
		expectedOwnerGate: "dispatch",
		completedSteps,
		nextAction: "Owner-approved PacketとDispatch境界を確認します。"
	};
	if (run.state === "ready-for-approval") return {
		currentStep: "dispatch",
		expectedOwnerGate: "dispatch",
		completedSteps,
		nextAction: "承認済みPacketの実Dispatchを開始できます。"
	};
	return {
		currentStep: "ai-execution",
		completedSteps,
		nextAction: "複数AI Nodeの実行とResult受領を待ちます。"
	};
}
function assessGoalAlignment(input) {
	const derived = deriveStep(input);
	const signals = [];
	const actual = actualGate(input.run.ownerGate);
	if (input.run.requestHash !== input.request.inputHash) signals.push(signal("request-hash-mismatch", "error", "RunとRequestのhashが一致しません。"));
	if (input.run.planHash !== input.plan.planHash) signals.push(signal("plan-hash-mismatch", "error", "RunとPlanのhashが一致しません。"));
	if (input.aggregate && input.aggregate.runId !== input.run.runId) signals.push(signal("aggregate-run-mismatch", "error", "Aggregateが別Runに属しています。"));
	for (const node of input.run.nodes) {
		if (node.state !== "completed" && node.state !== "failed") continue;
		if (!node.childJobId || !node.threadId || !node.resultRef || !node.resultHash || !node.evidenceHash) signals.push(signal("node-evidence-gap", "error", `Node ${node.node.nodeId} のJob／Thread／Result／Evidence bindingが不足しています。`));
	}
	if (input.aggregate && input.aggregate.completedNodes.length > 0 && input.evidenceRefs.length === 0) signals.push(signal("aggregate-evidence-gap", "error", "Aggregateに完了NodeがあるのにEvidence参照がありません。"));
	if (actual !== void 0 && ownerGates.includes(actual) && (!derived.expectedOwnerGate || actual !== derived.expectedOwnerGate)) signals.push(signal("owner-gate-projection-stale", "warning", `Ledgerから導出した次のGateは${derived.expectedOwnerGate}ですが、Run投影は${actual}です。`));
	if (input.run.state === "failed" || input.run.state === "cancelled" || input.run.state === "blocked-by-question") signals.push(signal("run-blocked", "error", `Runは${input.run.state}で停止しています。`));
	const dispatchAlreadyApproved = hasDecision(input.decisions, "dispatch", ["dispatch", "approve-selected"]);
	const waitingForOwner = Boolean(derived.expectedOwnerGate) && !(derived.expectedOwnerGate === "dispatch" && dispatchAlreadyApproved);
	const hasError = signals.some((item) => item.severity === "error");
	const hasDrift = signals.some((item) => item.code.endsWith("mismatch") || item.code === "owner-gate-projection-stale");
	return {
		status: hasError && signals.some((item) => item.code === "node-evidence-gap" || item.code === "aggregate-evidence-gap") ? "evidence-gap" : hasError && signals.some((item) => item.code === "run-blocked") ? "blocked" : hasDrift ? "drift" : waitingForOwner ? "awaiting-owner" : "aligned",
		currentStep: derived.currentStep,
		expectedOwnerGate: derived.expectedOwnerGate,
		actualOwnerGate: actual,
		completedSteps: derived.completedSteps,
		nextUnlockedStep: derived.nextUnlockedStep,
		nextAction: derived.nextAction,
		signals,
		goal: {
			northStar,
			finalFlowContribution: input.request.scope.inScope.includes("next-request") ? "Cycle 1のEvidenceを根拠に、窓口AIが同じ入口から次のRequestへ進む" : "窓口AIのRequestをADF経由で複数AIのResultとEvidenceへ接続する",
			verticalSliceOutcome: input.request.requestedOutput
		}
	};
}
//#endregion
//#region src/main/frontdoor/orchestrator.ts
function childTaskId(requestId, nodeId) {
	return `${requestId}::${nodeId}`;
}
function packetContextReferences(packet) {
	return [packet.context.githubTask, ...packet.context.obsidianContext];
}
function changedNodeRecords(before, after) {
	return after.nodes.filter((record) => {
		const previous = before.nodes.find((candidate) => candidate.node.nodeId === record.node.nodeId);
		return !previous || hashJson(previous) !== hashJson(record);
	});
}
function assertPacketMatchesNode(request, run, node, packet) {
	validateApprovedTask(packet);
	const errors = [];
	if (packet.taskId !== node.childTaskId) errors.push(`packet taskId mismatch for ${node.node.nodeId}`);
	if (packet.objective !== node.node.objective) errors.push(`packet objective mismatch for ${node.node.nodeId}`);
	if (hashJson(packet.scope) !== hashJson(node.node.scope)) errors.push(`packet scope mismatch for ${node.node.nodeId}`);
	const packetReferences = packetContextReferences(packet);
	if (!node.node.contextReferences.every((reference) => packetReferences.includes(reference))) errors.push(`packet context mismatch for ${node.node.nodeId}`);
	if (!packetReferences.every((reference) => request.contextReferences.includes(reference))) errors.push(`packet context exceeds parent request for ${node.node.nodeId}`);
	if (hashJson(packet.context) !== packet.contextHash) errors.push(`packet context hash mismatch for ${node.node.nodeId}`);
	if (!packet.frontdoorBinding || packet.frontdoorBinding.runId !== run.runId || packet.frontdoorBinding.requestHash !== run.requestHash || packet.frontdoorBinding.planHash !== run.planHash || packet.frontdoorBinding.nodeId !== node.node.nodeId) errors.push(`packet Frontdoor binding is missing or mismatched for ${node.node.nodeId}`);
	if (run.runKind === "implementation" && hashJson(packet.implementationBinding) !== hashJson(run.implementationBinding)) errors.push(`packet implementation binding mismatch for ${node.node.nodeId}`);
	if (packet.adapterPlan.selections.length !== 1) errors.push(`node packet must contain one adapter selection: ${node.node.nodeId}`);
	const selection = packet.adapterPlan.selections[0];
	if (!selection || selection.adapterId !== node.node.adapterId || selection.role !== node.node.role) errors.push(`packet adapter plan mismatch for ${node.node.nodeId}`);
	if (!node.node.capabilities.every((capability) => packet.approval.capabilities.includes(capability))) errors.push(`packet capability mismatch for ${node.node.nodeId}`);
	if (packet.taskId.startsWith(`${request.requestId}::`) === false) errors.push(`packet task is not a child of the Frontdoor request: ${node.node.nodeId}`);
	if (errors.length) throw new Error(`Approved child packet rejected: ${errors.join("; ")}`);
}
var FrontdoorOrchestrator = class {
	relay;
	runtimeRoot;
	clock;
	ownerGates;
	constructor({ relay, clock = () => /* @__PURE__ */ new Date() }) {
		this.relay = relay;
		this.runtimeRoot = relay.runtimeRoot;
		this.clock = clock;
		this.ownerGates = new FrontdoorOwnerGateService({
			runtimeRoot: this.runtimeRoot,
			clock
		});
	}
	async approveDispatch(runId, nodeIds, approvedBy = "Project Owner", note) {
		return this.ownerGates.approveDispatch(runId, nodeIds, approvedBy, note);
	}
	async approveIntake(runId, approvedBy = "Project Owner", note) {
		return this.ownerGates.approveIntake(runId, approvedBy, note);
	}
	async approveCompletionShape(runId, approvedBy = "Project Owner", note) {
		return this.ownerGates.approveCompletionShape(runId, approvedBy, note);
	}
	async approveDecomposition(runId, approvedBy = "Project Owner", note) {
		return this.ownerGates.approveDecomposition(runId, approvedBy, note);
	}
	async answerQuestion(runId, question, approvedBy = "Project Owner", answerRef, note) {
		return this.ownerGates.answerQuestion(runId, question, approvedBy, answerRef, note);
	}
	async reviewResult(runId, approvedBy = "Project Owner", decision = "accept", note) {
		return this.ownerGates.reviewResult(runId, approvedBy, decision, note);
	}
	async reviewNode(runId, nodeId, approvedBy = "Project Owner", decision = "continue", note) {
		return this.ownerGates.reviewNode(runId, nodeId, approvedBy, decision, note);
	}
	async completeRun(runId, approvedBy = "Project Owner", note) {
		return this.ownerGates.completeRun(runId, approvedBy, note);
	}
	async exportWorkPlaneArtifact(runId, approvedBy = "Project Owner", note) {
		return this.ownerGates.exportWorkPlaneArtifact(runId, approvedBy, note);
	}
	async inspectWorkPlaneArtifact(runId) {
		return this.ownerGates.inspectWorkPlaneArtifact(runId);
	}
	async createRun(requestInput, planInput) {
		const request = createFrontdoorRequest(requestInput, this.clock().toISOString());
		const plan = createDecompositionPlan(request, planInput);
		const now = this.clock().toISOString();
		const runId = `run-${hashJson([
			request.requestId,
			request.inputHash,
			plan.planHash
		]).slice(0, 20)}`;
		const nodes = plan.nodes.map((node) => ({
			node,
			state: "queued",
			childTaskId: childTaskId(request.requestId, node.nodeId),
			questionIds: [],
			attempt: 0
		}));
		const run = {
			runId,
			requestId: request.requestId,
			requestHash: request.inputHash,
			planHash: plan.planHash,
			state: "ready-for-approval",
			nodes,
			approvalIds: [],
			openQuestionIds: [],
			createdAt: now,
			updatedAt: now,
			ownerGate: "awaiting-owner:intake",
			...request.runKind ? { runKind: request.runKind } : {},
			...request.implementationBinding ? { implementationBinding: request.implementationBinding } : {},
			...request.sourceCandidateBinding ? { sourceCandidateBinding: request.sourceCandidateBinding } : {}
		};
		try {
			await writeRunBundleExclusive(this.runtimeRoot, request, plan, run);
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
			const existing = await readProjectedRun(this.runtimeRoot, runId);
			const existingRequest = await readRequest(this.runtimeRoot, runId);
			const existingPlan = await readPlan(this.runtimeRoot, runId);
			await assertRunIntegrity(this.runtimeRoot, existing, existingRequest, existingPlan);
			assertRunEventConsistency(existing, await readRunEvents(this.runtimeRoot, runId));
			if (existing.requestHash !== request.inputHash || existing.planHash !== plan.planHash) throw new Error("Frontdoor run collision has incompatible hashes");
			return existing;
		}
		await recordRunEvent(this.runtimeRoot, runId, "frontdoor.run-created", {
			requestId: request.requestId,
			planHash: plan.planHash,
			nodeIds: plan.nodes.map((node) => node.nodeId),
			snapshot: run
		});
		await recordRunEvent(this.runtimeRoot, runId, "frontdoor.owner-gate-opened", {
			gate: "intake",
			targetHash: request.inputHash
		});
		return run;
	}
	async executeApprovedRun(runId, packets, options = {}) {
		const claim = await claimRun(this.runtimeRoot, runId, `orchestrator-${process.pid}`);
		try {
			let run = await readProjectedRun(this.runtimeRoot, runId);
			if (run.state !== "ready-for-approval") throw new Error(`Frontdoor run is not ready for approval: ${run.state}`);
			const request = await readRequest(this.runtimeRoot, runId);
			const plan = await readPlan(this.runtimeRoot, runId);
			await assertRunIntegrity(this.runtimeRoot, run, request, plan);
			assertRunEventConsistency(run, await readRunEvents(this.runtimeRoot, runId));
			const packetIds = Object.keys(packets).sort();
			const nodeIds = run.nodes.map((record) => record.node.nodeId).sort();
			if (packetIds.join("|") !== nodeIds.join("|")) throw new Error("approved child packet set does not exactly match the DecompositionPlan");
			const packetHashes = Object.fromEntries(run.nodes.map((record) => [record.node.nodeId, hashJson(packets[record.node.nodeId])]));
			const requiresPacketBinding = options.requirePacketBinding === true || run.nodes.some((record) => getAdapterProfile(record.node.adapterId).connection === "local-http");
			const dispatchDecision = await assertDispatchApproved(this.runtimeRoot, runId, nodeIds, packetHashes, requiresPacketBinding);
			for (const node of run.nodes) {
				const packet = packets[node.node.nodeId];
				if (packet.frontdoorBinding?.requestHash !== run.requestHash || packet.frontdoorBinding?.planHash !== run.planHash || packet.frontdoorBinding?.runId !== run.runId) throw new Error(`packet Frontdoor binding mismatch for ${node.node.nodeId}`);
				assertPacketMatchesNode(request, run, node, packet);
			}
			const questions = [];
			const evidenceRefs = [];
			let executedNodeId;
			execution: while (run.nodes.some((node) => node.state === "queued")) {
				const ready = readyNodeIds(run.nodes);
				if (ready.length === 0) {
					run = {
						...run,
						nodes: run.nodes.map((node) => node.state === "queued" ? {
							...node,
							state: "cancelled",
							error: "dependency failed or was cancelled"
						} : node),
						updatedAt: this.clock().toISOString()
					};
					await writeRun(this.runtimeRoot, run);
					await recordRunEvent(this.runtimeRoot, runId, "frontdoor.node-failed", {
						nodeId: "dependency-resolution",
						nodeRecords: run.nodes,
						runState: run.state,
						error: "dependency failed or was cancelled"
					});
					break execution;
				}
				const nodeId = ready[0];
				executedNodeId = nodeId;
				const record = run.nodes.find((node) => node.node.nodeId === nodeId);
				const dependencyResults = [];
				for (const dependencyId of record.node.dependsOn) {
					const dependency = run.nodes.find((node) => node.node.nodeId === dependencyId);
					if (!dependency?.resultRef || !dependency.resultStatus || !dependency.resultHash) throw new Error(`dependency result is not proven for ${dependencyId}`);
					const envelope = await readJson(node_path.default.join(this.runtimeRoot, dependency.resultRef));
					if (!dependency.resultRef.startsWith("threads/") || dependency.resultRef.includes("..") || hashJson(envelope) !== dependency.resultHash) throw new Error(`dependency result provenance mismatch for ${dependencyId}`);
					if (envelope.taskId !== dependency.childTaskId || envelope.jobId !== dependency.childJobId || envelope.inputHash !== dependency.childInputHash || envelope.orchestrationRunId !== runId) throw new Error(`dependency result identity mismatch for ${dependencyId}`);
					dependencyResults.push({
						runId,
						nodeId: dependencyId,
						resultRef: dependency.resultRef,
						resultHash: dependency.resultHash,
						status: dependency.resultStatus,
						...envelope.content ? { content: envelope.content.slice(0, 1e3) } : {}
					});
				}
				let shouldAutoContinue = false;
				try {
					await this.relay.assertAdapterReadyForDispatch(record.node.adapterId);
				} catch (error) {
					if (!run.nodes.some((candidate) => candidate.state === "completed" || candidate.state === "awaiting-question")) throw error;
					const message = String(error.message ?? error).slice(0, 200);
					const executionRun = run.state === "ready-for-approval" ? {
						...run,
						state: "running",
						ownerGate: "running"
					} : run;
					const beforeFailure = executionRun;
					run = cancelDependents({
						...executionRun,
						nodes: executionRun.nodes.map((candidate) => candidate.node.nodeId === nodeId ? {
							...candidate,
							state: "failed",
							error: message
						} : candidate),
						updatedAt: this.clock().toISOString()
					}, nodeId, "dependency failed");
					await writeRun(this.runtimeRoot, run);
					await recordRunEvent(this.runtimeRoot, runId, "frontdoor.node-failed", {
						nodeId,
						error: message,
						nodeRecords: changedNodeRecords(beforeFailure, run),
						runState: run.state
					});
					break execution;
				}
				if (run.state === "ready-for-approval") {
					run = {
						...run,
						state: "running",
						ownerGate: "running",
						updatedAt: this.clock().toISOString(),
						approvalIds: run.nodes.map((node) => packets[node.node.nodeId].approval.approvalId)
					};
					await writeRun(this.runtimeRoot, run);
					await recordRunEvent(this.runtimeRoot, runId, "frontdoor.approval-bound", {
						approvalIds: run.approvalIds,
						decisionId: dispatchDecision.decisionId,
						targetHash: dispatchDecision.targetHash,
						nodeIds,
						packetHashes
					});
				}
				run = {
					...run,
					nodes: run.nodes.map((node) => node.node.nodeId === nodeId ? {
						...node,
						state: "running",
						attempt: node.attempt + 1
					} : node),
					updatedAt: this.clock().toISOString()
				};
				await writeRun(this.runtimeRoot, run);
				await recordRunEvent(this.runtimeRoot, runId, "frontdoor.node-started", {
					nodeId,
					childTaskId: record.childTaskId,
					attempt: run.nodes.find((node) => node.node.nodeId === nodeId)?.attempt ?? 1
				});
				try {
					const thread = await this.relay.startThread(packets[nodeId], {
						title: record.node.objective,
						maxTurns: 1
					});
					const completed = await this.relay.continueJob(thread.threadId, record.node.adapterId, dependencyResults, runId);
					const turn = completed.turns[completed.turns.length - 1];
					const nodeQuestions = questionsFromThread(runId, record, completed);
					questions.push(...nodeQuestions);
					if (turn?.resultEnvelopeRef) evidenceRefs.push(turn.resultEnvelopeRef);
					const nextState = turn?.status === "failed" || turn?.status === "invalid" ? "failed" : nodeQuestions.some((question) => question.status === "open" && question.blocking) && plan.aggregationPolicy === "stop-on-blocking-question" ? "awaiting-question" : "completed";
					let resultHash;
					let evidenceHash;
					let resultEnvelope;
					if (turn?.resultEnvelopeRef) {
						resultEnvelope = await readJson(node_path.default.join(this.runtimeRoot, turn.resultEnvelopeRef));
						resultHash = hashJson(resultEnvelope);
					}
					if (completed.threadId) evidenceHash = hashJson(await readJson(node_path.default.join(this.runtimeRoot, `threads/${completed.threadId}/evidence-links.json`)));
					const beforeCompletion = run;
					run = {
						...run,
						nodes: run.nodes.map((node) => node.node.nodeId === nodeId ? {
							...node,
							state: nextState,
							childJobId: completed.jobId,
							threadId: completed.threadId,
							childInputHash: completed.inputHash,
							resultStatus: turn?.status,
							resultRef: turn?.resultEnvelopeRef,
							resultHash,
							evidenceHash,
							questionIds: nodeQuestions.map((question) => question.questionId),
							error: nextState === "failed" ? turn?.content : void 0
						} : node),
						updatedAt: this.clock().toISOString()
					};
					if (nextState === "failed") run = cancelDependents(run, nodeId, "dependency failed");
					if (nextState === "awaiting-question") run = {
						...run,
						state: "blocked-by-question",
						nodes: run.nodes.map((node) => node.state === "queued" ? {
							...node,
							state: "cancelled",
							error: "blocked by Owner question"
						} : node)
					};
					shouldAutoContinue = nodeReviewPolicyForPlan(plan) === "auto-continue-safe" && nextState === "completed" && resultEnvelope?.status === "success" && resultEnvelope.verification.length > 0 && resultEnvelope.verification.every((item) => item.status === "pass") && resultEnvelope.risks.length === 0 && nodeQuestions.every((question) => question.status !== "open") && run.nodes.some((node) => node.state === "queued") && readyNodeIds(run.nodes).length > 0;
					await writeRun(this.runtimeRoot, run);
					await recordRunEvent(this.runtimeRoot, runId, "frontdoor.node-completed", {
						nodeId,
						threadId: completed.threadId,
						resultStatus: turn?.status,
						nodeState: nextState,
						questionIds: nodeQuestions.map((question) => question.questionId),
						autoContinued: shouldAutoContinue,
						nodeRecords: changedNodeRecords(beforeCompletion, run),
						runState: run.state
					});
				} catch (error) {
					const message = String(error.message ?? error).slice(0, 200);
					const beforeFailure = run;
					run = cancelDependents({
						...run,
						nodes: run.nodes.map((node) => node.node.nodeId === nodeId ? {
							...node,
							state: "failed",
							error: message
						} : node),
						updatedAt: this.clock().toISOString()
					}, nodeId, "dependency failed");
					await writeRun(this.runtimeRoot, run);
					await recordRunEvent(this.runtimeRoot, runId, "frontdoor.node-failed", {
						nodeId,
						error: message,
						nodeRecords: changedNodeRecords(beforeFailure, run),
						runState: run.state
					});
				}
				if (run.nodes.some((node) => node.state === "queued")) {
					if (shouldAutoContinue) continue execution;
					break execution;
				}
			}
			const completedNode = executedNodeId ? run.nodes.find((node) => node.node.nodeId === executedNodeId) : void 0;
			const nextNodeIds = readyNodeIds(run.nodes);
			if (run.nodes.some((node) => node.state === "queued") && nextNodeIds.length > 0 && completedNode) {
				const nextReview = {
					nodeId: completedNode.node.nodeId,
					resultRef: completedNode.resultRef,
					resultHash: completedNode.resultHash,
					status: completedNode.resultStatus,
					verification: completedNode.resultRef ? (await readJson(node_path.default.join(this.runtimeRoot, completedNode.resultRef))).verification : [],
					risks: completedNode.resultRef ? (await readJson(node_path.default.join(this.runtimeRoot, completedNode.resultRef))).risks : [],
					nextNodeIds,
					targetHash: nodeReviewTargetHash(run, completedNode.node.nodeId, completedNode.resultHash, nextNodeIds)
				};
				if (completedNode.resultRef) {
					const envelope = await readJson(node_path.default.join(this.runtimeRoot, completedNode.resultRef));
					nextReview.summary = envelope.summary;
					nextReview.content = envelope.content?.slice(0, 4e3);
				}
				run = {
					...run,
					state: "awaiting-owner",
					ownerGate: "awaiting-owner:node-review",
					nodeReview: nextReview,
					updatedAt: this.clock().toISOString()
				};
				await writeRun(this.runtimeRoot, run);
				await recordRunEvent(this.runtimeRoot, runId, "frontdoor.node-review-opened", {
					nodeId: nextReview.nodeId,
					nodeReview: nextReview,
					runState: run.state
				});
				return {
					...buildFrontdoorReturn(request, aggregateResults(runId, run.nodes, questions, [.../* @__PURE__ */ new Set([...evidenceRefs, ...run.nodes.flatMap((node) => node.resultRef ? [node.resultRef] : [])])], this.clock().toISOString())),
					status: "partial",
					summary: `${completedNode.node.nodeId}のResultを記録しました。次のNodeへ進むかOwnerが判断してください。`,
					answer: `${completedNode.node.nodeId}のResultを記録しました。`,
					nextAction: "OwnerがNode Resultを確認し、継続または停止を判断する"
				};
			}
			const aggregate = aggregateResults(runId, run.nodes, questions, [.../* @__PURE__ */ new Set([...evidenceRefs, ...run.nodes.flatMap((node) => node.resultRef ? [node.resultRef] : [])])], this.clock().toISOString());
			const aggregateRef = await writeAggregate(this.runtimeRoot, runId, aggregate);
			run = {
				...run,
				state: "awaiting-owner",
				ownerGate: "awaiting-owner:result-review",
				openQuestionIds: aggregate.openQuestions.map((question) => question.questionId),
				aggregateResultRef: aggregateRef,
				updatedAt: this.clock().toISOString()
			};
			await writeRun(this.runtimeRoot, run);
			if (aggregate.openQuestions.length > 0) await recordRunEvent(this.runtimeRoot, runId, "frontdoor.question-opened", {
				questionIds: run.openQuestionIds,
				aggregateRef,
				aggregateHash: hashJson(aggregate),
				runState: run.state
			});
			else await recordRunEvent(this.runtimeRoot, runId, "frontdoor.completion-proposed", {
				aggregateRef,
				aggregateHash: hashJson(aggregate),
				openQuestionIds: [],
				runState: run.state
			});
			return buildFrontdoorReturn(request, aggregate);
		} finally {
			await releaseRun(this.runtimeRoot, runId, claim.token);
		}
	}
	async recoverRun(runId) {
		const existingClaim = await readRunClaim(this.runtimeRoot, runId);
		if (existingClaim) {
			if (existingClaim.hostname !== (process.env.HOSTNAME ?? "unknown") || !Number.isInteger(existingClaim.pid) || existingClaim.pid <= 0 || !existingClaim.token) throw new Error("Frontdoor run claim cannot be verified safely");
			try {
				process.kill(existingClaim.pid, 0);
				throw new Error("Frontdoor run is still claimed by a live process");
			} catch (error) {
				if (error.code !== "ESRCH") throw error;
				await releaseRun(this.runtimeRoot, runId, existingClaim.token);
			}
		}
		const claim = await claimRun(this.runtimeRoot, runId, `recovery-${process.pid}`);
		try {
			const request = await readRequest(this.runtimeRoot, runId);
			const plan = await readPlan(this.runtimeRoot, runId);
			const events = await readRunEvents(this.runtimeRoot, runId);
			const run = await replayRunFromEvents(this.runtimeRoot, runId);
			await assertRunIntegrity(this.runtimeRoot, run, request, plan, false);
			assertRunEventConsistency(run, events);
			if (events.length === 0) throw new Error("Frontdoor run has no ledger events; refusing recovery");
			const started = new Set(events.filter((event) => event.type === "frontdoor.node-started").map((event) => String(event.payload.nodeId)));
			const completed = new Set(events.filter((event) => ["frontdoor.node-completed", "frontdoor.node-failed"].includes(event.type)).map((event) => String(event.payload.nodeId)));
			const interrupted = new Set([...started].filter((nodeId) => !completed.has(nodeId)));
			const recovered = run.state === "running" || interrupted.size > 0 ? {
				...run,
				state: "awaiting-owner",
				ownerGate: "awaiting-owner:dispatch",
				nodes: run.nodes.map((node) => node.state === "running" || interrupted.has(node.node.nodeId) ? {
					...node,
					state: "recovery-needed",
					error: "process interrupted before node completion"
				} : node),
				updatedAt: this.clock().toISOString()
			} : run;
			if (recovered !== run) {
				await writeRun(this.runtimeRoot, recovered);
				await recordRunEvent(this.runtimeRoot, runId, "frontdoor.run-recovery-needed", {
					nodeIds: recovered.nodes.filter((node) => node.state === "recovery-needed").map((node) => node.node.nodeId),
					nodeRecords: recovered.nodes.filter((node) => node.state === "recovery-needed"),
					runState: recovered.state
				});
			}
			return recovered;
		} finally {
			await releaseRun(this.runtimeRoot, runId, claim.token);
		}
	}
	async stopRun(runId, note = "Owner stopped Frontdoor run", approvedBy = "Project Owner") {
		const claim = await claimRun(this.runtimeRoot, runId, `stop-${process.pid}`);
		try {
			const run = await readProjectedRun(this.runtimeRoot, runId);
			const request = await readRequest(this.runtimeRoot, runId);
			const plan = await readPlan(this.runtimeRoot, runId);
			await assertRunIntegrity(this.runtimeRoot, run, request, plan);
			assertRunEventConsistency(run, await readRunEvents(this.runtimeRoot, runId));
			if ([
				"complete",
				"partial",
				"failed",
				"cancelled"
			].includes(run.state)) return run;
			const gate = run.ownerGate?.startsWith("awaiting-owner:") ? run.ownerGate.slice(15) : "dispatch";
			const decision = buildDecisionEnvelope(run, gate, "stop", hashJson({
				runId,
				requestId: run.requestId,
				planHash: run.planHash,
				gate
			}), approvedBy, this.clock().toISOString(), { note });
			await recordRunEvent(this.runtimeRoot, runId, "frontdoor.owner-decision-recorded", { decision });
			const stopped = {
				...run,
				state: "cancelled",
				ownerGate: "stopped",
				nodes: run.nodes.map((node) => [
					"queued",
					"ready",
					"running",
					"recovery-needed",
					"awaiting-question"
				].includes(node.state) ? {
					...node,
					state: "cancelled",
					error: note
				} : node),
				updatedAt: this.clock().toISOString()
			};
			await writeRun(this.runtimeRoot, stopped);
			await recordRunEvent(this.runtimeRoot, runId, "frontdoor.run-stopped", {
				note,
				nodeRecords: stopped.nodes,
				runState: stopped.state
			});
			return stopped;
		} finally {
			await releaseRun(this.runtimeRoot, runId, claim.token);
		}
	}
	async getRun(runId) {
		const run = await readProjectedRun(this.runtimeRoot, runId);
		const request = await readRequest(this.runtimeRoot, runId);
		const plan = await readPlan(this.runtimeRoot, runId);
		await assertRunIntegrity(this.runtimeRoot, run, request, plan);
		assertRunEventConsistency(run, await readRunEvents(this.runtimeRoot, runId));
		return run;
	}
	async inspectRun(runId) {
		const run = await this.getRun(runId);
		const [request, plan, events] = await Promise.all([
			readRequest(this.runtimeRoot, runId),
			readPlan(this.runtimeRoot, runId),
			readRunEvents(this.runtimeRoot, runId)
		]);
		const participantEvidence = await listParticipantEvidence(this.runtimeRoot, runId);
		let aggregate;
		if (run.aggregateResultRef) {
			if (!run.aggregateResultRef.startsWith("frontdoor-runs/") || run.aggregateResultRef.includes("..") || node_path.default.isAbsolute(run.aggregateResultRef)) throw new Error("Frontdoor Aggregate reference is outside the Runtime boundary");
			aggregate = await readJson(node_path.default.join(this.runtimeRoot, run.aggregateResultRef));
			if (aggregate.runId !== runId) throw new Error("Frontdoor Aggregate belongs to another Run");
			const proposed = events.find((event) => event.type === "frontdoor.completion-proposed" && event.payload.aggregateRef === run.aggregateResultRef);
			if (!proposed || proposed.payload.aggregateHash !== hashJson(aggregate)) throw new Error("Frontdoor Aggregate does not match its proposed Evidence");
		}
		const inspection = {
			run,
			request,
			plan,
			decisions: events.filter((event) => event.type === "frontdoor.owner-decision-recorded").map((event) => event.payload.decision),
			aggregate,
			aggregateHash: aggregate ? hashJson(aggregate) : void 0,
			workPlaneArtifact: latestWorkPlaneArtifactManifest(events),
			participantEvidence,
			evidenceRefs: aggregate?.evidenceRefs ?? [],
			openQuestions: aggregate?.openQuestions ?? [],
			nextAction: aggregate?.nextAction ?? run.ownerGate ?? "awaiting-owner",
			eventCount: events.length,
			nodeTargetHashes: Object.fromEntries(run.nodes.map((record) => [record.node.nodeId, nodeTargetHash(run, record)])),
			nodeReview: run.nodeReview,
			activities: buildActivityTrace(events, run),
			collaborationMessages: await buildCollaborationTrace(this.runtimeRoot, run, request)
		};
		inspection.goalAlignment = assessGoalAlignment(inspection);
		inspection.nextAction = inspection.goalAlignment.nextAction;
		return inspection;
	}
	async getOpenQuestion(runId, questionId) {
		const question = (await this.inspectRun(runId)).openQuestions.find((candidate) => candidate.questionId === questionId && candidate.status === "open");
		if (!question) throw new Error(`current open Question not found: ${questionId}`);
		return question;
	}
	listReviewableCandidates() {
		return this.ownerGates.listReviewableCandidates();
	}
	inspectCandidate(candidateId) {
		return this.ownerGates.inspectCandidate(candidateId);
	}
	startCandidateReview(candidateId) {
		return this.ownerGates.startCandidateReview(candidateId);
	}
	reviewCandidate(input) {
		return this.ownerGates.reviewCandidate(input);
	}
};
function cancelDependents(run, failedNodeId, reason) {
	const blocked = /* @__PURE__ */ new Set([failedNodeId]);
	let changed = true;
	const nodes = run.nodes.map((node) => ({ ...node }));
	while (changed) {
		changed = false;
		for (const node of nodes) if (node.state === "queued" && node.node.dependsOn.some((dependency) => blocked.has(dependency))) {
			node.state = "cancelled";
			node.error = reason;
			blocked.add(node.node.nodeId);
			changed = true;
		}
	}
	return {
		...run,
		nodes
	};
}
//#endregion
//#region src/main/frontdoor/planner.ts
function supportedCapabilities(request) {
	const capabilities = request.constraints.allowedCapabilities.filter((capability) => capability === "read" || capability === "propose");
	if (capabilities.length === 0) throw new Error("deterministic planner requires read or propose capability");
	return capabilities;
}
function profileSnapshot(adapterIds) {
	return hashJson(adapterIds.map((adapterId) => getAdapterProfile(adapterId)));
}
function assertFakeProfile(adapterId, role) {
	const profile = getAdapterProfile(adapterId);
	if (profile.status !== "available" || profile.dataPolicy !== "local-only" || !profile.roles.includes(role)) throw new Error(`deterministic planner adapter is unavailable for ${role}: ${adapterId}`);
}
var DeterministicFakePlanner = class {
	plannerId = "fake-planner";
	version = "v1";
	async propose(request) {
		const capabilities = supportedCapabilities(request);
		assertFakeProfile("fake-ai-a", "proposal");
		const nodes = [{
			nodeId: "proposal",
			objective: request.objective,
			role: "proposal",
			adapterId: "fake-ai-a",
			scope: request.scope,
			contextReferences: request.contextReferences,
			acceptance: [request.requestedOutput],
			stopConditions: ["Scope外要求", "Owner承認なしの実行"],
			capabilities,
			dependsOn: [],
			depth: 1
		}];
		if (request.constraints.maxNodes > 1 && request.constraints.maxDepth > 1) {
			assertFakeProfile("fake-ai-b", "critic");
			nodes.push({
				nodeId: "critic",
				objective: `Proposalを検証する: ${request.objective}`,
				role: "critic",
				adapterId: "fake-ai-b",
				scope: request.scope,
				contextReferences: request.contextReferences,
				acceptance: ["Proposalの不足・リスク・前提を返す"],
				stopConditions: ["Scope外要求", "Owner承認なしの実行"],
				capabilities,
				dependsOn: ["proposal"],
				depth: 2
			});
		}
		const plan = createDecompositionPlan(request, {
			planId: `planner-${request.requestId}`,
			requestId: request.requestId,
			version: 1,
			nodes,
			aggregationPolicy: "stop-on-blocking-question",
			nodeReviewPolicy: "auto-continue-safe"
		});
		return {
			plannerId: this.plannerId,
			plannerVersion: this.version,
			requestId: request.requestId,
			requestHash: request.inputHash,
			plan,
			assumptions: [
				"Fake AdapterによるProposal／Criticの最小構成",
				"実AI、外部送信、Work Plane操作は行わない",
				"Plan案はOwner確認後にのみ既存Prepareへ渡す"
			],
			risks: ["Fake PlannerのPlan品質は実AI Plannerの品質を代表しない"],
			registrySnapshotHash: profileSnapshot(nodes.map((node) => node.adapterId)),
			generatedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
	}
};
//#endregion
//#region src/main/index.ts
var mainWindow;
/** The app's name. Cosmetic only — see `runtimeRootPath` for why it cannot move the data. */
var productName = "ADF";
/**
* Where the Ledger, Runs, and Evidence live.
*
* Pinned to a literal directory name instead of being derived from the app's name. It used to be
* `app.getPath('userData')`, which happened to resolve to the package name rather than the display
* name only because `app.setName` runs after Electron has already fixed the path. That made the
* data location depend on Electron's start-up ordering, so renaming the app could silently orphan
* every Run — and the MCP server, which is handed `--runtime-root` explicitly, would still be
* reading the old directory. Pinning it keeps both entrances pointed at the same place.
*
* `ADF_RUNTIME_ROOT` overrides it for tests and for running against an isolated runtime.
*/
function runtimeRootPath() {
	const override = process.env.ADF_RUNTIME_ROOT?.trim();
	if (override) return node_path.default.resolve(override);
	return node_path.default.join(electron.app.getPath("appData"), "adf-task-board", "adf-runtime");
}
/** Marks the development window so it can never be mistaken for the packaged app again. */
function windowTitle() {
	return electron.app.isPackaged ? productName : `${productName}（開発版）`;
}
var allowedSources = Object.fromEntries(Object.entries(canonicalSources).map(([sourceId, source]) => [sourceId, {
	rootPath: rootFor(sourceId),
	relativePath: source.relativePath
}]));
function createWindow() {
	mainWindow = new electron.BrowserWindow({
		title: windowTitle(),
		width: 1440,
		height: 920,
		minWidth: 1e3,
		minHeight: 700,
		webPreferences: {
			preload: node_path.default.join(__dirname, "../preload/index.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			webSecurity: true,
			webviewTag: false
		}
	});
	mainWindow.setTitle(windowTitle());
	mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
	const rendererUrl = safeDevelopmentRendererUrl(process.env.ELECTRON_RENDERER_URL, electron.app.isPackaged);
	if (rendererUrl) mainWindow.loadURL(rendererUrl);
	else mainWindow.loadFile(node_path.default.join(__dirname, "../renderer/index.html"));
}
electron.app.whenReady().then(async () => {
	electron.app.setName(productName);
	electron.session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
	const isDevelopmentRenderer = !electron.app.isPackaged && Boolean(process.env.ELECTRON_RENDERER_URL);
	electron.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
		const contentSecurityPolicy = isDevelopmentRenderer ? "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://localhost:* ws://localhost:*; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'" : "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'";
		callback({ responseHeaders: {
			...details.responseHeaders,
			"Content-Security-Policy": [contentSecurityPolicy]
		} });
	});
	electron.ipcMain.handle("board:open-canonical-source", (_event, sourceId) => openResolvedCanonicalSource(sourceId, allowedSources, electron.shell.openPath));
	const relay = createLiveRelay(runtimeRootPath());
	const frontdoor = new FrontdoorOrchestrator({ relay });
	const planner = new DeterministicFakePlanner();
	electron.ipcMain.handle("relay:list", () => listThreads(relay));
	electron.ipcMain.handle("relay:get", (_event, threadId) => getThread(relay, threadId));
	electron.ipcMain.handle("relay:inspect-artifacts", (_event, threadId) => inspectLiveArtifacts(relay, threadId));
	electron.ipcMain.handle("relay:approved-tasks", () => listApprovedTaskIds(relay));
	electron.ipcMain.handle("relay:start", (_event, taskId) => startApprovedThread(relay, taskId));
	electron.ipcMain.handle("relay:send-first", (_event, threadId) => sendFirstTurn(relay, threadId));
	electron.ipcMain.handle("relay:continue", (_event, threadId, note) => continueThread(relay, threadId, note));
	electron.ipcMain.handle("relay:decide", (_event, threadId, action, note) => decideThread(relay, threadId, action, note));
	electron.ipcMain.handle("relay:recover", (_event, threadId, action, note) => recoverThread(relay, threadId, action, note));
	electron.ipcMain.handle("relay:preflight-external", (_event, threadId, adapterId) => preflightExternal(relay, threadId, adapterId));
	electron.ipcMain.handle("relay:send-external", (_event, threadId, adapterId) => sendExternal(relay, threadId, adapterId));
	electron.ipcMain.handle("relay:cancel-external", (_event, threadId, note) => cancelExternal(relay, threadId, note));
	electron.ipcMain.handle("relay:external-state", (_event, threadId) => externalSendState(relay, threadId));
	electron.ipcMain.handle("relay:external-adapters", () => listExternalAdapters(relay));
	electron.ipcMain.handle("relay:ollama-readiness", () => ollamaReadiness());
	electron.ipcMain.handle("relay:local-readiness", (_event, adapterId) => localReadiness(relay, adapterId));
	electron.ipcMain.handle("frontdoor:list", () => listFrontdoorRuns(frontdoor));
	electron.ipcMain.handle("frontdoor:propose-plan", (_event, input) => proposeFrontdoorPlan(planner, input));
	electron.ipcMain.handle("frontdoor:prepare", (_event, input) => prepareFrontdoorRun(frontdoor, input));
	electron.ipcMain.handle("frontdoor:inspect", (_event, runId) => inspectFrontdoorRun(frontdoor, runId));
	electron.ipcMain.handle("frontdoor:inspect-artifact", (_event, runId) => inspectFrontdoorArtifact(frontdoor, runId));
	electron.ipcMain.handle("frontdoor:approve", (_event, input) => approveFrontdoorRun(frontdoor, input));
	electron.ipcMain.handle("frontdoor:dispatch", (_event, runId) => dispatchFrontdoorRun(frontdoor, runId, { requirePacketBinding: true }));
	electron.ipcMain.handle("frontdoor:review-node", (_event, input) => reviewFrontdoorNode(frontdoor, input));
	electron.ipcMain.handle("frontdoor:answer", (_event, input) => answerFrontdoorQuestion(frontdoor, input));
	electron.ipcMain.handle("frontdoor:review-result", (_event, input) => reviewFrontdoorResult(frontdoor, input));
	electron.ipcMain.handle("frontdoor:complete", (_event, input) => completeFrontdoorRun(frontdoor, input));
	electron.ipcMain.handle("frontdoor:export-artifact", (_event, input) => exportFrontdoorArtifact(frontdoor, input));
	electron.ipcMain.handle("frontdoor:stop", (_event, input) => stopFrontdoorRun(frontdoor, input));
	electron.ipcMain.handle("frontdoor:recover", (_event, runId) => recoverFrontdoorRun(frontdoor, runId));
	electron.ipcMain.handle("frontdoor:list-candidates", () => listReviewableCandidates(frontdoor));
	electron.ipcMain.handle("frontdoor:inspect-candidate", (_event, candidateId) => inspectCandidate(frontdoor, candidateId));
	electron.ipcMain.handle("frontdoor:start-candidate-review", (_event, candidateId) => startCandidateReview(frontdoor, candidateId));
	electron.ipcMain.handle("frontdoor:review-candidate", (_event, input) => reviewCandidate(frontdoor, input));
	await scanForRecovery(relay);
	createWindow();
	electron.app.on("activate", () => {
		if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});
electron.app.on("window-all-closed", () => {
	if (process.platform !== "darwin") electron.app.quit();
});
//#endregion
