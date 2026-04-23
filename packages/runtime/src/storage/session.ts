export interface SessionMessage {
  role: 'user' | 'agent';
  text: string;
  agent?: string;
  timestamp: string;
}

export interface Session {
  id: string;
  userId: string;
  messages: SessionMessage[];
  lastActivity: string;
}

export interface SessionStore {
  getOrCreate(id: string, userId: string): Session;
  append(id: string, message: SessionMessage): void;
  getHistory(id: string): string;
}
