export interface Attendee {
  id: string;
  name: string;
  avatarUrl: string;
  role?: string;
  // Physics properties
  x: number; // Current visual X
  y: number; // Current visual Y
  baseX: number; // The center axis for the horizontal wobble
  speed: number; // Vertical rising speed
  wobbleOffset: number; // Random offset for sine wave phase
  radius: number; // Size
  color: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  timestamp: Date;
}

export interface GeneratedPersona {
  name: string;
  role: string;
  greeting: string;
}

export interface TrainingData {
  [key: string]: any;
}

export interface WorldChatRecord {
  id: number;
  name?: string;
  message?: string;
  timestamp?: string; 
  [key: string]: any;
}

export interface StayinRecord {
  id: number;
  name?: string;
  image?: string; // Sheety usually maps columns to camelCase
  role?: string;
  [key: string]: any;
}

export interface UserProfile {
  id: string;
  name: string;
  faceDescriptor: Float32Array; // The biometric data
  history: ChatMessage[];
  avatarUrl?: string;
}