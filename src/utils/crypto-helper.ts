import CryptoJS from 'crypto-js';

/**
 * Encrypts a plain text string using AES-256
 * @param text The message to be encrypted
 * @param secretKey The room password used as encryption key
 */
export const encryptMessage = (text: string, secretKey: string): string => {
  if (!text || !secretKey) return '';
  return CryptoJS.AES.encrypt(text, secretKey).toString();
};

/**
 * Decrypts a cipher text string using AES-256
 * @param cipherText The encrypted message from the server
 * @param secretKey The room password used as decryption key
 */
export const decryptMessage = (cipherText: string, secretKey: string): string => {
  try {
    if (!cipherText || !secretKey) return '';
    
    const bytes = CryptoJS.AES.decrypt(cipherText, secretKey);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    
    if (!originalText) {
      return "[Unable to decrypt: Incorrect Key]";
    }
    
    return originalText;
  } catch (error) {
    console.error("Decryption Error:", error);
    return "[Secure Message]";
  }
};