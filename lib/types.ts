export type ModeId = "debate" | "research" | "review" | "1on1";

export interface BoardMember {
  id: string;
  name: string;
  role: string;
  emoji: string;
  color: string;
  bg: string;
  persona: string;
}

export interface Mode {
  id: ModeId;
  label: string;
  icon: string;
  hint: string;
}

export interface Message {
  id: string;
  type: "user" | "board";
  content: string;
  // for user messages
  mode?: ModeId;
  // for board messages
  memberId?: string;
  name?: string;
  role?: string;
  emoji?: string;
  color?: string;
  bg?: string;
  timestamp: number;
}

export interface Session {
  id: string;
  title: string;
  topic: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  pinned?: boolean;
  tags?: string[];
}
