"use client";

import styles from './page.module.css';
import Button from '@/components/Shared/Button';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function LandingPage() {
  const router = useRouter();

  return (
    <main className={styles.hero}>
      <div className={styles.container}>
        <div className={styles.logoWrapper}>
          <Image 
            src="/images/logo.png" 
            alt="Senyaaap Logo" 
            className={styles.logoImage}
            width={120} 
            height={120}
            priority 
          />
        </div>

        <h1 className={styles.title}>Senyapp!</h1>
        <h2 className={styles.slogan}>Zero logs. Zero traces.</h2>
        
        <p className={styles.description}>
          A lightweight, database-free chat application for instant, 
          untraceable communication. No accounts, no history.
        </p>

        <div className={styles.actionGroup}>
          <Button 
            text="START CHAT" 
            onClick={() => router.push('/create')} 
          />
          <Button 
            text="JOIN CHAT" 
            variant="secondary" 
            onClick={() => router.push('/join')} 
          />
        </div>
      </div>
    </main>
  );
}