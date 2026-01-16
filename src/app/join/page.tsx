"use client";

import { useState, useEffect, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import styles from '@/components/Forms/FormCard.module.css';
import pageStyles from '@/app/page.module.css';
import Button from '@/components/Shared/Button';
import { encryptMessage } from '@/utils/crypto-helper';
import { useSocket } from '@/hooks/useSocket';

const SESSION_SECRET = "internal-app-key-obfuscation";

export default function JoinRoom() {
  const router = useRouter();
  const { socket } = useSocket();

  // Form States
  const [roomLetter, setRoomLetter] = useState<string>('A');
  const [roomNumber, setRoomNumber] = useState<string>('');
  const [password, setPassword] = useState<string>('');

  // UI States
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showPopup, setShowPopup] = useState<boolean>(false);
  const [popupMsg, setPopupMsg] = useState<string>('');

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  // --- LOGIC TO SAVE SESSION AND REDIRECT ---
  const processJoinRoom = () => {
    const finalLetter = roomLetter || 'A';
    const sessionData = {
      room: `${finalLetter}-${roomNumber}`,
      role: 'member',
      password: password,
      maxUsers: 20, // Default for members
      intent: 'join'
    };

    const sessionString = JSON.stringify(sessionData);
    const encryptedSession = encryptMessage(sessionString, SESSION_SECRET);

    sessionStorage.setItem('senyaaap_session', encryptedSession);
    router.push('/chat');
  };

  // --- LISTEN TO SERVER RESPONSES ---
  useEffect(() => {
    if (!socket) return;

    // validation result from server
    socket.on('join_validation_result', (data: { success: boolean; message?: string }) => {
      setIsLoading(false);
      if (data.success) {
        processJoinRoom();
      } else {
        setPopupMsg(data.message || "Invalid Room ID or Password.");
        setShowPopup(true);
      }
    });

    socket.on('connect_error', () => {
      setIsLoading(false);
    });

    return () => {
      socket.off('join_validation_result');
      socket.off('connect_error');
    };
  }, [socket, roomLetter, roomNumber, password]);

  // --- HANDLERS ---
  const handleNext = () => {
    const idx = letters.indexOf(roomLetter.toUpperCase());
    setRoomLetter(letters[idx === -1 ? 0 : (idx + 1) % 26]);
  };

  const handlePrev = () => {
    const idx = letters.indexOf(roomLetter.toUpperCase());
    setRoomLetter(letters[idx === -1 ? 0 : (idx - 1 + 26) % 26]);
  };

  const handleLetterChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    if (val === "" || /^[A-Z]$/.test(val)) setRoomLetter(val);
  };

  const handleJoinRequest = () => {
    // Client Validation
    if (!roomNumber || !password) {
      setPopupMsg("Please fill in all fields!");
      setShowPopup(true);
      return;
    }

    // Server Validation Request
    if (socket && socket.connected) {
      setIsLoading(true);
      const fullRoomId = `${roomLetter || 'A'}-${roomNumber}`;
      
      // validation check before actually moving to chat
      socket.emit('validate_join', { 
        room: fullRoomId, 
        password: password 
      });
    } else {
      setPopupMsg("Server connection lost. Please refresh the page.");
      setShowPopup(true);
    }
  };

  return (
    <main className={pageStyles.hero}>
      <div className={styles.card}>
        <h1 className={styles.title}>Join Room</h1>
        
        {/* Room ID Selector */}
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Room Letter</label>
          <div className={styles.selector}>
            <button type="button" className={styles.navBtn} onClick={handlePrev}>&lt;</button>
            <input 
              className={styles.bigValue} 
              value={roomLetter} 
              onChange={handleLetterChange}
              maxLength={1}
              spellCheck={false}
            />
            <button type="button" className={styles.navBtn} onClick={handleNext}>&gt;</button>
          </div>
        </div>

        {/* Room Number Input */}
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Room Number</label>
          <input 
            className={`${styles.input} no-spin`} 
            type="text"
            inputMode="numeric"
            value={roomNumber}
            onChange={(e) => {
              const val = e.target.value;
              if (/^\d*$/.test(val) && val.length <= 3) setRoomNumber(val);
            }}
            placeholder="Ex: 123"
          />
        </div>

        {/* Password Input */}
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Password</label>
          <input 
            className={styles.input} 
            type="password" 
            placeholder="Enter Room Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <Button 
          text={isLoading ? "Joining..." : "Join Chat"} 
          onClick={handleJoinRequest} 
          fullWidth 
          disabled={isLoading} 
        />

        <button 
          onClick={() => router.push('/')} 
          className={styles.cancelBtn}
          disabled={isLoading}
        >
          Cancel
        </button>
      </div>

      {/* POPUP MODAL */}
      {showPopup && (
        <div className={styles.overlay}>
          <div className={styles.popup}>
            <div className={styles.popupIcon}>⚠️</div>
            <h3 className={styles.popupTitle}>Authentication Failed</h3>
            <p className={styles.popupText}>{popupMsg}</p>
            <button 
              className={styles.popupBtn} 
              onClick={() => setShowPopup(false)}
            >
              Understand
            </button>
          </div>
        </div>
      )}
    </main>
  );
}