"use client";

import { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import localforage from 'localforage';
import { 
  Send, Image as ImageIcon, LogOut, X, Users, ShieldCheck, 
  User as UserIcon, Download, Check, AlertCircle, Info, Activity,
  Settings, Plus, RotateCcw, Paperclip, FileText
} from 'lucide-react';

import styles from './chat.module.css';
import { generateUserId } from '@/utils/idGenerator';
import { useSocket } from '@/hooks/useSocket';
import { encryptMessage, decryptMessage } from '@/utils/crypto-helper';

const SESSION_SECRET = "internal-app-key-obfuscation";

localforage.config({
  name: 'SenyaaapChat',
  storeName: 'attachments'
});

interface ChatSession {
  room: string;
  password: string;
  role: 'admin' | 'member';
  maxUsers: string;
}

interface RawMessage {
  senderId: string;
  encryptedText: string;
  color: string;
  type: 'text' | 'image' | 'ping' | 'file';
  timestamp?: string;
  startTime?: number; 
  fixedLatency?: number; 
}

interface Message {
  id: string; 
  senderId: string;
  text: string; 
  color: string;
  type: 'text' | 'image' | 'ping' | 'file';
  timestamp: string;
  latency?: number;
  blobUrl?: string;
  fileName?: string; 
}

interface User {
  id: string;
  socketId: string;
  role: 'admin' | 'member';
  nickname?: string;
}

interface ChatState {
  isMounted: boolean;
  userId: string;
  nickname: string;
  session: ChatSession | null;
  messages: Message[];
}

function ChatContent() {
  const router = useRouter();
  const { socket, isConnected } = useSocket();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const [chatState, setChatState] = useState<ChatState>({
    isMounted: false,
    userId: "",
    nickname: "",
    session: null,
    messages: []
  });

  const [inputText, setInputText] = useState('');
  const [members, setMembers] = useState<User[]>([]);
  const [maxCapacity, setMaxCapacity] = useState<number>(0);
  const [rejection, setRejection] = useState({ status: false, msg: "" });
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNickInput, setShowNickInput] = useState(false);
  const [tempNick, setTempNick] = useState('');
  const [isKicked, setIsKicked] = useState(false);
  const [kickConfirm, setKickConfirm] = useState({ status: false, targetId: '', targetSocket: '' });
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const clearLocalDataManual = useCallback(async () => {
    chatState.messages.forEach(msg => {
      if (msg.blobUrl) URL.revokeObjectURL(msg.blobUrl);
    });
    await localforage.clear();
  }, [chatState.messages]);

  const handleExit = useCallback(async () => {
    if (typeof window !== "undefined") {
      await clearLocalDataManual();
      if (chatState.session) {
        sessionStorage.removeItem(`chat_log_${chatState.session.room}`);
        localStorage.removeItem(`user_id_room_${chatState.session.room}`);
      }
      sessionStorage.removeItem('senyaaap_session');
    }
    socket?.disconnect();
    window.location.href = '/';
  }, [socket, chatState.session, clearLocalDataManual]);

  const processIncomingMessage = useCallback(async (data: RawMessage, existingId?: string): Promise<Message> => {
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const msgId = existingId || crypto.randomUUID();
    let displayContent = "";
    let blobUrl = undefined;
    let fileName = undefined;

    const finalLatency = data.fixedLatency;

    try {
      if (data.type !== 'ping') {
        displayContent = decryptMessage(data.encryptedText, chatState.session!.password);
      }
    } catch (err) {
      displayContent = "[Encrypted]";
    }

    if (data.type === 'image' || data.type === 'file') {
      try {
        let storedData: string | null = await localforage.getItem(msgId);
        if (!storedData) {
          await localforage.setItem(msgId, displayContent);
          storedData = displayContent;
        }

        if (data.type === 'image') {
          const res = await fetch(storedData);
          const blob = await res.blob();
          blobUrl = URL.createObjectURL(blob);
        } else {
          const fileInfo = JSON.parse(storedData);
          fileName = fileInfo.name;
          const res = await fetch(fileInfo.base64);
          const blob = await res.blob();
          const mimeType = fileInfo.base64.split(',')[0].split(':')[1].split(';')[0];
          const typedBlob = new Blob([blob], { type: mimeType || 'application/octet-stream' });
          blobUrl = URL.createObjectURL(typedBlob);
        }
      } catch (e) {
        console.error("Storage Error:", e);
      }
    }

    return {
      id: msgId,
      senderId: data.senderId,
      text: (data.type === 'text' || data.type === 'ping') ? data.encryptedText : msgId,
      color: data.color,
      type: data.type,
      timestamp: data.timestamp || timeStr,
      latency: finalLatency,
      blobUrl: blobUrl,
      fileName: fileName
    };
  }, [chatState.session]);

  useEffect(() => {
    let isSubscribed = true;
    const initChat = async () => {
      const savedEncryptedSession = sessionStorage.getItem('senyaaap_session');
      if (!savedEncryptedSession) {
        router.replace('/');
        return;
      }

      let parsedSession: ChatSession;
      try {
        const decryptedSessionJson = decryptMessage(savedEncryptedSession, SESSION_SECRET);
        parsedSession = JSON.parse(decryptedSessionJson);
      } catch (e) {
        router.replace('/');
        return;
      }

      const storageKey = `user_id_room_${parsedSession.room}`;
      let storedId = localStorage.getItem(storageKey);
      if (!storedId) {
        const [rLetter, rNumber] = parsedSession.room.split('-');
        storedId = generateUserId(rLetter || 'A', rNumber || '000');
        localStorage.setItem(storageKey, storedId);
      }

      const savedLogs = sessionStorage.getItem(`chat_log_${parsedSession.room}`);
      let restoredMessages: Message[] = [];
      let savedNickname = "";

      if (savedLogs) {
        try {
          const parsedData = JSON.parse(savedLogs);
          const msgs = parsedData.msgs || [];
          savedNickname = parsedData.nickname || "";

          restoredMessages = await Promise.all(msgs.map(async (m: Message) => {
            if (m.type === 'image' || m.type === 'file') {
              const storedData: string | null = await localforage.getItem(m.id);
              if (storedData) {
                const base64Data = m.type === 'file' ? JSON.parse(storedData).base64 : storedData;
                const res = await fetch(base64Data);
                const blob = await res.blob();
                let finalBlob = blob;
                if(m.type === 'file') {
                   const mimeType = base64Data.split(',')[0].split(':')[1].split(';')[0];
                   finalBlob = new Blob([blob], { type: mimeType });
                }
                return { ...m, blobUrl: URL.createObjectURL(finalBlob), fileName: m.fileName };
              }
            }
            return m;
          }));
        } catch (e) { console.error("Restore Error:", e); }
      }

      if (isSubscribed) {
        setChatState({
          isMounted: true,
          userId: storedId as string,
          nickname: savedNickname,
          session: parsedSession,
          messages: restoredMessages
        });
      }
    };

    initChat();
    return () => { isSubscribed = false; };
  }, [router]);

  useEffect(() => {
    if (chatState.isMounted && chatState.session) {
      const dataToSave = {
        msgs: chatState.messages.map(m => ({ ...m, blobUrl: undefined })), 
        nickname: chatState.nickname
      };
      sessionStorage.setItem(`chat_log_${chatState.session.room}`, JSON.stringify(dataToSave));
    }
  }, [chatState.messages, chatState.nickname, chatState.session, chatState.isMounted]);

  useEffect(() => {
    if (!socket || !isConnected || !chatState.isMounted || !chatState.userId || !chatState.session) return;

    socket.emit('join_room', { 
      ...chatState.session, 
      userId: chatState.userId,
      nickname: chatState.nickname 
    });

    socket.on('room_full_error', (data: { message: string }) => setRejection({ status: true, msg: data.message }));
    
    socket.on('room_data_update', (data: { members: User[], maxUsers: number }) => {
      setMembers(data.members);
      setMaxCapacity(data.maxUsers);
    });

    socket.on('chat_history', async (history: RawMessage[]) => {
      const processed = await Promise.all(history.map(msg => processIncomingMessage(msg)));
      setChatState(prev => ({ ...prev, messages: processed }));
    });

    socket.on('receive_message', async (data: RawMessage) => {
      const newMessage = await processIncomingMessage(data);
      setChatState(prev => ({
        ...prev,
        messages: [...prev.messages, newMessage]
      }));
    });

    socket.on('you_are_kicked', () => setIsKicked(true));
    
    return () => {
      socket.off('room_full_error');
      socket.off('room_data_update');
      socket.off('chat_history');
      socket.off('receive_message');
      socket.off('you_are_kicked');
    };
  }, [socket, isConnected, chatState.isMounted, chatState.userId, chatState.session, processIncomingMessage]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatState.messages]);

  const handleSend = (content?: string, type: 'text' | 'image' | 'ping' | 'file' = 'text', fixedLat?: number) => {
    const textToSend = content || inputText;
    if ((textToSend.trim() || type !== 'text') && socket && chatState.session) {
      const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const encrypted = type === 'ping' ? "Ping" : encryptMessage(textToSend, chatState.session.password);
      const myMemberData = members.find(m => m.id === chatState.userId);
      const currentRole = myMemberData?.role || chatState.session.role;

      socket.emit('send_message', {
        room: chatState.session.room,
        senderId: chatState.userId,
        encryptedText: encrypted,
        color: currentRole === 'admin' ? '#0095f6' : '#ff9500',
        type: type,
        timestamp: timeStr,
        fixedLatency: fixedLat 
      });
      if (type === 'text') setInputText('');
    }
  };

  const handleSaveNickname = () => {
    if (tempNick.trim() && socket) {
      const newNick = tempNick.trim();
      setChatState(prev => ({ ...prev, nickname: newNick }));
      socket.emit('update_nickname', { room: chatState.session?.room, nickname: newNick });
      setShowNickInput(false);
      setTempNick("");
    }
  };

  const handleResetNickname = () => {
    if (socket) {
      setChatState(prev => ({ ...prev, nickname: "" }));
      socket.emit('update_nickname', { room: chatState.session?.room, nickname: "" });
      setTempNick("");
    }
  };

  const handlePingRequest = () => {
    const estimatedLatency = Math.floor(Math.random() * 10) + 5; 
    handleSend("Ping", 'ping', estimatedLatency);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2000000) return alert("File too large (Max 2MB)");
      const reader = new FileReader();
      reader.onloadend = () => handleSend(reader.result as string, 'image');
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5000000) return alert("File too large (Max 5MB)");
      const reader = new FileReader();
      reader.onloadend = () => {
        const filePayload = JSON.stringify({
          name: file.name,
          size: (file.size / 1024).toFixed(1) + " KB",
          base64: reader.result as string
        });
        handleSend(filePayload, 'file');
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  const confirmKickAction = () => {
    socket?.emit('kick_member', { room: chatState.session?.room, targetSocketId: kickConfirm.targetSocket });
    setKickConfirm({ status: false, targetId: '', targetSocket: '' });
  };

  const getUserDisplayName = (senderId: string) => {
    const member = members.find(m => m.id === senderId);
    return member?.nickname || senderId;
  };

  if (!chatState.isMounted || !chatState.session) return null;

  if (rejection.status) {
    return (
      <div className={styles.modalOverlay}>
        <div className={styles.modalContent} style={{ textAlign: 'center' }}>
          <h2 style={{ color: '#ff3b30' }}>Access Denied</h2>
          <p>{rejection.msg}</p>
          <button className={styles.exitBtn} onClick={handleExit}>Return Home</button>
        </div>
      </div>
    );
  }

  const amIAdmin = members.find(u => u.id === chatState.userId)?.role === 'admin';

  return (
    <div className={styles.chatWrapper}>
      <header className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className={`${styles.indicator} ${isConnected ? styles.online : styles.offline}`}></div>
          <button className={styles.iconBtn} onClick={() => setShowSettings(true)} title="Settings">
            <Settings size={18} color="#888" />
          </button>
        </div>
        <div className={styles.statusInfo} onClick={() => setShowMembers(true)}>
          <h2 className={styles.roomTitle}>Room-{chatState.session.room}</h2>
          <span className={styles.userId}>
            <Users size={10} style={{display: 'inline', marginRight: 4}} />
            {members.length}/{maxCapacity} • ID: {chatState.userId}
          </span>
        </div>
        <button className={styles.exitBtn} onClick={() => setShowExitConfirm(true)} title="Exit Room">
          <LogOut size={18} />
        </button>
      </header>

      <div className={styles.messagesArea} ref={scrollRef}>
        {chatState.messages.map((msg: Message, idx: number) => {
          const isMe = msg.senderId === chatState.userId;
          const displayName = getUserDisplayName(msg.senderId);
          let displayContent = "";
          if (msg.type === 'text') {
            try {
              displayContent = decryptMessage(msg.text, chatState.session!.password);
            } catch (err) { displayContent = "[Encrypted]"; }
          }

          return (
            <div key={idx} className={`${styles.bubbleWrapper} ${isMe ? styles.myMessage : ''}`}>
              <div className={styles.avatar} style={{ background: msg.color }}>
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 'bold', color: msg.color, marginBottom: '2px', padding: '0 4px' }}>
                  {displayName} {isMe ? '(You)' : ''}
                </div>
                <div className={`${styles.bubble} ${isMe ? styles.myBubble : styles.theirBubble}`}>
                  {msg.type === 'image' ? (
                    <div className={styles.chatImageWrapper}>
                      <img src={msg.blobUrl} alt="Shared" className={styles.chatImage} onClick={() => setPreviewImg(msg.blobUrl || null)} />
                      <a href={msg.blobUrl} download={msg.fileName || `image_${idx}.png`} className={styles.downloadOverlay}>
                        <Download size={20} />
                      </a>
                    </div>
                  ) : msg.type === 'file' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '160px' }}>
                      <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px', borderRadius: '8px' }}>
                        <FileText size={20} />
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {msg.fileName || 'Attachment'}
                        </div>
                        <div style={{ fontSize: '0.6rem', opacity: 0.7 }}>File</div>
                      </div>
                      <a href={msg.blobUrl} download={msg.fileName || 'file'} style={{ color: isMe ? '#fff' : '#0095f6' }}>
                        <Download size={18} />
                      </a>
                    </div>
                  ) : msg.type === 'ping' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontStyle: 'italic', fontWeight: 'bold' }}>
                      <Activity size={16} /> Ping: {msg.latency}ms
                    </div>
                  ) : (
                    displayContent
                  )}
                </div>
                <div style={{ fontSize: '0.6rem', color: '#888', marginTop: '2px', padding: '0 5px' }}>{msg.timestamp}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.inputContainer}>
        <button className={styles.pingBtn} onClick={handlePingRequest} disabled={!isConnected}>
          <Activity size={20} />
        </button>
        <div className={styles.inputWrapper}>
          <input 
            type="text" className={styles.textInput} placeholder="Type a message..." 
            value={inputText} onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()} disabled={!isConnected}
          />
          <button className={styles.innerActionBtn} onClick={() => fileInputRef.current?.click()} title="Send Image">
            <ImageIcon size={20} />
          </button>
          <button className={styles.innerActionBtn} onClick={() => docInputRef.current?.click()} title="Send Document">
            <Paperclip size={20} />
          </button>
          <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImageUpload} />
          <input type="file" accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.zip" ref={docInputRef} style={{ display: 'none' }} onChange={handleDocUpload} />
        </div>
        <button className={styles.sendBtn} onClick={() => handleSend()} disabled={!isConnected}>
          <Send size={20} />
        </button>
      </div>

      {showExitConfirm && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div style={{ textAlign: 'center' }}>
              <LogOut size={40} color="#ff3b30" style={{ marginBottom: '15px' }} />
              <h3 className={styles.confirmTitle}>Leaving so soon?</h3>
              <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '25px' }}>Are you sure you want to leave the room? All current chat data will be permanently cleared.</p>
              <div className={styles.confirmActions}>
                <button className={`${styles.confirmBtn} ${styles.yesBtn}`} onClick={handleExit}><Check size={18} /> Yes, Leave</button>
                <button className={`${styles.confirmBtn} ${styles.noBtn}`} onClick={() => setShowExitConfirm(false)}><X size={18} /> Stay</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals are unchanged... */}
      {showSettings && (
        <div className={styles.modalOverlay} onClick={() => setShowSettings(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Settings</h3>
              <X size={20} style={{cursor:'pointer'}} onClick={() => setShowSettings(false)} />
            </div>
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ color: '#888', fontSize: '0.85rem' }}>Your Original ID:</div>
              <div style={{ fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '15px' }}>{chatState.userId}</div>
              {chatState.nickname && (
                <div style={{ marginBottom: '15px', padding: '10px', background: 'rgba(0,149,246,0.1)', borderRadius: '8px' }}>
                  <div style={{ color: '#888', fontSize: '0.75rem' }}>Active Nickname:</div>
                  <div style={{ fontWeight: 'bold', color: '#0095f6' }}>{chatState.nickname}</div>
                </div>
              )}
              {!showNickInput ? (
                chatState.nickname ? (
                  <button className={styles.exitBtn} style={{ width: '100%', gap: '8px', display: 'flex', justifyContent: 'center', background: '#444' }} onClick={handleResetNickname}>
                    <RotateCcw size={16} /> Reset Nickname
                  </button>
                ) : (
                  <button className={styles.sendBtn} style={{ width: '100%', borderRadius: '8px', gap: '8px', background: '#262626', border: '1px solid #333' }} onClick={() => setShowNickInput(true)}>
                    <Plus size={18} /> Set Nickname
                  </button>
                )
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input type="text" className={styles.textInput} placeholder="Enter nickname" value={tempNick} onChange={(e) => setTempNick(e.target.value)} autoFocus />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className={styles.sendBtn} style={{ flex: 1, borderRadius: '8px', background: '#262626', border: '1px solid #333' }} onClick={handleSaveNickname}>Save</button>
                    <button className={styles.noBtn} style={{ borderRadius: '8px', padding: '0 15px' }} onClick={() => setShowNickInput(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showMembers && (
        <div className={styles.modalOverlay} onClick={() => setShowMembers(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Room Members ({members.length})</h3>
              <X size={20} style={{cursor:'pointer'}} onClick={() => setShowMembers(false)} />
            </div>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {members.map((u, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '10px 0', borderBottom: '1px solid #333' }}>
                  <div className={styles.avatar} style={{ background: u.role === 'admin' ? '#0095f6' : '#ff9500', width: 30, height: 30 }}>
                    {u.role === 'admin' ? <ShieldCheck size={16} /> : <UserIcon size={16} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '500' }}>{u.nickname || u.id} {u.id === chatState.userId ? '(You)' : ''}</div>
                    <div style={{ fontSize: '0.7rem', color: '#888' }}>{u.role.toUpperCase()}</div>
                  </div>
                  {amIAdmin && u.id !== chatState.userId && (
                    <button className={styles.exitBtn} onClick={() => setKickConfirm({ status: true, targetId: u.id, targetSocket: u.socketId })}>Kick</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isKicked && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ textAlign: 'center' }}>
            <Info size={40} color="#0095f6" />
            <h3 className={styles.confirmTitle}>Notification</h3>
            <p style={{ color: '#888' }}>You have been removed from the room by the Admin.</p>
            <button className={`${styles.confirmBtn} ${styles.noBtn}`} style={{ width: '100%' }} onClick={handleExit}>OK</button>
          </div>
        </div>
      )}

      {kickConfirm.status && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <AlertCircle size={40} color="#ff3b30" />
            <h3 className={styles.confirmTitle}>Remove ID: {kickConfirm.targetId}?</h3>
            <div className={styles.confirmActions}>
              <button className={`${styles.confirmBtn} ${styles.yesBtn}`} onClick={confirmKickAction}><Check size={18} /> Yes, Kick</button>
              <button className={`${styles.confirmBtn} ${styles.noBtn}`} onClick={() => setKickConfirm({ status: false, targetId: '', targetSocket: '' })}><X size={18} /> No</button>
            </div>
          </div>
        </div>
      )}

      {previewImg && (
        <div className={styles.modalOverlay} onClick={() => setPreviewImg(null)}>
          <div className={styles.previewContainer}>
            <img src={previewImg} alt="Preview" className={styles.previewImage} />
            <div className={styles.previewHint}>Click anywhere to close</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatContent />
    </Suspense>
  );
}