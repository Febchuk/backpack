import type {
  AddLearnerBody,
  AgentView,
  BuyNumberBody,
  CreateAgentBody,
  DesignVoiceBody,
  DesignedPreview,
  LearnerMemoryView,
  LearnerView,
  LibraryVoice,
  ProvisionVoiceBody,
} from "@backpack/shared/coach";

const BASE = (import.meta.env.VITE_COACH_URL as string | undefined) ?? "http://localhost:8788";
const TOKEN = import.meta.env.VITE_ADMIN_TOKEN as string | undefined;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `${method} ${path}: ${res.status}`);
  return json as T;
}

/** Typed client for apps/coach routes/api.ts. */
export const api = {
  listAgents: () => call<AgentView[]>("GET", "/api/agents"),
  getAgent: (id: string) => call<AgentView>("GET", `/api/agents/${id}`),
  createAgent: (b: CreateAgentBody) => call<AgentView>("POST", "/api/agents", b),
  libraryVoices: (language: string) => call<LibraryVoice[]>("GET", `/api/voices/library?language=${encodeURIComponent(language)}`),
  designVoice: (b: DesignVoiceBody) => call<DesignedPreview[]>("POST", "/api/voices/design", b),
  provisionVoice: (agentId: string, b: ProvisionVoiceBody) => call<AgentView>("POST", `/api/agents/${agentId}/voice`, b),
  buyNumber: (agentId: string, b: BuyNumberBody) => call<AgentView>("POST", `/api/agents/${agentId}/number`, b),
  listLearners: (agentId: string) => call<LearnerView[]>("GET", `/api/agents/${agentId}/learners`),
  addLearner: (agentId: string, b: AddLearnerBody) => call<LearnerView>("POST", `/api/agents/${agentId}/learners`, b),
  callLearner: (learnerId: string) => call<{ call_id: string }>("POST", `/api/learners/${learnerId}/call`),
  learnerMemory: (learnerId: string) => call<LearnerMemoryView>("GET", `/api/learners/${learnerId}/memory`),
  deleteLearner: (learnerId: string) => call<void>("DELETE", `/api/learners/${learnerId}`),
  demoStatus: () => call<{ enabled: boolean }>("GET", "/api/demo"),
  startDemo: (agentId: string, phone: string) => call<LearnerView>("POST", "/api/demo/start", { agent_id: agentId, phone }),
  demoFollowup: (learnerId: string) => call<{ ok: true }>("POST", `/api/learners/${learnerId}/demo/followup`),
};
