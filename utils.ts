
import { CTE, PaymentType } from './types';

export const parseCurrency = (value: string): number => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  return parseFloat(value.replace(/\./g, '').replace(',', '.'));
};

export const parseDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
};

export const formatImageUrl = (url: string, useThumbnail: boolean = true): string => {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    const idMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/) || trimmed.match(/id=([a-zA-Z0-9_-]+)/);
    const id = idMatch ? idMatch[1] : null;

    if (id) {
        if (useThumbnail) return `https://drive.google.com/thumbnail?id=${id}&sz=w800`;
        return `https://drive.google.com/uc?export=view&id=${id}`;
    }
    return trimmed.startsWith('http') ? trimmed : '';
};

export const parseDateTime = (dateStr: string): number => {
    if (!dateStr || typeof dateStr !== 'string') return 0;
    try {
        const parts = dateStr.split(' '); 
        const datePart = parts[0];
        const timePart = parts[1] || '00:00';
        const [d, m, y] = datePart.split('/').map(Number);
        const [hh, mm] = timePart.split(':').map(Number);
        return new Date(y, m - 1, d, hh, mm).getTime();
    } catch (e) { return 0; }
};

export const calculateBusinessDaysDiff = (dateStr: string, holidays: string[], referenceDate?: Date | string): number | null => {
  const target = parseDate(dateStr);
  if (!target) return null;
  let today = referenceDate ? (typeof referenceDate === 'string' ? parseDate(referenceDate) || new Date() : new Date(referenceDate)) : new Date();
  today.setHours(0,0,0,0);
  target.setHours(0,0,0,0);
  const holidayTimestamps = new Set(holidays.map(h => parseDate(h)?.setHours(0,0,0,0)).filter(Boolean) as number[]);
  const start = new Date(today);
  const end = new Date(target);
  if (start.getTime() === end.getTime()) return 0;
  const isFuture = end.getTime() > start.getTime();
  let count = 0;
  const loopStart = new Date(isFuture ? start : end);
  const loopEnd = new Date(isFuture ? end : start);
  loopStart.setDate(loopStart.getDate() + 1);
  while (loopStart <= loopEnd) {
      if (!holidayTimestamps.has(loopStart.getTime())) count++;
      loopStart.setDate(loopStart.getDate() + 1);
  }
  return isFuture ? count : -count;
};

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'CRITICO': return 'bg-red-700 text-white border border-red-900';
    case 'FORA_DO_PRAZO': return 'bg-red-500 text-white border border-red-600';
    case 'PRIORIDADE': return 'bg-orange-500 text-white border border-orange-600';
    case 'VENCE_AMANHA': return 'bg-yellow-400 text-yellow-900 border border-yellow-500';
    case 'NO_PRAZO': return 'bg-cyan-500 text-white border border-cyan-600';
    case 'LOCALIZADA': case 'MERCADORIA LOCALIZADA': return 'bg-green-600 text-white border border-green-700';
    default: return 'bg-gray-200 text-gray-700';
  }
};

export const getPaymentColor = (type: string) => {
  const normalized = type ? type.toUpperCase().trim() : '';
  if (normalized.includes('FOB')) return 'text-red-700 bg-red-50 border border-red-200';
  if (normalized.includes('CIF')) return 'text-blue-700 bg-blue-50 border border-blue-200';
  if (normalized.includes('REMETENTE')) return 'text-orange-700 bg-orange-50 border border-orange-200';
  if (normalized.includes('DEST')) return 'text-purple-700 bg-purple-50 border border-purple-200';
  return 'text-gray-600 bg-gray-50 border border-gray-200';
};

export const calculateStatus = (cte: CTE, config: { today: Date, limitDays: number, holidays: string[] }): CTE['computedStatus'] => {
  const limitDate = parseDate(cte.dataLimite);
  if (!limitDate) return 'NO_PRAZO';
  const daysDiff = calculateBusinessDaysDiff(cte.dataLimite, config.holidays, config.today);
  if (daysDiff !== null && daysDiff < -config.limitDays) return 'CRITICO';
  if (daysDiff === null) return 'NO_PRAZO';
  if (daysDiff < 0) return 'FORA_DO_PRAZO';
  if (daysDiff === 0) return 'PRIORIDADE';
  if (daysDiff === 1) return 'VENCE_AMANHA';
  return 'NO_PRAZO';
};

export const compressImage = (file: File, maxWidth = 800, quality = 0.6): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const elem = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round(height * (maxWidth / width));
          width = maxWidth;
        }
        elem.width = width;
        elem.height = height;
        const ctx = elem.getContext('2d');
        if (!ctx) return reject('Canvas error');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(elem.toDataURL('image/jpeg', quality));
      };
    };
  });
};
