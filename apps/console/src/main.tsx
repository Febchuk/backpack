import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  LANGUAGES,
  type AgentView,
  type DesignedPreview,
  type EventView,
  type FactView,
  type ItineraryCard,
  type LearnerMemoryView,
  type LearnerView,
  type LibraryVoice,
} from "@backpack/shared/coach";
import { api } from "./api";
import "./styles.css";

const languageName = (code: string) => LANGUAGES.find((l) => l.code === code)?.name ?? code;
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Runs `fn` now and every `ms` while `enabled`. */
function usePoll(fn: () => void | Promise<void>, ms: number, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    void ref.current();
    const t = setInterval(() => void ref.current(), ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
}

/** One shared <audio> so only one preview plays at a time. */
function usePlayer() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const toggle = useCallback(
    (key: string, src: string) => {
      audio.current?.pause();
      if (playing === key) return setPlaying(null);
      const a = new Audio(src);
      a.onended = () => setPlaying(null);
      audio.current = a;
      setPlaying(key);
      a.play().catch(() => setPlaying(null));
    },
    [playing],
  );
  useEffect(() => () => audio.current?.pause(), []);
  return { playing, toggle };
}

function Section({ title, step, done, children, testId }: { title: string; step: number; done?: boolean; children: ReactNode; testId: string }) {
  return (
    <section className="card" data-testid={testId}>
      <h2>
        <span className={`step ${done ? "done" : ""}`}>{done ? "✓" : step}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}

// ─── Agents ───────────────────────────────────────────────────────────────────

function CreateAgent({ onCreated }: { onCreated: (a: AgentView) => void }) {
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<string>(LANGUAGES[0].code);
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated(await api.createAgent({ name, language, persona_city: city }));
      setName("");
      setCity("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card create" onSubmit={submit}>
      <h2>New agent</h2>
      <label>
        Name
        <input data-testid="agent-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Camille" required />
      </label>
      <label>
        Language
        <select data-testid="agent-language" value={language} onChange={(e) => setLanguage(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Persona city
        <input data-testid="agent-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lyon" required />
      </label>
      <button data-testid="create-agent" className="primary" disabled={busy || !name.trim() || !city.trim()}>
        {busy ? "Creating…" : "Create agent"}
      </button>
      <ErrorLine error={error} />
    </form>
  );
}

function AgentList({ agents, selected, onSelect }: { agents: AgentView[]; selected: string | null; onSelect: (id: string) => void }) {
  if (!agents.length) return <p className="muted">No agents yet.</p>;
  return (
    <ul className="agents" data-testid="agent-list">
      {agents.map((a) => (
        <li key={a.id}>
          <button data-testid="agent-item" data-id={a.id} className={a.id === selected ? "selected" : ""} onClick={() => onSelect(a.id)}>
            <strong>{a.name}</strong>
            <span className="muted">
              {languageName(a.language)} · {a.persona_city}
            </span>
            <span className={`pill ${a.setup_status}`}>{a.setup_status === "none" ? "setup" : a.setup_status}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ─── Voice ────────────────────────────────────────────────────────────────────

type Choice =
  | { source: "library"; voice: LibraryVoice }
  | { source: "designed"; preview: DesignedPreview; index: number; description: string };

function VoiceSection({ agent, onChange }: { agent: AgentView; onChange: (a: AgentView) => void }) {
  const [tab, setTab] = useState<"library" | "design">("library");
  const [voices, setVoices] = useState<LibraryVoice[] | null>(null);
  const [accent, setAccent] = useState("");
  const [description, setDescription] = useState("");
  const [previews, setPreviews] = useState<DesignedPreview[]>([]);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { playing, toggle } = usePlayer();

  useEffect(() => {
    setVoices(null);
    setChoice(null);
    setPreviews([]);
    api.libraryVoices(agent.language).then(setVoices, (e) => setError(errorText(e)));
  }, [agent.id, agent.language]);

  const filter = accent.trim().toLowerCase();
  const shown = (voices ?? []).filter((v) => !filter || [v.accent, v.description, v.name].some((s) => s?.toLowerCase().includes(filter)));

  const design = async () => {
    setBusy("design");
    setError(null);
    try {
      setPreviews(await api.designVoice({ language: agent.language, description }));
      setChoice(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const provision = async () => {
    if (!choice) return;
    setBusy("provision");
    setError(null);
    try {
      const body =
        choice.source === "library"
          ? { source: "library" as const, voice_id: choice.voice.voice_id, public_owner_id: choice.voice.public_owner_id, name: `${agent.name} (${choice.voice.name})` }
          : { source: "designed" as const, generated_voice_id: choice.preview.generated_voice_id, name: agent.name, description: choice.description };
      onChange(await api.provisionVoice(agent.id, body));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="Voice" step={1} done={!!agent.el_agent_id} testId="voice-section">
      {agent.voice_id && (
        <p className="status" data-testid="voice-status">
          Voice <code>{agent.voice_id}</code> ({agent.voice_source}) on ElevenLabs agent <code>{agent.el_agent_id}</code>
        </p>
      )}
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "library"} data-testid="voice-tab-library" onClick={() => setTab("library")}>
          Library
        </button>
        <button role="tab" aria-selected={tab === "design"} data-testid="voice-tab-design" onClick={() => setTab("design")}>
          Design
        </button>
      </div>

      {tab === "library" ? (
        <div>
          <input data-testid="accent-filter" value={accent} onChange={(e) => setAccent(e.target.value)} placeholder="Filter by accent, e.g. parisian" />
          {voices === null ? (
            <p className="muted">Loading {languageName(agent.language)} voices…</p>
          ) : (
            <ul className="voices" data-testid="library-voices">
              {shown.map((v) => {
                const chosen = choice?.source === "library" && choice.voice.voice_id === v.voice_id;
                return (
                  <li key={v.voice_id} className={chosen ? "chosen" : ""}>
                    <button
                      className="play"
                      aria-label={`Preview ${v.name}`}
                      disabled={!v.preview_url}
                      onClick={() => v.preview_url && toggle(v.voice_id, v.preview_url)}
                    >
                      {playing === v.voice_id ? "■" : "▶"}
                    </button>
                    <button className="pick" data-testid="library-voice" data-id={v.voice_id} onClick={() => setChoice({ source: "library", voice: v })}>
                      <strong>{v.name}</strong>
                      <span className="muted">{[v.accent, v.gender, v.age].filter(Boolean).join(" · ")}</span>
                      {v.description && <span className="desc">{v.description}</span>}
                    </button>
                  </li>
                );
              })}
              {!shown.length && <li className="muted">No voices match.</li>}
            </ul>
          )}
        </div>
      ) : (
        <div>
          <textarea
            data-testid="design-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={`Warm woman from ${agent.persona_city}, early 30s, relaxed, speaks clearly`}
          />
          <button data-testid="design-voice" onClick={design} disabled={busy === "design" || description.trim().length < 20}>
            {busy === "design" ? "Designing…" : "Generate 3 previews"}
          </button>
          <ul className="voices">
            {previews.map((p, i) => {
              const chosen = choice?.source === "designed" && choice.index === i;
              return (
                <li key={p.generated_voice_id} className={chosen ? "chosen" : ""}>
                  <button className="play" aria-label={`Play preview ${i + 1}`} onClick={() => toggle(p.generated_voice_id, `data:audio/mpeg;base64,${p.audio_base_64}`)}>
                    {playing === p.generated_voice_id ? "■" : "▶"}
                  </button>
                  <button className="pick" data-testid="design-preview" onClick={() => setChoice({ source: "designed", preview: p, index: i, description: description.trim() })}>
                    <strong>Preview {i + 1}</strong>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button data-testid="provision-voice" className="primary" disabled={!choice || busy === "provision"} onClick={provision}>
        {busy === "provision" ? "Provisioning…" : agent.el_agent_id ? "Change voice" : "Provision voice"}
      </button>
      <ErrorLine error={error} />
    </Section>
  );
}

// ─── Number ───────────────────────────────────────────────────────────────────

const CONSENT = "I approve buying a Dial phone number for this agent and accept the charge.";

function NumberSection({ agent, onChange }: { agent: AgentView; onChange: (a: AgentView) => void }) {
  const [consent, setConsent] = useState(false);
  const [imessage, setImessage] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  usePoll(
    async () => {
      try {
        onChange(await api.getAgent(agent.id));
      } catch (e) {
        setError(errorText(e));
      }
    },
    2000,
    agent.setup_status === "provisioning",
  );

  const buy = async () => {
    setBusy(true);
    setError(null);
    try {
      onChange(await api.buyNumber(agent.id, { consent: CONSENT, imessage }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Phone number" step={2} done={agent.setup_status === "ready"} testId="number-section">
      {agent.setup_status === "none" && (
        <>
          <label className="check">
            <input type="checkbox" data-testid="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            {CONSENT}
          </label>
          <label className="check">
            <input type="checkbox" data-testid="imessage" checked={imessage} onChange={(e) => setImessage(e.target.checked)} />
            iMessage line (voice notes arrive as native voice messages)
          </label>
          <button data-testid="buy-number" className="primary" disabled={!consent || busy} onClick={buy}>
            {busy ? "Buying…" : "Buy number"}
          </button>
        </>
      )}
      {agent.setup_status === "provisioning" && (
        <p className="status" data-testid="number-status">
          <span className="spinner" /> provisioning…
        </p>
      )}
      {agent.setup_status === "ready" && (
        <p className="number" data-testid="agent-number">
          {agent.dial_number}
        </p>
      )}
      {agent.setup_status === "failed" && (
        <p className="error" data-testid="number-status">
          Dial could not set up this number.
        </p>
      )}
      <ErrorLine error={error} />
    </Section>
  );
}

// ─── Learners ─────────────────────────────────────────────────────────────────

function LearnerSection({ agent, selected, onSelect }: { agent: AgentView; selected: string | null; onSelect: (id: string | null) => void }) {
  const [learners, setLearners] = useState<LearnerView[]>([]);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ready = agent.setup_status === "ready";

  const load = useCallback(() => api.listLearners(agent.id).then(setLearners, (e) => setError(errorText(e))), [agent.id]);
  useEffect(() => void load(), [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const l = await api.addLearner(agent.id, { phone: phone.trim() });
      setPhone("");
      setNotice(`${agent.name} will text ${l.phone} first.`);
      await load();
      onSelect(l.id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const call = async (l: LearnerView) => {
    setError(null);
    try {
      await api.callLearner(l.id);
      setNotice(`Calling ${l.phone}…`);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const remove = async (l: LearnerView) => {
    if (!confirm(`Delete ${l.phone} and everything ${agent.name} remembers about them?`)) return;
    try {
      await api.deleteLearner(l.id);
      if (selected === l.id) onSelect(null);
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Section title="Learners" step={3} done={learners.length > 0} testId="learner-section">
      {!ready && <p className="muted">Buy a number first; the agent texts from it.</p>}
      <form className="row" onSubmit={add}>
        <input data-testid="learner-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+447700900123" disabled={!ready} />
        <button data-testid="add-learner" className="primary" disabled={!ready || busy || !phone.trim()}>
          {busy ? "Adding…" : "Text me first"}
        </button>
      </form>
      {notice && <p className="status">{notice}</p>}
      <ul className="learners">
        {learners.map((l) => (
          <li key={l.id} data-testid="learner-item" data-id={l.id} className={l.id === selected ? "selected" : ""}>
            <button className="pick" onClick={() => onSelect(l.id)}>
              <strong>{l.display_name ?? l.phone}</strong>
              <span className="muted">
                {l.display_name ? `${l.phone} · ` : ""}
                {l.level ?? "level ?"} · {l.onboarding_step === "done" ? "onboarded" : `onboarding: ${l.onboarding_step}`}
              </span>
            </button>
            <button data-testid="call-learner" onClick={() => call(l)}>
              Call me
            </button>
            <button className="ghost" aria-label={`Delete ${l.phone}`} onClick={() => remove(l)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <ErrorLine error={error} />
    </Section>
  );
}

// ─── Demo (COACH_DEMO=1) ──────────────────────────────────────────────────────

function DemoPanel({ agent, learnerId, onStarted }: { agent: AgentView; learnerId: string | null; onStarted: (id: string) => void }) {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const l = await api.startDemo(agent.id, phone.trim());
      setNotice(`${agent.name} is texting ${l.phone}. Reply on the phone to move the script on.`);
      onStarted(l.id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const followup = async () => {
    if (!learnerId) return;
    setError(null);
    try {
      await api.demoFollowup(learnerId);
      setNotice("Follow-up notes and voice note on their way.");
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <section className="card demo" data-testid="demo-panel">
      <h2>Demo</h2>
      <form className="row" onSubmit={start}>
        <input data-testid="demo-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Your phone number" />
        <button data-testid="demo-start" className="primary" disabled={busy || !phone.trim() || agent.setup_status !== "ready"}>
          {busy ? "Starting…" : "Start demo"}
        </button>
        <button type="button" className="ghost" onClick={followup} disabled={!learnerId} title="Use if the follow-up didn't arrive after the call">
          Send follow-up
        </button>
      </form>
      {notice && <p className="status">{notice}</p>}
      <div className="stat" data-testid="demo-stat">
        <span className="muted">Estimated practice workflow</span>
        <strong>30 → 13 min</strong>
        <span className="badge">Pending measurement</span>
      </div>
      <ErrorLine error={error} />
    </section>
  );
}

// ─── Memory ───────────────────────────────────────────────────────────────────

function groupFacts(facts: FactView[]) {
  const by = new Map<string, FactView[]>();
  for (const f of facts) by.set(f.rel, [...(by.get(f.rel) ?? []), f]);
  return [...by.entries()];
}

function ItineraryCardView({ card }: { card: ItineraryCard }) {
  return (
    <div className="itinerary" data-testid="itinerary-card">
      <h4>{card.title}</h4>
      <ol>
        {card.stops.map((s) => (
          <li key={s.time}>
            <span className="when">{s.time}</span>
            <div>
              <strong>{s.title}</strong>
              <p>{s.detail}</p>
              {s.badge && <span className="badge">{s.badge}</span>}
              {s.links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="media">
                  {l.label} ↗
                </a>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function EventRow({ e }: { e: EventView }) {
  const fb = e.feedback;
  return (
    <li data-testid="event" className={`event ${e.direction}`}>
      <div className="bubble">
        {e.channel !== "sms" && <span className="tag">{e.channel === "call" ? "call" : "voice note"}</span>}
        <span>{e.text}</span>
        {fb?.card && <ItineraryCardView card={fb.card} />}
        {e.media_url && (
          <a href={e.media_url} target="_blank" rel="noreferrer" className="media">
            ▶ voice note
          </a>
        )}
        {fb?.correction && <span className="correction">✎ {fb.correction}</span>}
        {fb?.notes && <span className="correction">{fb.notes}</span>}
      </div>
      <time>{new Date(e.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
    </li>
  );
}

function MemoryPanel({ learnerId }: { learnerId: string }) {
  const [view, setView] = useState<LearnerMemoryView | null>(null);
  const [error, setError] = useState<string | null>(null);

  usePoll(async () => {
    try {
      setView(await api.learnerMemory(learnerId));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, 3000);

  return (
    <section className="card memory" data-testid="memory-panel">
      <h2>Memory {view && <span className="muted">· {view.learner.display_name ?? view.learner.phone}</span>}</h2>
      {!view ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <h3>Facts</h3>
          <div data-testid="memory-facts">
            {view.facts.length === 0 && <p className="muted">Nothing yet. Facts appear as the learner talks.</p>}
            {groupFacts(view.facts).map(([rel, fs]) => (
              <div key={rel} className="facts">
                <span className="rel">{rel.replace(/_/g, " ")}</span>
                {fs.map((f) => (
                  <span key={f.object} className="chip" data-testid="fact-chip" title={`weight ${f.weight}`}>
                    {f.object}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <h3>Memories</h3>
          <ul className="memories" data-testid="memory-list">
            {view.memories.length === 0 && <li className="muted">None yet.</li>}
            {view.memories.map((m) => (
              <li key={m.id}>
                {m.text} <span className="muted">· {m.source}</span>
              </li>
            ))}
          </ul>
          <h3>Recent conversation</h3>
          <ul className="conversation" data-testid="conversation">
            {view.events.length === 0 && <li className="muted">No messages yet.</li>}
            {view.events.map((e) => (
              <EventRow key={e.id} e={e} />
            ))}
          </ul>
        </>
      )}
      <ErrorLine error={error} />
    </section>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  const [agents, setAgents] = useState<AgentView[]>([]);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [learnerId, setLearnerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [learnersRev, setLearnersRev] = useState(0);

  useEffect(() => {
    api.demoStatus().then((s) => setDemo(s.enabled), () => setDemo(false));
    api.listAgents().then(
      (list) => {
        setAgents(list);
        setAgentId((id) => id ?? list[0]?.id ?? null);
      },
      (e) => setError(errorText(e)),
    );
  }, []);

  const upsert = useCallback((a: AgentView) => setAgents((list) => (list.some((x) => x.id === a.id) ? list.map((x) => (x.id === a.id ? a : x)) : [a, ...list])), []);
  const agent = agents.find((a) => a.id === agentId) ?? null;

  return (
    <main>
      <header>
        <h1>Backpack Coach</h1>
        <p className="muted">Phone agents that teach a language and remember who they talk to.</p>
      </header>
      <ErrorLine error={error} />
      <div className="layout">
        <aside>
          <AgentList
            agents={agents}
            selected={agentId}
            onSelect={(id) => {
              setAgentId(id);
              setLearnerId(null);
            }}
          />
          <CreateAgent
            onCreated={(a) => {
              upsert(a);
              setAgentId(a.id);
              setLearnerId(null);
            }}
          />
        </aside>
        {agent ? (
          <div className="detail" key={agent.id}>
            <div className="agent-head" data-testid="agent-detail">
              <h2>{agent.name}</h2>
              <span className="muted">
                {languageName(agent.language)} · {agent.persona_city}
              </span>
            </div>
            {demo && (
              <DemoPanel
                agent={agent}
                learnerId={learnerId}
                onStarted={(id) => {
                  setLearnerId(id);
                  setLearnersRev((n) => n + 1);
                }}
              />
            )}
            <VoiceSection agent={agent} onChange={upsert} />
            <NumberSection agent={agent} onChange={upsert} />
            <LearnerSection key={learnersRev} agent={agent} selected={learnerId} onSelect={setLearnerId} />
            {learnerId && <MemoryPanel key={learnerId} learnerId={learnerId} />}
          </div>
        ) : (
          <div className="detail empty muted">Create an agent to get started.</div>
        )}
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
