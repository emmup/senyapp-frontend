export const generateUserId = (roomLetter: string, roomNumber: string): string => {
  const randomAlpha = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const randomAlphanum = (length: number) => {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };
  return `${randomAlpha()}R${roomLetter}${roomNumber}${randomAlphanum(4)}`;
};