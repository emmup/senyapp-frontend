"use client";

import { useState, useEffect, KeyboardEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import styles from '@/components/Forms/FormCard.module.css';
import pageStyles from '@/app/page.module.css';
import Button from '@/components/Shared/Button';
import { encryptMessage } from '@/utils/crypto-helper';
import { useSocket } from '@/hooks/useSocket';

const SESSION_SECRET = "internal-app-key-obfuscation";

export default function CreateRoom() {
  const router = useRouter();
  const { socket } = useSocket();

  // Form States
  const [roomLetter, setRoomLetter] = useState<string>('A');
  const [roomNumber, setRoomNumber] = useState<string>('');
  const [maxUsers, setMaxUsers] = useState<string>('');
  const [password, setPassword] = useState<string>('');

  // UI States
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showPopup, setShowPopup] = useState<boolean>(false);
  const [popupMsg, setPopupMsg] = useState<string>('');

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  // --- LOGIC TO SAVE SESSION AND REDIRECT ---
  const processCreateRoom = () => {
    const finalLetter = roomLetter || 'A';
    const sessionData = {
      room: `${finalLetter}-${roomNumber}`,
      password: password,
      maxUsers: maxUsers,
      role: 'admin',
      intent: 'create'
    };

    const sessionString = JSON.stringify(sessionData);
    const encryptedSession = encryptMessage(sessionString, SESSION_SECRET);

    sessionStorage.setItem('senyaaap_session', encryptedSession);
    router.push('/chat');
  };

  // --- LISTEN TO SERVER RESPONSES ---
  useEffect(() => {
    if (!socket) return;

    socket.on('room_status', (data: { available: boolean; message?: string }) => {
      setIsLoading(false);
      if (data.available) {
        processCreateRoom();
      } else {
        setPopupMsg(data.message || "Room ID is already in use!");
        setShowPopup(true);
      }
    });

    socket.on('connect_error', () => {
      setIsLoading(false);
    });

    return () => {
      socket.off('room_status');
      socket.off('connect_error');
    };
  }, [socket, roomLetter, roomNumber, maxUsers, password]);

  // --- HANDLERS ---
  const handleNext = () => {
    const idx = letters.indexOf(roomLetter.toUpperCase());
    setRoomLetter(letters[idx === -1 ? 0 : (idx + 1) % 26]);
  };

  const handlePrev = () => {
    const idx = letters.indexOf(roomLetter.toUpperCase());
    setRoomLetter(letters[idx === -1 ? 0 : (idx - 1 + 26) % 26]);
  };

  const blockInvalidChar = (e: KeyboardEvent<HTMLInputElement>) => {
    if (["e", "E", "+", "-", "."].includes(e.key)) e.preventDefault();
  };

  const handleLetterChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    if (val === "" || /^[A-Z]$/.test(val)) setRoomLetter(val);
  };

  const handleCreateRequest = () => {
    if (!roomNumber || !maxUsers || !password) {
      setPopupMsg("Please fill in all fields!");
      setShowPopup(true);
      return;
    }
    if (password.length < 6) {
      setPopupMsg("Password must be at least 6 characters.");
      setShowPopup(true);
      return;
    }

    if (socket && socket.connected) {
      setIsLoading(true);
      const fullRoomId = `${roomLetter || 'A'}-${roomNumber}`;
      socket.emit('check_room_availability', { room: fullRoomId });
    } else {
      setPopupMsg("Server connection lost. Please refresh the page.");
      setShowPopup(true);
    }
  };

  return (
    <main className={pageStyles.hero}>
      <div className={styles.card}>
        <h1 className={styles.title}>Create Room</h1>
        
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

        <div className={styles.fieldGroup}>
          <label className={styles.label}>Max Users (Limit 20)</label>
          <input 
            className={`${styles.input} no-spin`} 
            type="number" 
            value={maxUsers}
            onKeyDown={blockInvalidChar}
            onChange={(e) => {
              const inputValue = e.target.value;
              if (inputValue === "") { setMaxUsers(""); return; }
              const val = parseInt(inputValue);
              if (!isNaN(val)) {
                if (val > 20) setMaxUsers("20");
                else if (val < 1) setMaxUsers("1");
                else setMaxUsers(val.toString());
              }
            }}
            placeholder="1-20"
          />
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label}>Password (Min. 6 char)</label>
          <input 
            className={styles.input} 
            type="password" 
            placeholder="Enter Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <Button 
          text={isLoading ? "Checking Room..." : "Create & Start"} 
          onClick={handleCreateRequest} 
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

      {showPopup && (
        <div className={styles.overlay}>
          <div className={styles.popup}>
            <div className={styles.popupIcon}>⚠️</div>
            <h3 className={styles.popupTitle}>Wait a second!</h3>
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