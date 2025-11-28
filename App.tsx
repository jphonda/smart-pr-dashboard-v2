import React, { useState, useRef, useEffect } from 'react';
import { FloatingField } from './components/FloatingField';
import { ChatOverlay } from './components/ChatOverlay';
import { Attendee, ChatMessage, TrainingData, UserProfile } from './types';
import { generateBotReply, speakWithBrowser, fetchKnowledgeBase, fetchEventAttendees, processVoiceInteraction } from './services/geminiService';
import { Users, Database } from 'lucide-react';

// Random integer between min and max
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

// Pre-defined colors for avatar rings
const COLORS = [
  'bg-pink-500/20 ring-2 ring-pink-400',
  'bg-blue-500/20 ring-2 ring-blue-400',
  'bg-purple-500/20 ring-2 ring-purple-400',
  'bg-green-500/20 ring-2 ring-green-400',
  'bg-amber-500/20 ring-2 ring-amber-400',
];

const App: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  
  // Knowledge Base State
  const [knowledgeBase, setKnowledgeBase] = useState<TrainingData[]>([]);
  const [isKbLoaded, setIsKbLoaded] = useState(false);
  const [attendeeCount, setAttendeeCount] = useState(0);

  // User Auth / Face Rec State
  const [usersDb, setUsersDb] = useState<UserProfile[]>(() => {
    try {
        const saved = localStorage.getItem('face_users_db');
        if (saved) {
            const parsed = JSON.parse(saved);
            return parsed.map((u: any) => ({
                ...u,
                faceDescriptor: new Float32Array(u.faceDescriptor)
            }));
        }
    } catch (e) {
        console.error("Failed to load users from storage", e);
    }
    return [];
  });
  
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const serializableUsers = usersDb.map(u => ({
        ...u,
        faceDescriptor: Array.from(u.faceDescriptor)
    }));
    localStorage.setItem('face_users_db', JSON.stringify(serializableUsers));
  }, [usersDb]);

  useEffect(() => {
    const initData = async () => {
        const kbData = await fetchKnowledgeBase();
        setKnowledgeBase(kbData);
        setIsKbLoaded(true);

        const sheetAttendees = await fetchEventAttendees();
        setAttendeeCount(sheetAttendees.length);

        const displayAttendees = sheetAttendees.slice(0, 20);
        
        if (containerRef.current && displayAttendees.length > 0) {
            const { width, height } = containerRef.current.getBoundingClientRect();
            
            const mappedAttendees: Attendee[] = displayAttendees.map((p, index) => {
                const sizeRoll = Math.random();
                let radius = 40; 
                if (sizeRoll > 0.8) radius = 60; 
                else if (sizeRoll < 0.3) radius = 30; 

                const speed = 0.5 + Math.random() * 1.5;
                const startY = Math.random() * height; 
                const startX = randomInt(50, width - 100);

                return {
                    id: `sheet-${p.id || index}`,
                    name: p.name || 'Guest',
                    role: p.role || 'Participant',
                    avatarUrl: p.profile || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name || 'G')}&background=random`,
                    x: startX,
                    y: startY,
                    baseX: startX,
                    speed: speed,
                    wobbleOffset: Math.random() * Math.PI * 2,
                    radius: radius,
                    color: COLORS[index % COLORS.length]
                };
            });
            setAttendees(mappedAttendees);
        }
    };
    initData();
  }, []);

  const addMessage = (userId: string, userName: string, userAvatar: string, text: string) => {
    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      userId,
      userName,
      userAvatar,
      text,
      timestamp: new Date()
    };
    
    setMessages(prev => {
        const updated = [...prev, newMessage];
        if (currentUser && (userId === currentUser.id || userId === 'bot')) {
            const updatedUser = { ...currentUser, history: updated };
            setCurrentUser(updatedUser);
            setUsersDb(prevDb => prevDb.map(u => u.id === currentUser.id ? updatedUser : u));
        }
        return updated;
    });
  };

  const handleLoginSuccess = (user: UserProfile) => {
    setCurrentUser(user);
    if (user.history && user.history.length > 0) {
        setMessages(user.history);
        handleSendMessage(`System: User ${user.name} logged in via face recognition.`, true);
    } else {
        setMessages([]);
        handleSendMessage(`สวัสดีครับ ผมชื่อ ${user.name} เพิ่งลงทะเบียนเข้ามาครับ`, true);
    }
  };

  const handleRegisterUser = (name: string, descriptor: Float32Array) => {
    const newUser: UserProfile = {
        id: crypto.randomUUID(),
        name,
        faceDescriptor: descriptor,
        history: [],
        avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
    };
    setUsersDb(prev => [...prev, newUser]);
    setCurrentUser(newUser);
    setMessages([]);
    handleSendMessage(`สวัสดีครับ ผมชื่อ ${name} เป็นผู้ใช้ใหม่ครับ`, true);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setMessages([]);
  };

  const handleClearUsers = () => {
    if (window.confirm("⚠️ คุณแน่ใจหรือไม่ที่จะลบข้อมูลผู้ใช้งานทั้งหมด? ข้อมูลใบหน้าและประวัติการแชทจะหายไปถาวร")) {
        setUsersDb([]);
        setCurrentUser(null);
        setMessages([]);
    }
  };

  const handleSendMessage = async (text: string, isSystemOrVoice: boolean = false) => {
    if (!text) return;
    
    const isSystemPrompt = text.startsWith("System:");
    
    if (!isSystemPrompt) {
        const avatar = currentUser?.avatarUrl || 'https://picsum.photos/id/64/200/200';
        addMessage(currentUser?.id || 'guest', currentUser?.name || 'Guest', avatar, text);
    }

    try {
        let promptToSend = text;
        if (isSystemPrompt) {
             promptToSend = `User ${currentUser?.name} has returned. Greet them warmly by name as the Event MC. Do not mention "System".`;
        }

        const replyText = await generateBotReply(promptToSend, messages, knowledgeBase);
        addMessage('bot', 'น้องช่างนิด ช่างน้อย', 'https://profile.line-scdn.net/0heU5OlBqPOnoINiUP_A9FLTRzNBd_GDwycAJ3HnpiMRkjVi55NgN2SH4wYk8iVSgkMVV2HSo3NEon', replyText);
        
        if (isSoundEnabled) {
            setIsBotSpeaking(true);
            await speakWithBrowser(replyText);
            setIsBotSpeaking(false);
        }
    } catch (error) {
        console.error("Bot failed to reply", error);
        setIsBotSpeaking(false);
    }
  };

  // Improved Voice Interaction Handler using Local TTS
  const handleSendAudio = async (base64Audio: string) => {
    try {
        // 1. Send Audio to Gemini (Multimodal) -> Get Text Transcription & Text Reply
        const { transcription, reply } = await processVoiceInteraction(base64Audio, messages, knowledgeBase);

        if (transcription) {
             const avatar = currentUser?.avatarUrl || 'https://picsum.photos/id/64/200/200';
             addMessage(currentUser?.id || 'guest', currentUser?.name || 'Guest', avatar, transcription);
        }

        if (reply) {
             addMessage('bot', 'น้องช่างนิด ช่างน้อย', 'https://profile.line-scdn.net/0heU5OlBqPOnoINiUP_A9FLTRzNBd_GDwycAJ3HnpiMRkjVi55NgN2SH4wYk8iVSgkMVV2HSo3NEon', reply);
             
             if (isSoundEnabled) {
                setIsBotSpeaking(true);
                // Use Browser TTS instead of fetching MP3 from API
                await speakWithBrowser(reply);
                setIsBotSpeaking(false);
             }
        }

    } catch (error) {
        console.error("Audio interaction failed", error);
        setIsBotSpeaking(false);
    }
  };

  const toggleSound = () => {
    setIsSoundEnabled(prev => !prev);
    // Cancel any current speech when toggling off
    if (isSoundEnabled) {
        window.speechSynthesis.cancel();
    }
  };

  return (
    <div className="relative w-full h-screen bg-slate-900 overflow-hidden flex" ref={containerRef}>
      
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-slate-900 to-black pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-blue-900/20 to-transparent pointer-events-none" />

      <div className="relative flex-1 h-full z-10 pointer-events-none">
        <FloatingField attendees={attendees} containerRef={containerRef} />

        <div className="absolute top-6 left-6 pointer-events-auto z-20 flex flex-col gap-4">
          <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/10 shadow-xl max-w-sm">
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mb-2">
                SmartPR - RETC-101
            </h1>
            <div className="flex items-center gap-2 mb-4 text-slate-300">
                <Users size={18} className="text-blue-400" />
                <span>ผู้เข้าร่วมงาน: <span className="font-bold text-white text-lg">{attendeeCount}</span> คน</span>
            </div>
            
            <div className="flex flex-wrap gap-2">
                <div className="px-3 py-1 bg-white/5 rounded-full text-xs text-slate-400 border border-white/5">
                    {currentUser ? `Logged in as: ${currentUser.name}` : 'Waiting for login...'}
                </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center gap-2">
                <Database size={14} className={isKbLoaded ? "text-green-400" : "text-yellow-400"} />
                <span className="text-xs text-slate-400">
                    Source: Sheety API
                </span>
            </div>
          </div>
        </div>
      </div>

      <ChatOverlay 
        messages={messages} 
        onSendMessage={(text, isVoice) => {
            if (isVoice) {
                // If isVoice=true, 'text' is actually base64 audio from ChatOverlay
                handleSendAudio(text);
            } else {
                handleSendMessage(text);
            }
        }} 
        isBotSpeaking={isBotSpeaking}
        usersDb={usersDb}
        currentUser={currentUser}
        onLoginSuccess={handleLoginSuccess}
        onRegisterUser={handleRegisterUser}
        onLogout={handleLogout}
        onClearUsers={handleClearUsers}
        isSoundEnabled={isSoundEnabled}
        onToggleSound={toggleSound}
      />

    </div>
  );
};

export default App;