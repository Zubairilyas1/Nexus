import bcrypt from 'bcryptjs';

// Password utilities for client-side validation
export function validatePasswordStrength(password: string): { valid: boolean; message: string } {
  if (password.length < 8) return { valid: false, message: "Password must be at least 8 characters" };
  if (!/[A-Z]/.test(password)) return { valid: false, message: "Password must contain at least one uppercase letter" };
  if (!/[a-z]/.test(password)) return { valid: false, message: "Password must contain at least one lowercase letter" };
  if (!/[0-9]/.test(password)) return { valid: false, message: "Password must contain at least one number" };
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) return { valid: false, message: "Password must contain at least one special character" };
  return { valid: true, message: "" };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
