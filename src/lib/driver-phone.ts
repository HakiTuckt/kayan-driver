export function normalizeDriverPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('260') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+260${digits.slice(1)}`;
  throw new Error('Enter a valid Zambian number, for example +260 970 000 000.');
}
