interface Props {
  password: string;
}

export function PasswordStrength({ password }: Props) {
  const hasLen = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);

  let level: 0 | 1 | 2 | 3 = 0;
  let label = 'Muito fraca';
  let color = '#e5e7eb';

  if (!password) {
    level = 0;
  } else if (!hasLen) {
    level = 1; label = 'Fraca'; color = '#ef4444';
  } else if (hasLen && hasUpper && hasDigit) {
    level = 3; label = 'Forte'; color = '#16a34a';
  } else {
    level = 2; label = 'Média'; color = '#f59e0b';
  }

  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[1, 2, 3].map((seg) => (
          <div
            key={seg}
            className="h-1.5 flex-1 rounded-full"
            style={{ backgroundColor: seg <= level ? color : '#e5e7eb' }}
          />
        ))}
      </div>
      {password && (
        <div className="text-xs mt-1" style={{ color }}>
          Senha: <span className="font-medium">{label}</span>
        </div>
      )}
      <ul className="text-xs text-slate-500 mt-1 space-y-0.5">
        <li style={{ color: hasLen ? '#16a34a' : '#94a3b8' }}>• Pelo menos 8 caracteres</li>
        <li style={{ color: hasUpper ? '#16a34a' : '#94a3b8' }}>• Pelo menos 1 letra maiúscula</li>
        <li style={{ color: hasDigit ? '#16a34a' : '#94a3b8' }}>• Pelo menos 1 número</li>
      </ul>
    </div>
  );
}
