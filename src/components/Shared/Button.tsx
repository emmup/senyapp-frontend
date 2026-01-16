import styles from './Button.module.css';

interface ButtonProps {
  text: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  fullWidth?: boolean;
  disabled?: boolean;
}

export default function Button({ 
  text, 
  onClick, 
  variant = 'primary', 
  fullWidth, 
  disabled 
}: ButtonProps) {
  return (
    <button 
      className={`${styles.btn} ${styles[variant]} ${fullWidth ? styles.full : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {text}
    </button>
  );
}