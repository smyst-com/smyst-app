"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dictionary, Locale } from "@/lib/i18n";
import { locales } from "@/lib/i18n";
import { initialMessages, twins, type ChatMessage, type Twin } from "@/lib/profile-data";
import { PwaRegister } from "@/components/pwa-register";

type View = "home" | "twins" | "chat" | "profile" | "creator";

type Props = {
  locale: Locale;
  dictionary: Dictionary;
};

export function SmystApp({ locale, dictionary }: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>("home");
  const [selectedTwinId, setSelectedTwinId] = useState(twins[0]?.id ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const selectedTwin = useMemo(
    () => twins.find((twin) => twin.id === selectedTwinId) ?? null,
    [selectedTwinId],
  );

  const navItems: Array<[View, string]> = [
    ["home", dictionary.nav.home],
    ["twins", dictionary.nav.twins],
    ["chat", dictionary.nav.chat],
    ["profile", dictionary.nav.profile],
    ["creator", dictionary.nav.creator],
  ];

  function changeLocale(next: string) {
    router.push(`/${next}`);
  }

  function sendMessage() {
    const next = draft.trim();
    if (!next || !selectedTwin) return;
    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: next,
    };
    const assistantMessage: ChatMessage = {
      id: `a-${Date.now()}`,
      role: "assistant",
      content: [
        `Antworte kurz, direkt und sachlich. ${selectedTwin.summary}`,
        selectedTwin.guardrail ? `Guardrail: ${selectedTwin.guardrail}` : null,
        selectedTwin.sources?.length ? `Sources available: ${selectedTwin.sources.length}` : null,
      ]
        .filter(Boolean)
        .join(" "),
    };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setDraft("");
    setView("chat");
  }

  return (
    <div className="app-shell">
      <PwaRegister />
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">smyst.com</div>
          <nav className="nav" aria-label="Primary">
            {navItems.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`nav-button${view === key ? " active" : ""}`}
                onClick={() => setView(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="top-actions">
            <select
              className="language-select"
              aria-label="Language"
              value={locale}
              onChange={(event) => changeLocale(event.target.value)}
            >
              {locales.map((item) => (
                <option key={item} value={item}>
                  {item.toUpperCase()}
                </option>
              ))}
            </select>
            <button className="icon-button" type="button" aria-label={dictionary.pwa.label} title={dictionary.pwa.label}>
              P
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        <section className="hero-band" id="home" aria-labelledby="hero-title">
          <div>
            <h1 className="hero-title" id="hero-title">
              {dictionary.hero.title}
            </h1>
            <p className="hero-copy">{dictionary.hero.copy}</p>
          </div>
          <div className="metric-row" aria-label="Product signals">
            <Metric value="<300ms" label={dictionary.hero.metricLatency} />
            <Metric value="RBAC" label={dictionary.hero.metricSafety} />
            <Metric value="5+" label={dictionary.hero.metricReach} />
          </div>
        </section>

        <section className="workspace">
          <TwinSelection
            dictionary={dictionary}
            selectedTwin={selectedTwin}
            selectedTwinId={selectedTwinId}
            onSelect={(id) => {
              setSelectedTwinId(id);
              setView("chat");
            }}
          />
          <ChatPanel
            dictionary={dictionary}
            selectedTwin={selectedTwin}
            messages={messages}
            draft={draft}
            onDraft={setDraft}
            onSend={sendMessage}
          />
          {view === "creator" ? (
            <TwinCreator dictionary={dictionary} />
          ) : (
            <ProfilePanel dictionary={dictionary} selectedTwin={selectedTwin} />
          )}
        </section>

        <p className="footer-note">smyst.com</p>
      </main>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="metric">
      <span className="metric-value">{value}</span>
      <span className="metric-label">{label}</span>
    </div>
  );
}

function TwinSelection({
  dictionary,
  selectedTwinId,
  selectedTwin,
  onSelect,
}: {
  dictionary: Dictionary;
  selectedTwinId: string;
  selectedTwin: Twin | null;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="panel" id="twins">
      <div className="panel-header">
        <h2 className="panel-title">{dictionary.twins.title}</h2>
        <span className="status-pill">{selectedTwin?.status ?? "Keine Profile"}</span>
      </div>
      <div className="panel-body twin-list">
        {twins.length ? twins.map((twin) => (
          <button
            key={twin.id}
            type="button"
            className={`twin-button${selectedTwinId === twin.id ? " active" : ""}`}
            onClick={() => onSelect(twin.id)}
          >
            <span className="twin-name">
              {twin.name}
              {selectedTwinId === twin.id ? <span className="status-pill">{dictionary.twins.active}</span> : null}
            </span>
            <span className="twin-meta">
              {twin.role}
              <br />
              {twin.memoryCount} memories - {twin.latency}
            </span>
          </button>
        )) : (
          <div className="twin-button" role="status">
            <span className="twin-name">Keine echten Profile geladen</span>
            <span className="twin-meta">Verbinde die Datenbank/API, damit nur reale Profile angezeigt werden.</span>
          </div>
        )}
      </div>
    </aside>
  );
}

function ChatPanel({
  dictionary,
  selectedTwin,
  messages,
  draft,
  onDraft,
  onSend,
}: {
  dictionary: Dictionary;
  selectedTwin: Twin | null;
  messages: ChatMessage[];
  draft: string;
  onDraft: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <section className="panel chat-panel" id="chat">
      <div className="panel-header">
        <h2 className="panel-title">{dictionary.chat.title}</h2>
        <span className="status-pill">{selectedTwin?.name ?? "Kein Profil"}</span>
      </div>
      <div className="messages" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <span className="message-label">
              {message.role === "assistant" ? dictionary.chat.assistant : dictionary.chat.user}
            </span>
            {message.content}
          </div>
        ))}
      </div>
      <div className="composer">
        <textarea
          value={draft}
          rows={2}
          placeholder={dictionary.chat.placeholder}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) onSend();
          }}
        />
        <button type="button" className="primary-button" onClick={onSend} disabled={!selectedTwin}>
          {dictionary.chat.send}
        </button>
      </div>
    </section>
  );
}

function ProfilePanel({ dictionary, selectedTwin }: { dictionary: Dictionary; selectedTwin: Twin | null }) {
  return (
    <aside className="panel" id="profile">
      <div className="panel-header">
        <h2 className="panel-title">{dictionary.profile.title}</h2>
      </div>
      <div className="panel-body profile-list">
        {selectedTwin ? (
          <>
            <div>
              <strong>{selectedTwin.name}</strong>
              <br />
              {selectedTwin.summary}
            </div>
            <div>
              <strong>{dictionary.profile.owner}</strong>
              <br />
              smyst founder account
            </div>
            <div>
              <strong>{dictionary.profile.region}</strong>
              <br />
              {selectedTwin.region}
            </div>
            <div>
              <strong>{dictionary.profile.privacy}</strong>
              <br />
              {selectedTwin.privacy}
            </div>
          </>
        ) : (
          <div>
            <strong>Keine echten Profile geladen</strong>
            <br />
            Sobald die API echte Daten liefert, erscheinen hier Name, Profilbild und Direkt-Chat.
          </div>
        )}
        {selectedTwin?.guardrail ? (
          <div>
            <strong>Guardrail</strong>
            <br />
            {selectedTwin.guardrail}
          </div>
        ) : null}
        {selectedTwin?.sources?.length ? (
          <div>
            <strong>Sources</strong>
            <ul className="source-list">
              {selectedTwin.sources.map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.publisher}: {source.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function TwinCreator({ dictionary }: { dictionary: Dictionary }) {
  return (
    <aside className="panel" id="creator">
      <div className="panel-header">
        <h2 className="panel-title">{dictionary.creator.title}</h2>
      </div>
      <form className="panel-body field-grid">
        <div className="field">
          <label htmlFor="twin-name">{dictionary.creator.name}</label>
          <input id="twin-name" name="name" />
        </div>
        <div className="field">
          <label htmlFor="twin-purpose">{dictionary.creator.purpose}</label>
          <input id="twin-purpose" name="purpose" />
        </div>
        <div className="field">
          <label htmlFor="twin-visibility">{dictionary.creator.visibility}</label>
          <select id="twin-visibility" name="visibility" defaultValue="private">
            <option value="private">private</option>
            <option value="restricted">restricted</option>
            <option value="public">public</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="twin-notes">{dictionary.creator.notes}</label>
          <textarea id="twin-notes" name="notes" rows={5} />
        </div>
        <div className="creator-actions">
          <button className="primary-button" type="button">
            {dictionary.creator.save}
          </button>
          <button className="secondary-button" type="reset">
            {dictionary.creator.reset}
          </button>
        </div>
      </form>
    </aside>
  );
}
