export function parseFromToMs(input: string | number): number {
  if (typeof input === 'number') {
    // поддержим секунды и миллисекунды
    return input < 1e11 ? input * 1000 : input;
  }
  // строки: допускаем "YYYY-MM-DD HH:mm:ss" и ISO
  const s = input.trim();
  const isoish = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2})?$/;
  let ms: number;

  if (isoish.test(s)) {
    // если без 'T' — вставим 'T', и по умолчанию считаем это UTC (добавим 'Z')
    const norm = s.includes('T') ? s : s.replace(' ', 'T');
    ms = Date.parse(norm.endsWith('Z') ? norm : norm + 'Z');
  } else {
    ms = Date.parse(s); // на всякий случай
  }

  if (!Number.isFinite(ms)) {
    throw new RangeError(`Invalid 'from' value: ${input}`);
  }
  return ms;
}