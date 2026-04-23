export interface Conversation {
  id: string;
  userId: string;
  agent: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'agent';
  text: string;
  agent?: string;
  traceId?: string;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  toolCalls?: string[];
  createdAt: string;
}

export interface ConversationStore {
  getOrCreate(conversationId: string, userId: string, agent: string): Promise<Conversation> | Conversation;
  get(conversationId: string, userId: string): Promise<Conversation | null> | (Conversation | null);
  addMessage(message: ChatMessage): Promise<void> | void;
  listMessages(conversationId: string, userId: string): Promise<ChatMessage[]> | ChatMessage[];
}
