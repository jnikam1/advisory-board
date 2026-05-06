"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { BOARD, MODES, MODE_INSTRUCTIONS } from "@/lib/board";
import {
  loadSessions,
  saveSession,
  deleteSession,
  getActiveSessionId,
  setActiveSessionId,
  createSession,
  exportSessionAsMarkdown,
  exportSessionAsJSON,
  downloadFile,
  importSessions,
  searchSessions,
  formatRelativeTime,
} from "@/lib/storage";
import type { Session, Message, ModeId } from "@/lib/types";

export default function HomePage() {
  // ─── Session state ──────────────────────────────────────────────────
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ─── Chat state ─────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ModeId>("debate");
  const [pick1on1, setPick1on1] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeMember, setActiveMember] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<string[]>([]);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Effects ────────────────────────────────────────────────────────
  useEffect(() => {
    const loaded = loadSessions();
    setSessions(loaded);
    const active = getActiveSessionId();
    if (active) {
      const session = loaded.find((s) => s.id === active);
      if (session) {
        setActiveId(active);
        setMessages(session.messages);
      }
    }
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeMember]);

  // Auto-save active session whenever messages change
  useEffect(() => {
    if (!activeId || messages.length === 0) return;
    const existing = sessions.find((s) => s.id === activeId);
    if (!existing) return;
    const updated: Session = {
      ...existing,
      messages,
      updatedAt: Date.now(),
    };
    saveSession(updated);
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== activeId);
      return [updated, ...filtered];
    });
  }, [messages, activeId]);

  // ─── Session management ─────────────────────────────────────────────
  const startNewSession = useCallback(() => {
    setActiveId(null);
    setActiveSessionId(null);
    setMessages([]);
    setErrors([]);
    setExpanded({});
    setShowSidebar(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const switchToSession = (id: string) => {
    const session = sessions.find((s) => s.id === id);
    if (!session) return;
    setActiveId(id);
    setActiveSessionId(id);
    setMessages(session.messages);
    setErrors([]);
    setExpanded({});
    setShowSidebar(false);
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this session permanently?")) return;
    deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeId === id) startNewSession();
  };

  const handleExportSession = (session: Session, format: "md" | "json", e: React.MouseEvent) => {
    e.stopPropagation();
    if (format === "md") {
      downloadFile(`${session.title.replace(/[^a-z0-9]/gi, "-").slice(0, 40)}.md`, exportSessionAsMarkdown(session), "text/markdown");
    } else {
      downloadFile(`${session.title.replace(/[^a-z0-9]/gi, "-").slice(0, 40)}.json`, exportSessionAsJSON(session), "application/json");
    }
  };

  const handleExportAll = () => {
    const all = JSON.stringify(sessions, null, 2);
    downloadFile(`advisory-board-backup-${new Date().toISOString().slice(0, 10)}.json`, all, "application/json");
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const imported = importSessions(content);
      if (imported.length === 0) {
        alert("No valid sessions found in this file");
        return;
      }
      const all = [...imported, ...sessions];
      // Dedup by id
      const seen = new Set<string>();
      const unique = all.filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
      // Save each
      unique.forEach((s) => saveSession(s));
      setSessions(unique.sort((a, b) => b.updatedAt - a.updatedAt));
      alert(`Imported ${imported.length} session(s)`);
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  // ─── API call ───────────────────────────────────────────────────────
  const callAPI = async (persona: string, prompt: string): Promise<string> => {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona, prompt }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.text;
  };

  // ─── Run board ──────────────────────────────────────────────────────
  const runBoard = async (userText: string, currentMessages: Message[]) => {
    setBusy(true);
    setErrors([]);

    const who = mode === "1on1" && pick1on1
      ? BOARD.filter((m) => m.id === pick1on1)
      : [...BOARD].sort(() => Math.random() - 0.5);

    const recentHistory = currentMessages.slice(-8).map((m) => {
      if (m.type === "user") return `FOUNDER: ${m.content}`;
      return `${m.name} (${m.role}): ${m.content}`;
    }).join("\n\n");

    const round: Message[] = [];
    const newErrors: string[] = [];

    for (const member of who) {
      setActiveMember(member.id);

      const priorInRound = round
        .map((r) => `${r.name} (${r.role}) said:\n${r.content}`)
        .join("\n\n---\n\n");

      const persona = `${member.persona}\n\nMode: ${MODE_INSTRUCTIONS[mode]}\n\nYou are speaking to Jayesh, the founder. Address him directly.`;

      const promptParts = [
        recentHistory && `Previous conversation:\n${recentHistory}`,
        priorInRound && `Other board members already responded this round:\n${priorInRound}`,
        `Founder's latest message:\n${userText}`,
      ].filter(Boolean);

      try {
        const text = await callAPI(persona, promptParts.join("\n\n---\n\n"));
        const newMsg: Message = {
          id: `${Date.now()}-${member.id}`,
          type: "board",
          memberId: member.id,
          name: member.name,
          role: member.role,
          emoji: member.emoji,
          color: member.color,
          bg: member.bg,
          content: text,
          timestamp: Date.now(),
        };
        round.push(newMsg);
        setMessages((prev) => [...prev, newMsg]);
      } catch (e: any) {
        console.error(`${member.name} error:`, e);
        newErrors.push(`${member.emoji} ${member.name}: ${e.message}`);
      }
    }

    if (newErrors.length > 0) setErrors(newErrors);
    setActiveMember(null);
    setBusy(false);
  };

  // ─── Send message ───────────────────────────────────────────────────
  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    if (mode === "1on1" && !pick1on1) {
      setErrors(["Select an advisor first for 1-on-1 mode"]);
      return;
    }

    setInput("");

    let session: Session;
    let currentId = activeId;

    if (!currentId) {
      session = createSession(text);
      currentId = session.id;
      saveSession(session);
      setActiveId(currentId);
      setActiveSessionId(currentId);
      setSessions((prev) => [session, ...prev]);
    } else {
      session = sessions.find((s) => s.id === currentId)!;
    }

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      type: "user",
      content: text,
      mode,
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    await runBoard(text, updatedMessages);
  };

  const filteredSessions = searchSessions(sessions, searchQuery);

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      {/* Sidebar overlay */}
      {showSidebar && (
        <div
          onClick={() => setShowSidebar(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            zIndex: 50,
            backdropFilter: "blur(4px)",
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        style={{
          ...S.sidebar,
          transform: showSidebar ? "translateX(0)" : "translateX(-100%)",
        }}
      >
        <div style={S.sidebarHeader}>
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--gold)", letterSpacing: "2px" }}>
              ARCHIVE
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
              {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
            </div>
          </div>
          <button onClick={() => setShowSidebar(false)} style={S.iconBtn}>✕</button>
        </div>

        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <input
            type="text"
            placeholder="Search archive..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "9px 12px",
              background: "rgba(255,255,255,0.025)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 12,
              color: "var(--text)",
            }}
          />
        </div>

        <div style={S.sessionList}>
          <button onClick={startNewSession} style={S.newSessionBtn}>
            <span style={{ fontSize: 14 }}>＋</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "1.5px" }}>NEW SESSION</span>
          </button>

          {filteredSessions.length === 0 && sessions.length === 0 && (
            <div style={{ textAlign: "center", padding: "30px 16px", color: "var(--text-faint)", fontSize: 11 }}>
              No sessions yet.<br />
              Start your first board meeting.
            </div>
          )}

          {filteredSessions.length === 0 && sessions.length > 0 && (
            <div style={{ textAlign: "center", padding: "20px 16px", color: "var(--text-faint)", fontSize: 11 }}>
              No matches found
            </div>
          )}

          {filteredSessions.map((session) => (
            <div
              key={session.id}
              onClick={() => switchToSession(session.id)}
              style={{
                ...S.sessionItem,
                background: activeId === session.id ? "rgba(201,168,76,0.08)" : "transparent",
                borderLeft: activeId === session.id ? "2px solid var(--gold)" : "2px solid transparent",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "var(--serif)",
                  fontSize: 14,
                  color: activeId === session.id ? "var(--gold)" : "var(--text)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontWeight: 500,
                }}>
                  {session.title}
                </div>
                <div style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color: "var(--text-faint)",
                  marginTop: 3,
                  display: "flex",
                  gap: 8,
                }}>
                  <span>{formatRelativeTime(session.updatedAt)}</span>
                  <span>•</span>
                  <span>{session.messages.length} msgs</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, opacity: 0.6 }}>
                <button
                  onClick={(e) => handleExportSession(session, "md", e)}
                  style={{ ...S.iconBtnSmall, color: "var(--text-dim)" }}
                  title="Export as Markdown"
                >
                  ↓
                </button>
                <button
                  onClick={(e) => handleDeleteSession(session.id, e)}
                  style={{ ...S.iconBtnSmall, color: "var(--red)" }}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={S.sidebarFooter}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: "none" }}
          />
          <button onClick={() => fileInputRef.current?.click()} style={S.footerBtn}>
            ↑ IMPORT
          </button>
          <button onClick={handleExportAll} style={S.footerBtn} disabled={sessions.length === 0}>
            ↓ EXPORT ALL
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={S.main}>
        {/* Top bar */}
        <header style={S.header}>
          <button onClick={() => setShowSidebar(true)} style={S.menuBtn}>
            <span style={{ fontSize: 16 }}>☰</span>
          </button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: "var(--gold)", letterSpacing: "3px" }}>
              ⬡ ADVISORY BOARD
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-faint)", letterSpacing: "1.5px", marginTop: 2 }}>
              {activeId ? "ARCHIVED SESSION" : "STRATEGIC COUNSEL"}
            </div>
          </div>
          <button onClick={startNewSession} style={S.menuBtn} title="New session">
            <span style={{ fontSize: 18 }}>✎</span>
          </button>
        </header>

        {/* Mode tabs */}
        <div style={S.modeBar}>
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{
                ...S.modeTab,
                color: mode === m.id ? "var(--gold)" : "var(--text-faint)",
                borderColor: mode === m.id ? "var(--border-accent)" : "transparent",
                background: mode === m.id ? "var(--gold-faint)" : "transparent",
              }}
            >
              <span style={{ fontSize: 12 }}>{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {/* 1-on-1 picker */}
        {mode === "1on1" && (
          <div style={S.advisorPicker}>
            {BOARD.map((m) => (
              <button
                key={m.id}
                onClick={() => setPick1on1(m.id)}
                style={{
                  ...S.advisorChip,
                  background: pick1on1 === m.id ? m.bg : "transparent",
                  borderColor: pick1on1 === m.id ? `${m.color}40` : "var(--border)",
                  color: pick1on1 === m.id ? m.color : "var(--text-dim)",
                }}
              >
                <span>{m.emoji}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600 }}>
                  {m.name.split(" ")[0]}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Board status strip */}
        <div style={S.statusStrip}>
          {BOARD.map((m) => (
            <div
              key={m.id}
              style={{
                ...S.memberChip,
                background: activeMember === m.id ? m.bg : "transparent",
                borderColor: activeMember === m.id ? `${m.color}30` : "var(--border)",
              }}
            >
              <span style={{ fontSize: 11 }}>{m.emoji}</span>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  color: m.color,
                  letterSpacing: "0.5px",
                }}
              >
                {m.name.split(" ")[0]}
                {activeMember === m.id && (
                  <span style={{ marginLeft: 4, animation: "blink 1.2s infinite" }}>●</span>
                )}
              </span>
            </div>
          ))}
        </div>

        {/* Chat area */}
        <div style={S.chat}>
          {messages.length === 0 && (
            <div style={S.empty}>
              <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.4 }}>🏛️</div>
              <div
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: 22,
                  fontStyle: "italic",
                  color: "var(--gold)",
                  marginBottom: 8,
                }}
              >
                The chamber awaits
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-dim)",
                  maxWidth: 380,
                  lineHeight: 1.7,
                  fontFamily: "var(--serif)",
                }}
              >
                {MODES.find((m) => m.id === mode)?.hint}
              </p>

              {mode === "debate" && (
                <div style={{ marginTop: 28, width: "100%", maxWidth: 380 }}>
                  <div
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      letterSpacing: "2px",
                      color: "var(--text-faint)",
                      marginBottom: 12,
                      textAlign: "center",
                    }}
                  >
                    — SUGGESTED TOPICS —
                  </div>
                  {[
                    "Building a food delivery app for the USA market — finding gaps to exploit",
                    "I want to build an AI code review SaaS",
                    "Should I quit my SDE job to go full-time on a startup?",
                  ].map((s, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setInput(s);
                        inputRef.current?.focus();
                      }}
                      style={S.starter}
                    >
                      <span
                        style={{
                          fontFamily: "var(--serif)",
                          fontSize: 13,
                          fontStyle: "italic",
                          color: "var(--text-dim)",
                        }}
                      >
                        "{s}"
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {errors.length > 0 && (
            <div style={S.errorBox}>
              {errors.map((e, i) => (
                <div
                  key={i}
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    color: "var(--red)",
                    marginBottom: i < errors.length - 1 ? 6 : 0,
                    wordBreak: "break-word",
                  }}
                >
                  ⚠ {e}
                </div>
              ))}
            </div>
          )}

          {messages.map((msg) => {
            if (msg.type === "user") {
              const modeData = MODES.find((m) => m.id === msg.mode);
              return (
                <div key={msg.id} className="fade-in" style={S.userMsg}>
                  <div style={S.userMsgLabel}>
                    YOU {modeData ? `• ${modeData.label.toUpperCase()}` : ""}
                  </div>
                  <div style={S.userMsgContent}>{msg.content}</div>
                </div>
              );
            }

            const isExp = expanded[msg.id];
            const long = msg.content.length > 320;

            return (
              <div
                key={msg.id}
                className="fade-in"
                onClick={() => long && setExpanded((p) => ({ ...p, [msg.id]: !p[msg.id] }))}
                style={{
                  ...S.boardMsg,
                  background: msg.bg,
                  borderLeftColor: msg.color,
                  cursor: long ? "pointer" : "default",
                }}
              >
                <div style={S.boardMsgHeader}>
                  <span style={{ fontSize: 18 }}>{msg.emoji}</span>
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--serif)",
                        fontSize: 16,
                        fontWeight: 600,
                        color: msg.color,
                        lineHeight: 1.2,
                      }}
                    >
                      {msg.name}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 9,
                        color: "var(--text-faint)",
                        letterSpacing: "1px",
                        marginTop: 2,
                      }}
                    >
                      — {msg.role?.toUpperCase()} —
                    </div>
                  </div>
                </div>
                <div
                  className="msg-content"
                  style={{
                    fontSize: 13.5,
                    lineHeight: 1.75,
                    color: "var(--text)",
                    whiteSpace: "pre-wrap",
                    fontFamily: "var(--serif)",
                    maxHeight: isExp || !long ? "none" : 120,
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {msg.content}
                  {!isExp && long && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 36,
                        background: `linear-gradient(transparent, var(--bg))`,
                      }}
                    />
                  )}
                </div>
                {long && (
                  <div
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 9,
                      color: msg.color,
                      marginTop: 6,
                      letterSpacing: "1px",
                    }}
                  >
                    {isExp ? "▲ COLLAPSE" : "▼ TAP TO READ FULL"}
                  </div>
                )}
              </div>
            );
          })}

          {activeMember && (
            <div style={S.thinking}>
              <span style={{ fontSize: 14 }}>{BOARD.find((m) => m.id === activeMember)?.emoji}</span>
              <span className="thinking-shimmer" style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600 }}>
                {BOARD.find((m) => m.id === activeMember)?.name} is composing a response...
              </span>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input */}
        <div style={S.inputBar}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              mode === "1on1" && !pick1on1
                ? "Select an advisor above to begin..."
                : "Present to the board..."
            }
            disabled={busy || (mode === "1on1" && !pick1on1)}
            rows={2}
            style={S.textarea}
          />
          <button
            onClick={send}
            disabled={busy || !input.trim() || (mode === "1on1" && !pick1on1)}
            style={{
              ...S.sendBtn,
              color: busy || !input.trim() ? "var(--text-faint)" : "var(--gold)",
              borderColor: busy || !input.trim() ? "var(--border)" : "var(--border-accent)",
              background: busy || !input.trim() ? "transparent" : "var(--gold-faint)",
            }}
          >
            {busy ? "···" : "CONVENE"}
          </button>
        </div>
      </main>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    height: "100dvh",
    display: "flex",
    color: "var(--text)",
    overflow: "hidden",
  },

  // Sidebar
  sidebar: {
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
    width: "min(320px, 85vw)",
    background: "var(--bg-elevated)",
    borderRight: "1px solid var(--border)",
    zIndex: 60,
    display: "flex",
    flexDirection: "column",
    transition: "transform 0.3s ease",
  },
  sidebarHeader: {
    padding: "16px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sessionList: {
    flex: 1,
    overflowY: "auto",
    padding: "8px",
  },
  sessionItem: {
    padding: "10px 12px",
    borderRadius: 4,
    cursor: "pointer",
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 2,
    transition: "background 0.15s",
  },
  newSessionBtn: {
    width: "100%",
    padding: "10px 12px",
    border: "1px dashed var(--border-accent)",
    borderRadius: 4,
    color: "var(--gold)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
  },
  sidebarFooter: {
    padding: "12px",
    borderTop: "1px solid var(--border)",
    display: "flex",
    gap: 6,
  },
  footerBtn: {
    flex: 1,
    padding: "8px 10px",
    background: "rgba(255,255,255,0.025)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    color: "var(--text-dim)",
    fontFamily: "var(--mono)",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "1.5px",
  },

  // Main
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    height: "100dvh",
  },
  header: {
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "rgba(0,0,0,0.3)",
    backdropFilter: "blur(8px)",
  },
  menuBtn: {
    padding: "8px 10px",
    color: "var(--gold)",
    borderRadius: 4,
  },
  iconBtn: {
    padding: "6px 10px",
    color: "var(--text-dim)",
    fontSize: 16,
  },
  iconBtnSmall: {
    padding: "4px 6px",
    fontSize: 11,
    borderRadius: 3,
  },

  // Tabs
  modeBar: {
    display: "flex",
    gap: 2,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    overflowX: "auto",
    scrollbarWidth: "none",
  },
  modeTab: {
    padding: "8px 12px",
    border: "1px solid",
    borderRadius: 4,
    fontFamily: "var(--mono)",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "1px",
    display: "flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
    transition: "all 0.15s",
  },

  // 1-on-1 picker
  advisorPicker: {
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    gap: 4,
    flexWrap: "wrap",
  },
  advisorChip: {
    padding: "6px 10px",
    border: "1px solid",
    borderRadius: 4,
    display: "flex",
    alignItems: "center",
    gap: 5,
    transition: "all 0.15s",
  },

  // Status
  statusStrip: {
    padding: "10px 12px",
    display: "flex",
    gap: 5,
    overflowX: "auto",
    borderBottom: "1px solid var(--border)",
    scrollbarWidth: "none",
  },
  memberChip: {
    padding: "5px 9px",
    borderRadius: 4,
    border: "1px solid",
    display: "flex",
    alignItems: "center",
    gap: 5,
    minWidth: "fit-content",
    transition: "all 0.3s",
  },

  // Chat
  chat: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minHeight: 0,
  },
  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    textAlign: "center",
  },
  starter: {
    width: "100%",
    padding: "10px 14px",
    background: "rgba(201,168,76,0.03)",
    border: "1px solid rgba(201,168,76,0.1)",
    borderRadius: 4,
    marginBottom: 6,
    textAlign: "left",
    transition: "all 0.15s",
  },

  errorBox: {
    padding: "10px 12px",
    background: "rgba(239,83,80,0.06)",
    border: "1px solid rgba(239,83,80,0.18)",
    borderRadius: 4,
  },

  // User msg
  userMsg: {
    alignSelf: "flex-end",
    maxWidth: "85%",
    background: "var(--gold-faint)",
    border: "1px solid var(--border-accent)",
    borderRadius: "10px 10px 2px 10px",
    padding: "10px 14px",
  },
  userMsgLabel: {
    fontFamily: "var(--mono)",
    fontSize: 9,
    color: "var(--gold)",
    marginBottom: 6,
    letterSpacing: "1.5px",
    fontWeight: 700,
  },
  userMsgContent: {
    fontSize: 13.5,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    fontFamily: "var(--serif)",
  },

  // Board msg
  boardMsg: {
    maxWidth: "94%",
    borderLeft: "3px solid",
    borderRadius: "2px 8px 8px 2px",
    padding: "12px 14px",
    transition: "all 0.15s",
  },
  boardMsgHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },

  thinking: {
    padding: "10px 14px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: 4,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },

  // Input
  inputBar: {
    borderTop: "1px solid var(--border-accent)",
    padding: "10px 12px",
    background: "rgba(0,0,0,0.4)",
    backdropFilter: "blur(8px)",
    display: "flex",
    gap: 8,
    alignItems: "flex-end",
  },
  textarea: {
    flex: 1,
    background: "rgba(255,255,255,0.025)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "10px 12px",
    fontSize: 13.5,
    fontFamily: "var(--serif)",
    lineHeight: 1.5,
    minHeight: 50,
    maxHeight: 150,
  },
  sendBtn: {
    padding: "12px 14px",
    border: "1px solid",
    borderRadius: 6,
    fontFamily: "var(--mono)",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "1.5px",
    whiteSpace: "nowrap",
    transition: "all 0.15s",
    height: 50,
  },
};
