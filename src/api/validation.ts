export const sanitizeEmail = (email: string) => email.trim().toLowerCase();

export const isValidEmail = (value: string) =>
  /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value);

export const isStrongPassword = (value: string) =>
  /[A-Z]/.test(value) && /[a-z]/.test(value) && /\\d/.test(value);
