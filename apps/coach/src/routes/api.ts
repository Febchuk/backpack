import { Router, type NextFunction, type Request, type Response } from "express";
import {
  LANGUAGES,
  type AddLearnerBody,
  type BuyNumberBody,
  type CreateAgentBody,
  type DesignVoiceBody,
  type LearnerMemoryView,
  type ProvisionVoiceBody,
} from "@backpack/shared/coach";
import type { Deps } from "../app";
import type { Agent } from "../db/repo";
import { basePrompt, firstMessage, languageName, sampleText } from "../coach/persona";

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const E164 = /^\+[1-9]\d{6,14}$/;
const isLanguage = (code: unknown) => LANGUAGES.some((l) => l.code === code);
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

/** The console API under /api (ADMIN_TOKEN bearer). See packages/shared/src/coach.ts for bodies. */
export function apiRouter(deps: Deps) {
  const { config, repo, dial, provisioner, engine, memory } = deps;
  const r = Router();

  r.use("/api", (req, res, next) => {
    if (!config.adminToken) {
      if (config.isProduction) return res.status(503).json({ ok: false, error: "ADMIN_TOKEN is not set; the console API is disabled in production" });
      return next();
    }
    if (req.headers.authorization !== `Bearer ${config.adminToken}`) return res.status(401).json({ ok: false, error: "unauthorized" });
    next();
  });

  const agentOr404 = async (id: string) => {
    const agent = await repo.getAgent(id);
    if (!agent) throw new HttpError(404, `no agent ${id}`);
    return agent;
  };
  const learnerOr404 = async (id: string) => {
    const learner = await repo.getLearner(id);
    if (!learner) throw new HttpError(404, `no learner ${id}`);
    return learner;
  };

  /** While Dial is still provisioning the line, ask again and persist what it says. */
  const refreshNumber = async (agent: Agent): Promise<Agent> => {
    if (agent.setup_status !== "provisioning" || !agent.dial_number_id) return agent;
    try {
      const n = await dial.getNumber(agent.dial_number_id);
      if (n.setupStatus === agent.setup_status && n.number === agent.dial_number) return agent;
      return (await repo.updateAgent(agent.id, { setup_status: n.setupStatus, dial_number: n.number })) ?? agent;
    } catch (e) {
      console.error(`[api] refreshing number ${agent.dial_number_id}:`, (e as Error).message);
      return agent;
    }
  };

  // ─── agents ───
  r.post(
    "/api/agents",
    wrap(async (req, res) => {
      const b = (req.body ?? {}) as Partial<CreateAgentBody>;
      const name = text(b.name);
      const city = text(b.persona_city);
      if (!name || !city) throw new HttpError(400, "name and persona_city are required");
      if (!isLanguage(b.language)) throw new HttpError(400, `language must be one of ${LANGUAGES.map((l) => l.code).join(", ")}`);
      res.status(201).json(await repo.createAgent({ name, language: b.language!, persona_city: city }));
    }),
  );

  r.get(
    "/api/agents",
    wrap(async (_req, res) => res.json(await repo.listAgents())),
  );

  r.get(
    "/api/agents/:id",
    wrap(async (req, res) => res.json(await refreshNumber(await agentOr404(req.params.id)))),
  );

  // ─── voices ───
  r.get(
    "/api/voices/library",
    wrap(async (req, res) => {
      const language = text(req.query.language);
      if (!isLanguage(language)) throw new HttpError(400, "language is required");
      const accent = text(req.query.accent) || undefined;
      const gender = text(req.query.gender) || undefined;
      res.json(await provisioner.searchLibrary({ language, accent, gender }));
    }),
  );

  r.post(
    "/api/voices/design",
    wrap(async (req, res) => {
      const b = (req.body ?? {}) as Partial<DesignVoiceBody>;
      const description = text(b.description);
      if (!isLanguage(b.language)) throw new HttpError(400, "language is required");
      if (description.length < 20) throw new HttpError(400, "describe the voice in at least 20 characters");
      const full = `A native ${languageName(b.language!)} speaker. ${description}`;
      res.json(await provisioner.design({ language: b.language!, description: full, sampleText: sampleText(b.language!) }));
    }),
  );

  r.post(
    "/api/agents/:id/voice",
    wrap(async (req, res) => {
      const agent = await agentOr404(req.params.id);
      const b = (req.body ?? {}) as Partial<ProvisionVoiceBody>;
      const name = text(b.name) || agent.name;
      let voiceId: string;
      let description: string | null = null;
      if (b.source === "library") {
        if (!text(b.voice_id) || !text(b.public_owner_id)) throw new HttpError(400, "voice_id and public_owner_id are required");
        voiceId = (await provisioner.addFromLibrary({ publicOwnerId: b.public_owner_id!, voiceId: b.voice_id!, name })).voice_id;
      } else if (b.source === "designed") {
        description = text(b.description);
        if (!text(b.generated_voice_id) || !description) throw new HttpError(400, "generated_voice_id and description are required");
        voiceId = (await provisioner.saveDesigned({ generatedVoiceId: b.generated_voice_id!, name, description })).voice_id;
      } else throw new HttpError(400, 'source must be "library" or "designed"');

      const { el_agent_id } = await provisioner.upsertAgent({
        elAgentId: agent.el_agent_id,
        name: agent.name,
        language: agent.language,
        voiceId,
        prompt: basePrompt(agent),
        firstMessage: firstMessage(agent),
      });
      res.json(
        await repo.updateAgent(agent.id, { voice_id: voiceId, voice_source: b.source, voice_description: description, el_agent_id }),
      );
    }),
  );

  // ─── number ───
  r.post(
    "/api/agents/:id/number",
    wrap(async (req, res) => {
      const agent = await agentOr404(req.params.id);
      const b = (req.body ?? {}) as Partial<BuyNumberBody>;
      const consent = text(b.consent);
      if (!consent) throw new HttpError(400, "consent is required to buy a number");
      if (agent.dial_number_id) throw new HttpError(409, "this agent already has a number");
      const n = await dial.purchaseNumber({
        consent,
        imessage: b.imessage === true,
        areaCode: text(b.area_code) || undefined,
        nickname: `Coach ${agent.name}`,
      });
      res.json(await repo.updateAgent(agent.id, { dial_number_id: n.id, dial_number: n.number, setup_status: n.setupStatus }));
    }),
  );

  // ─── learners ───
  r.get(
    "/api/agents/:id/learners",
    wrap(async (req, res) => {
      const agent = await agentOr404(req.params.id);
      res.json(await repo.listLearners(agent.id));
    }),
  );

  r.post(
    "/api/agents/:id/learners",
    wrap(async (req, res) => {
      const agent = await refreshNumber(await agentOr404(req.params.id));
      if (agent.setup_status !== "ready") throw new HttpError(409, "the agent needs a ready number before adding learners");
      const b = (req.body ?? {}) as Partial<AddLearnerBody>;
      const phone = text(b.phone).replace(/[\s()-]/g, "");
      if (!E164.test(phone)) throw new HttpError(400, "phone must be E.164, e.g. +447700900123");
      const { learner, created } = await repo.upsertLearner(agent.id, phone, text(b.display_name) || null);
      if (created) {
        engine.startOnboarding(agent, learner).catch((e) => console.error(`[api] onboarding ${learner.id} failed:`, (e as Error).message));
      }
      res.status(created ? 201 : 200).json(learner);
    }),
  );

  r.post(
    "/api/learners/:id/call",
    wrap(async (req, res) => {
      const learner = await learnerOr404(req.params.id);
      const agent = await agentOr404(learner.agent_id);
      if (!agent.dial_number_id || agent.setup_status !== "ready") throw new HttpError(409, "the agent has no ready number");
      const lang = languageName(agent.language);
      const { call_id } = await dial.placeCall({
        from: agent.dial_number_id,
        to: learner.phone,
        language: agent.language,
        instruction: `You are ${agent.name}, a friendly local from ${agent.persona_city}. Have a short, relaxed practice conversation in ${lang} at the learner's level.`,
      });
      res.json({ call_id });
    }),
  );

  r.get(
    "/api/learners/:id/memory",
    wrap(async (req, res) => {
      const learner = await learnerOr404(req.params.id);
      const [profile, events] = await Promise.all([memory.profile(learner.id), repo.recentEvents(learner.id, 30)]);
      const view: LearnerMemoryView = {
        learner,
        facts: profile.facts,
        memories: profile.memories,
        events: events.map(({ id, channel, direction, text, media_url, feedback, created_at }) => ({
          id,
          channel,
          direction,
          text,
          media_url,
          feedback,
          created_at,
        })),
      };
      res.json(view);
    }),
  );

  r.delete(
    "/api/learners/:id",
    wrap(async (req, res) => {
      const learner = await learnerOr404(req.params.id);
      await memory.forget(learner.id);
      await repo.deleteLearner(learner.id);
      res.status(204).end();
    }),
  );

  r.all("/api/*", (_req, res) => res.status(404).json({ ok: false, error: "not found" }));

  r.use("/api", (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ ok: false, error: err.message });
    console.error("[api]", (err as Error)?.message ?? err);
    res.status(500).json({ ok: false, error: (err as Error)?.message ?? "internal error" });
  });

  return r;
}
