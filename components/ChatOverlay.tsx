import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage, UserProfile } from '../types';
import { Send, Mic, MicOff, Loader2, Volume2, VolumeX, Globe, Bot, Camera, UserCheck, UserPlus, LogOut, Trash2 } from 'lucide-react';
import { fetchWorldChatMessages } from '../services/geminiService';
import { loadFaceModels, detectFace, matchFace } from '../services/faceService';

interface ChatOverlayProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, isVoice?: boolean) => void;
  isBotSpeaking: boolean;
  usersDb: UserProfile[];
  onLoginSuccess: (user: UserProfile) => void;
  onRegisterUser: (name: string, descriptor: Float32Array) => void;
  currentUser: UserProfile | null;
  onLogout: () => void;
  onClearUsers: () => void;
  isSoundEnabled: boolean;
  onToggleSound: () => void;
}

type Tab = 'ai' | 'world';
type LoginState = 'idle' | 'loading_models' | 'scanning' | 'processing' | 'registering' | 'success';

export const ChatOverlay: React.FC<ChatOverlayProps> = ({ 
    messages, 
    onSendMessage, 
    isBotSpeaking,
    usersDb,
    onLoginSuccess,
    onRegisterUser,
    currentUser,
    onLogout,
    onClearUsers,
    isSoundEnabled,
    onToggleSound
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('ai');
  const [inputText, setInputText] = useState('');
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  // World Chat State
  const [worldMessages, setWorldMessages] = useState<ChatMessage[]>([]);
  const [isWorldLoading, setIsWorldLoading] = useState(false);

  // Login / Face Scan State
  const [loginState, setLoginState] = useState<LoginState>('idle');
  const [tempDescriptor, setTempDescriptor] = useState<Float32Array | null>(null);
  const [registerName, setRegisterName] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Audio Recording Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSpeakingRef = useRef(false);
  const audioStreamRef = useRef<MediaStream | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, worldMessages, activeTab, loginState]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopRecordingProcess();
      stopCamera();
    };
  }, []);

  // Stop camera when switching tabs
  useEffect(() => {
    if (activeTab !== 'ai') {
        stopCamera();
        if (loginState === 'scanning' || loginState === 'loading_models' || loginState === 'processing') {
             setLoginState('idle');
        }
    }
  }, [activeTab, loginState]);

  // FIX: Attach video stream when video element becomes available
  useEffect(() => {
    if ((loginState === 'scanning' || loginState === 'processing') && videoRef.current && streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play().catch(e => console.error("Error playing video:", e));
    }
  }, [loginState]);

  // Polling for World Chat
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const loadWorldChat = async () => {
        if (worldMessages.length === 0) setIsWorldLoading(true);
        
        const data = await fetchWorldChatMessages();
        
        const mappedMessages: ChatMessage[] = data.map((item, index) => ({
            id: `world-${item.id || index}`,
            userId: `user-${item.id || index}`,
            userName: item.name || 'Anonymous',
            userAvatar: `https://picsum.photos/id/${(item.id || index) % 1000}/100/100`,
            text: item.message || '...',
            timestamp: new Date()
        }));

        setWorldMessages(mappedMessages);
        setIsWorldLoading(false);
    };

    if (activeTab === 'world') {
        loadWorldChat();
        interval = setInterval(loadWorldChat, 3000);
    }

    return () => {
        if (interval) clearInterval(interval);
    };
  }, [activeTab]);

  // --- Face Recognition Logic ---

  const startFaceScan = async () => {
    setLoginState('loading_models');
    try {
        await loadFaceModels();
        
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        streamRef.current = stream;
        
        // Note: We don't attach videoRef here because it's not rendered yet.
        // The useEffect above will handle it when loginState changes.
        setLoginState('scanning');

    } catch (e) {
        console.error("Camera/Model Error", e);
        alert("ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตให้เข้าถึงกล้อง");
        setLoginState('idle');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }
  };

  const handleScan = async () => {
    if (!videoRef.current) return;
    
    // Check if video is actually ready
    if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
        alert("กรุณารอกล้องโหลดสักครู่...");
        return;
    }

    setLoginState('processing');

    // Slight delay to allow UI update
    setTimeout(async () => {
        if (!videoRef.current) return;
        const detection = await detectFace(videoRef.current);

        if (detection) {
            const descriptor = detection.descriptor;
            const match = matchFace(descriptor, usersDb);

            if (match) {
                // Found existing user
                onLoginSuccess(match);
                stopCamera();
                setLoginState('success');
                setTimeout(() => setLoginState('idle'), 1000); 
            } else {
                // New user
                setTempDescriptor(descriptor);
                setLoginState('registering');
                stopCamera();
            }
        } else {
            alert("ไม่พบใบหน้า กรุณาขยับหน้าให้ตรงกล้องและอยู่ในที่มีแสงสว่าง");
            setLoginState('scanning');
        }
    }, 100);
  };

  const handleRegister = () => {
    if (registerName.trim() && tempDescriptor) {
        onRegisterUser(registerName, tempDescriptor);
        setLoginState('success');
        setTimeout(() => setLoginState('idle'), 1000);
    }
  };

  // --- Audio Logic ---

  const stopRecordingProcess = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
    }
    if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
        audioContextRef.current.close();
    }
    if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
    }
    setVolumeLevel(0);
    mediaRecorderRef.current = null;
    audioContextRef.current = null;
    audioStreamRef.current = null;
  };

  const startRecordingProcess = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStreamRef.current = stream;

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContextClass();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunksRef.current.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            if (audioChunksRef.current.length === 0) return;
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            if (audioBlob.size < 1000) return;

            setIsProcessingAudio(true);
            try {
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                    const base64String = (reader.result as string).split(',')[1];
                    
                    // FIXED: Send raw base64 audio to App.tsx instead of transcribing locally.
                    // This matches the new multimodal logic in App.tsx
                    onSendMessage(base64String, true);
                    
                    setIsProcessingAudio(false);
                    if (isVoiceEnabled) {
                        startRecordingProcess();
                    }
                };
            } catch (e) {
                console.error("Processing error", e);
                setIsProcessingAudio(false);
            }
        };

        mediaRecorder.start();

        const checkVolume = () => {
            if (!isVoiceEnabled || !analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for(let i = 0; i < bufferLength; i++) sum += dataArray[i];
            const average = sum / bufferLength;
            setVolumeLevel(average);

            const SILENCE_THRESHOLD = 15;
            // Reduce silence duration for faster turn-taking
            const SILENCE_DURATION = 800; 

            if (average > SILENCE_THRESHOLD) {
                isSpeakingRef.current = true;
                if (silenceTimerRef.current) {
                    clearTimeout(silenceTimerRef.current);
                    silenceTimerRef.current = null;
                }
            } else {
                if (isSpeakingRef.current && !silenceTimerRef.current) {
                    silenceTimerRef.current = setTimeout(() => {
                        isSpeakingRef.current = false;
                        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                            mediaRecorderRef.current.stop();
                            if (audioStreamRef.current) {
                                audioStreamRef.current.getTracks().forEach(track => track.stop());
                            }
                        }
                    }, SILENCE_DURATION);
                }
            }
            requestAnimationFrame(checkVolume);
        };
        checkVolume();

    } catch (err) {
        console.error("Error accessing microphone:", err);
        setIsVoiceEnabled(false);
        alert("ไม่สามารถเข้าถึงไมโครโฟนได้");
    }
  };

  const toggleVoice = () => {
    const newState = !isVoiceEnabled;
    setIsVoiceEnabled(newState);
    if (newState) {
        startRecordingProcess();
    } else {
        stopRecordingProcess();
        setIsProcessingAudio(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText, false);
    setInputText('');
  };

  // --- RENDER ---
  const currentMessages = activeTab === 'ai' ? messages : worldMessages;

  return (
    <div className="fixed top-0 bottom-0 right-0 w-full sm:w-96 bg-slate-900/80 backdrop-blur-md border-l border-white/10 flex flex-col shadow-2xl z-50 transition-all duration-300 transform">
      
      {/* Tab Header - Always visible and clickable */}
      <div className="flex border-b border-white/10 bg-slate-900/50 z-30 relative">
        <button 
            onClick={() => setActiveTab('ai')}
            className={`flex-1 p-4 flex items-center justify-center gap-2 transition-all relative ${activeTab === 'ai' ? 'text-blue-400 bg-white/5' : 'text-slate-500 hover:text-slate-300'}`}
        >
            <Bot size={18} />
            <span className="font-semibold text-sm">AI Chat</span>
            {activeTab === 'ai' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.7)]" />}
        </button>
        <button 
            onClick={() => setActiveTab('world')}
            className={`flex-1 p-4 flex items-center justify-center gap-2 transition-all relative ${activeTab === 'world' ? 'text-purple-400 bg-white/5' : 'text-slate-500 hover:text-slate-300'}`}
        >
            <Globe size={18} />
            <span className="font-semibold text-sm">World Chat</span>
             {activeTab === 'world' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-purple-400 shadow-[0_0_10px_rgba(192,132,252,0.7)]" />}
        </button>
      </div>

      {/* Main Content Area - Contains Login Overlay and Chat */}
      <div className="relative flex-1 flex flex-col min-h-0">
          
          {/* LOGIN OVERLAY (Restricted to content area, doesn't cover tabs) */}
          {activeTab === 'ai' && !currentUser && (
            <div className="absolute inset-0 z-20 bg-slate-900/95 flex flex-col items-center justify-center p-6 text-center space-y-6 animate-fade-in">
                
                {loginState === 'idle' && (
                    <>
                        <div className="w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center mb-2 animate-pulse">
                            <Camera size={40} className="text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-2">ยืนยันตัวตน</h2>
                            <p className="text-slate-400 text-sm">สแกนใบหน้าเพื่อเริ่มสนทนาและโหลดประวัติเดิม</p>
                        </div>
                        <button 
                            onClick={startFaceScan}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-semibold shadow-lg shadow-blue-500/30 transition-all flex items-center justify-center gap-2"
                        >
                            <Camera size={18} />
                            <span>เริ่มสแกนใบหน้า</span>
                        </button>
                        
                        {/* Clear Data Button */}
                        {usersDb.length > 0 && (
                            <button
                                onClick={onClearUsers}
                                className="w-full py-2 px-4 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 rounded-full text-sm transition-all flex items-center justify-center gap-2 mt-4"
                            >
                                <Trash2 size={14} />
                                <span>ล้างข้อมูลผู้ใช้ ({usersDb.length})</span>
                            </button>
                        )}
                    </>
                )}

                {loginState === 'loading_models' && (
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 size={40} className="animate-spin text-blue-400" />
                        <p className="text-slate-300">กำลังโหลด AI Model...</p>
                        <p className="text-xs text-slate-500">(ครั้งแรกอาจใช้เวลาสักครู่)</p>
                    </div>
                )}

                {(loginState === 'scanning' || loginState === 'processing') && (
                    <div className="flex flex-col items-center w-full max-w-xs">
                        <div className="relative w-full aspect-[4/3] bg-black rounded-2xl overflow-hidden border-2 border-blue-500/50 shadow-2xl mb-4">
                            <video 
                                ref={videoRef} 
                                autoPlay 
                                playsInline 
                                muted 
                                className="w-full h-full object-cover transform scale-x-[-1]" 
                            />
                            <div className="absolute inset-0 border-2 border-blue-400/30 m-8 rounded-lg animate-pulse" />
                            {loginState === 'processing' && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-sm">
                                    <Loader2 className="animate-spin text-white" size={32} />
                                </div>
                            )}
                        </div>
                        <button 
                            onClick={handleScan}
                            disabled={loginState === 'processing'}
                            className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <UserCheck size={20} />
                            <span>{loginState === 'processing' ? 'กำลังตรวจสอบ...' : 'ถ่ายภาพ'}</span>
                        </button>
                        <button onClick={() => { stopCamera(); setLoginState('idle'); }} className="mt-4 text-slate-500 text-sm hover:text-white">ยกเลิก</button>
                    </div>
                )}

                {loginState === 'registering' && (
                    <div className="w-full max-w-xs animate-fade-in-up">
                        <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto mb-4">
                            <UserPlus size={32} className="text-yellow-400" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-4">ไม่พบข้อมูลผู้ใช้</h3>
                        <input 
                            type="text" 
                            value={registerName}
                            onChange={e => setRegisterName(e.target.value)}
                            placeholder="กรุณากรอกชื่อของคุณ..."
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-yellow-500 outline-none mb-4"
                        />
                        <button 
                            onClick={handleRegister}
                            disabled={!registerName.trim()}
                            className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            ลงทะเบียนและเริ่มแชท
                        </button>
                    </div>
                )}

                {loginState === 'success' && (
                     <div className="flex flex-col items-center gap-3 animate-bounce">
                        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                            <UserCheck size={32} className="text-green-400" />
                        </div>
                        <p className="text-xl font-bold text-white">ยินดีต้อนรับ!</p>
                    </div>
                )}

            </div>
          )}

          {/* Header Info with Sound Toggle */}
          <div className="px-4 py-2 border-b border-white/10 bg-slate-900/30 flex items-center justify-between text-xs text-slate-400 h-10">
            {activeTab === 'ai' ? (
                 <div className="flex items-center gap-2 w-full justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <span>คุยกับ MC (AI)</span>
                        {currentUser && (
                            <div className="flex items-center gap-2 bg-slate-800/50 rounded-full pr-1 max-w-[120px]">
                                <span className="text-blue-400 font-bold px-2 py-0.5 bg-blue-400/10 rounded-l-full truncate">{currentUser.name}</span>
                                <button onClick={onLogout} className="p-1 hover:bg-white/10 rounded-full text-slate-400 hover:text-red-400 transition-colors flex-shrink-0" title="ออกจากระบบ">
                                    <LogOut size={12} />
                                </button>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-3">
                         {isBotSpeaking && (
                            <div className="flex items-center gap-1 text-green-400 animate-pulse">
                                <span className="text-[10px]">กำลังพูด...</span>
                            </div>
                        )}
                        <button 
                            onClick={onToggleSound} 
                            className={`p-1.5 rounded-full transition-colors ${isSoundEnabled ? 'text-green-400 hover:bg-green-500/20' : 'text-slate-500 hover:bg-white/10'}`}
                            title={isSoundEnabled ? "ปิดเสียงบอท" : "เปิดเสียงบอท"}
                        >
                            {isSoundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                        </button>
                    </div>
                 </div>
            ) : (
                 <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                    <span>Realtime Feed (Sheety)</span>
                 </div>
            )}
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            
            {activeTab === 'world' && isWorldLoading && (
                <div className="flex justify-center items-center py-10">
                    <Loader2 className="animate-spin text-purple-400" />
                </div>
            )}

            {currentMessages.length === 0 && !isWorldLoading && (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 opacity-50">
                    <p>ยังไม่มีข้อความ</p>
                    <p className="text-sm">{activeTab === 'ai' ? "เริ่มสนทนาได้เลย!" : "รอข้อความจาก World..."}</p>
                </div>
            )}
            
            {currentMessages.map((msg) => (
              <div key={msg.id} className="flex gap-3 animate-fade-in-up">
                <img 
                  src={msg.userAvatar} 
                  alt={msg.userName} 
                  className="w-10 h-10 rounded-full object-cover border border-white/20 mt-1 flex-shrink-0"
                />
                <div className="flex flex-col min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-sm font-semibold truncate max-w-[120px] ${
                        activeTab === 'world' ? 'text-purple-400' :
                        msg.userId === 'bot' ? 'text-green-400' : 'text-blue-400'
                    }`}>
                        {msg.userName}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className={`p-3 rounded-2xl rounded-tl-none border text-sm break-words shadow-sm mt-1 ${
                    activeTab === 'world' ? 'bg-slate-800 border-purple-500/20 text-slate-200' :
                    msg.userId === 'bot' ? 'bg-green-900/40 border-green-500/30 text-green-100' : 
                    'bg-slate-800/80 border-white/5 text-slate-200'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              </div>
            ))}
            {isProcessingAudio && activeTab === 'ai' && (
                 <div className="flex gap-3 opacity-70">
                    <div className="w-10 h-10 rounded-full bg-slate-700 animate-pulse mt-1 flex-shrink-0" />
                    <div className="flex flex-col">
                         <span className="text-sm text-slate-400 mb-1">กำลังฟัง...</span>
                         <div className="bg-slate-800 p-3 rounded-2xl rounded-tl-none border border-white/5 w-32 h-10 flex items-center justify-center">
                            <div className="flex gap-1">
                                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></span>
                                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                            </div>
                         </div>
                    </div>
                 </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-white/10 bg-slate-900/90 relative">
            {activeTab === 'ai' ? (
                <form onSubmit={handleSubmit} className="flex items-end gap-3 relative z-10">
                <div className="relative flex-1">
                    <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder={isVoiceEnabled ? "กำลังฟังเสียงของคุณ..." : "พิมพ์ข้อความ..."}
                        disabled={isVoiceEnabled || !currentUser} 
                        className={`w-full bg-slate-800 text-white placeholder-slate-500 rounded-2xl pl-4 pr-12 py-3 focus:outline-none focus:ring-2 border border-slate-700 transition-all ${isVoiceEnabled ? 'ring-1 ring-green-500/30 bg-green-900/10 text-slate-400 cursor-not-allowed' : 'focus:ring-blue-500'}`}
                    />
                    {!isVoiceEnabled && (
                        <button 
                            type="submit"
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-colors disabled:opacity-50"
                            disabled={!inputText.trim()}
                        >
                            <Send size={16} />
                        </button>
                    )}
                    
                    {isVoiceEnabled && (
                        <div className="absolute inset-0 rounded-2xl pointer-events-none overflow-hidden flex items-end justify-center opacity-30 pb-1 px-4">
                            <div className="flex items-end gap-1 h-full w-full justify-center">
                                {[...Array(10)].map((_, i) => (
                                    <div 
                                        key={i} 
                                        className="w-1 bg-green-400 transition-all duration-75"
                                        style={{ 
                                            height: `${Math.min(100, Math.max(10, volumeLevel * (1 + Math.random()) * 2))}%`,
                                            opacity: volumeLevel > 10 ? 1 : 0.3
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="flex flex-col items-center gap-1 pb-1">
                    <button
                        type="button"
                        onClick={toggleVoice}
                        disabled={!currentUser}
                        className={`relative inline-flex h-10 w-16 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                            isVoiceEnabled ? 'bg-green-500 focus:ring-green-500' : 'bg-slate-700 focus:ring-slate-500'
                        } ${!currentUser ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={isVoiceEnabled ? "ปิดไมโครโฟน" : "เปิดไมโครโฟน"}
                    >
                        <span className="sr-only">Voice Input</span>
                        <span
                            className={`${
                            isVoiceEnabled ? 'translate-x-7' : 'translate-x-1'
                            } inline-block h-8 w-8 transform rounded-full bg-white shadow-lg transition duration-300 flex items-center justify-center`}
                        >
                            {isVoiceEnabled ? (
                                <Mic size={16} className={`text-green-600 ${isProcessingAudio ? 'animate-pulse' : ''}`} />
                            ) : (
                                <MicOff size={16} className="text-slate-400" />
                            )}
                        </span>
                    </button>
                </div>

                </form>
            ) : (
                <div className="text-center p-3 bg-slate-800/50 rounded-lg border border-white/5 text-slate-400 text-sm">
                    <p>World Chat เป็นแบบ Read-Only (Feed)</p>
                    <p className="text-xs text-slate-500 mt-1">อัปเดตอัตโนมัติจาก Sheety</p>
                </div>
            )}
          </div>
      </div>
    </div>
  );
};