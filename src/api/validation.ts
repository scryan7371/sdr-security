export const sanitizeEmail = (email: string) => email.trim().toLowerCase();
export const isValidEmail = (value: string) => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);
export const isStrongPassword = (value: string) => /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value);
