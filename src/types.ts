export type AppState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'IDLE'
  | 'USER_SPEAKING'
  | 'AGENT_RESPONDING'
  | 'ERROR';

export interface Message {
  sender: 'AURA' | 'USER';
  text: string;
  isTyping?: boolean;
}

export interface Persona {
  id: string;
  name: string;
  icon: string;
}
