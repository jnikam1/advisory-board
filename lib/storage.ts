import type { Session, Message } from "./types";

const STORAGE_KEY = "advisory-board-sessions";
const ACTIVE_KEY = "advisory-board-active";

export function loadSessions(): Session[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Session[];
    return parsed.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveSession(session: Session): void {
  if (typeof window === "undefined") return;
  const all = loadSessions().filter((s) => s.id !== session.id);
  all.unshift({ ...session, updatedAt: Date.now() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function deleteSession(id: string): void {
  if (typeof window === "undefined") return;
  const all = loadSessions().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function getActiveSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveSessionId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

export function createSession(topic: string): Session {
  const now = Date.now();
  const id = `s-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const title = generateTitle(topic);
  return {
    id,
    title,
    topic,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

export function generateTitle(topic: string): string {
  const cleaned = topic.trim().replace(/\s+/g, " ");
  if (cleaned.length <= 50) return cleaned;
  return cleaned.slice(0, 47) + "...";
}

export function exportSessionAsJSON(session: Session): string {
  return JSON.stringify(session, null, 2);
}

export function exportSessionAsMarkdown(session: Session): string {
  const date = new Date(session.createdAt).toLocaleString();
  let md = `# ${session.title}\n\n`;
  md += `*Session created: ${date}*\n\n`;
  md += `**Topic:** ${session.topic}\n\n---\n\n`;

  for (const msg of session.messages) {
    if (msg.type === "user") {
      const mode = msg.mode ? ` (${msg.mode})` : "";
      md += `## 👤 You${mode}\n\n${msg.content}\n\n`;
    } else {
      md += `## ${msg.emoji} ${msg.name} — *${msg.role}*\n\n${msg.content}\n\n`;
    }
    md += "---\n\n";
  }
  return md;
}

export function downloadFile(filename: string, content: string, type: string = "text/plain"): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importSessions(jsonString: string): Session[] {
  try {
    const parsed = JSON.parse(jsonString);
    const sessions = Array.isArray(parsed) ? parsed : [parsed];
    return sessions.filter((s: any) => s && s.id && s.messages);
  } catch {
    return [];
  }
}

export function searchSessions(sessions: Session[], query: string): Session[] {
  if (!query.trim()) return sessions;
  const q = query.toLowerCase();
  return sessions.filter((s) => {
    if (s.title.toLowerCase().includes(q)) return true;
    if (s.topic.toLowerCase().includes(q)) return true;
    return s.messages.some((m) => m.content.toLowerCase().includes(q));
  });
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
