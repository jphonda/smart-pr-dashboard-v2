import { GoogleGenAI, Type } from "@google/genai";
import { GeneratedPersona, ChatMessage, TrainingData, WorldChatRecord, StayinRecord } from '../types';

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const generateFakeAttendees = async (count: number = 3): Promise<GeneratedPersona[]> => {
  if (!apiKey) {
    console.warn("API Key is missing. Returning fallback data.");
    return [
      { name: "สมชาย ใจดี", role: "Developer", greeting: "สวัสดีครับทุกคน!" },
      { name: "วิไลวรรณ รักงาน", role: "Designer", greeting: "งานสวยมากค่ะ" }
    ];
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Generate ${count} fictional Thai event attendees. Each should have a realistic Thai name, a job title, and a short, casual chat message greeting the event (in Thai).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              role: { type: Type.STRING },
              greeting: { type: Type.STRING }
            },
            required: ["name", "role", "greeting"]
          }
        }
      }
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text) as GeneratedPersona[];

  } catch (error) {
    console.error("Gemini generation error:", error);
    return [];
  }
};

export const fetchKnowledgeBase = async (): Promise<TrainingData[]> => {
    try {
        const response = await fetch('https://api.sheety.co/423538c420e6cba4d60e9a41d250224e/chatGpt/traning');
        const data = await response.json();
        return data.traning || [];
    } catch (error) {
        console.error("Failed to fetch knowledge base:", error);
        return [];
    }
};

export const fetchWorldChatMessages = async (): Promise<WorldChatRecord[]> => {
    try {
        const response = await fetch(`https://api.sheety.co/423538c420e6cba4d60e9a41d250224e/chatGpt/chat?_=${new Date().getTime()}`);
        const data = await response.json();
        return data.chat || [];
    } catch (error) {
        console.error("Failed to fetch world chat:", error);
        return [];
    }
};

export const fetchEventAttendees = async (): Promise<StayinRecord[]> => {
    try {
        const response = await fetch(`https://api.sheety.co/423538c420e6cba4d60e9a41d250224e/chatGpt/stayin?_=${new Date().getTime()}`);
        const data = await response.json();
        return data.stayin || [];
    } catch (error) {
        console.error("Failed to fetch attendees:", error);
        return [];
    }
};

export const generateBotReply = async (
    userMessage: string, 
    history: ChatMessage[],
    knowledgeBase: TrainingData[]
): Promise<string> => {
    if (!apiKey) return "API Key missing (Bot)";
    try {
        const historyText = history.slice(-10).map(msg => 
            `${msg.userId === 'bot' ? 'MC' : 'User (${msg.userName})'}: ${msg.text}`
        ).join('\n');

        const kbText = JSON.stringify(knowledgeBase);

        const prompt = `
        You are an intelligent and helpful Event MC for "Isan Innovation". 
        
        Reference Information:
        ${kbText}

        Conversation History:
        ${historyText}

        Current User Message: "${userMessage}"

        Instructions:
        1. Answer based on Reference Information if applicable.
        2. If general chit-chat, be polite and fun.
        3. Keep response concise (under 40 words).
        4. Always reply in Thai.
        `;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });
        return response.text || "ครับผม";
    } catch (e) {
        console.error("Bot Reply Error", e);
        return "ขออภัยครับ ระบบขัดข้องเล็กน้อย";
    }
};

export const transcribeAudio = async (base64Audio: string, mimeType: string = 'audio/webm'): Promise<string> => {
    if (!apiKey) return "";
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: {
                parts: [
                    { inlineData: { mimeType: mimeType, data: base64Audio } },
                    { text: "Transcribe the spoken Thai audio into text. Return ONLY the transcribed text." }
                ]
            }
        });
        return response.text?.trim() || "";
    } catch (e) {
        console.error("Transcription Error", e);
        return "";
    }
};

// --- Fast Local TTS Implementation ---

export const speakWithBrowser = (text: string) => {
    return new Promise<void>((resolve) => {
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'th-TH'; // Force Thai language
        utterance.rate = 1.3; // Speed up slightly for natural flow
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Try to select a Thai voice if available
        const voices = window.speechSynthesis.getVoices();
        const thaiVoice = voices.find(v => v.lang.includes('th'));
        if (thaiVoice) {
            utterance.voice = thaiVoice;
        }

        utterance.onend = () => {
            resolve();
        };

        utterance.onerror = (e) => {
            console.error("Browser TTS Error", e);
            resolve();
        };

        window.speechSynthesis.speak(utterance);
    });
};

// --- Optimized Multimodal Interaction (Returns Text ONLY) ---

export const processVoiceInteraction = async (
    base64Audio: string, 
    history: ChatMessage[],
    knowledgeBase: TrainingData[]
): Promise<{ transcription: string, reply: string }> => {
    if (!apiKey) return { transcription: "", reply: "Error: No API Key" };

    try {
         const historyText = history.slice(-5).map(msg => 
            `${msg.userId === 'bot' ? 'MC' : 'User'}: ${msg.text}`
        ).join('\n');

        const kbText = JSON.stringify(knowledgeBase);

        const prompt = `
        You are an Event MC.
        
        Context:
        ${kbText}
        History:
        ${historyText}

        Task:
        1. Listen to the user's audio input.
        2. Transcribe exactly what the user said in Thai (key: "transcription").
        3. Generate a polite, concise (max 2 sentences) Thai response (key: "reply").
        
        Return JSON ONLY: { "transcription": "...", "reply": "..." }
        `;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: {
                parts: [
                    { inlineData: { mimeType: 'audio/webm', data: base64Audio } },
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: "application/json",
                // Note: We removed responseModalities to get TEXT output only (Faster!)
            }
        });

        const jsonText = response.text;
        if (!jsonText) throw new Error("Empty response");
        
        const result = JSON.parse(jsonText);
        return {
            transcription: result.transcription || "",
            reply: result.reply || "ขอโทษครับ ผมไม่ได้ยิน"
        };

    } catch (e) {
        console.error("Voice Interaction Error", e);
        return { transcription: "", reply: "เกิดข้อผิดพลาดในการประมวลผลเสียง" };
    }
};
