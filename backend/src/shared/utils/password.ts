export function isPasswordValid(password: string): { valid: boolean; message: string } {
  if (!password || password.length < 8) {
    return { valid: false, message: 'A senha deve ter pelo menos 8 caracteres' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'A senha deve conter pelo menos 1 letra maiúscula' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'A senha deve conter pelo menos 1 número' };
  }
  return { valid: true, message: 'Senha válida' };
}
