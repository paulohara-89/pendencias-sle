
import { CTE, PaymentType } from './types';

// Helper to parse Brazilian currency "1.500,00" to float
export const parseCurrency = (value: string): number => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  return parseFloat(value.replace(/\./g, '').replace(',', '.'));
};

// Helper to parse DD/MM/AAAA to Date object
export const parseDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
};

/**
 * Transforma links do Google Drive em links diretos de visualização para tags <img>.
 * Suporta links de compartilhamento (/file/d/...) e links diretos (id=...).
 */
export const formatImageUrl = (url: string): string => {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    
    // Se já for um link de visualização direta, apenas garante que está no formato correto
    if (trimmed.includes('drive.google.com') && trimmed.includes('export=view')) {
        return trimmed;
    }

    // Se for um link de download direto, muda para visualização
    if (trimmed.includes('drive.google.com') && trimmed.includes('export=download')) {
        return trimmed.replace('export=download', 'export=view');
    }

    // Extração de ID para links de compartilhamento padrão
    if (trimmed.includes('drive.google.com')) {
        let id = '';
        if (trimmed.includes('/file/d/')) {
            const parts = trimmed.split('/file/d/');
            if (parts[1]) id = parts[1].split('/')[0].split('?')[0];
        } else if (trimmed.includes('id=')) {
            const parts = trimmed.split('id=');
            if (parts[1]) id = parts[1].split('&')[0];
        }
        
        if (id) {
            return `https://drive.google.com/uc?export=view&id=${id}`;
        }
    }
    
    return trimmed;
};

// New Helper: Parse DD/MM/YYYY HH:mm:ss for sorting
export const parseDateTime = (dateStr: string): number => {
    if (!dateStr || typeof dateStr !== 'string') return 0;
    try {
        const parts = dateStr.split(' '); 
        const datePart = parts[0];
        const timePart = parts[1];

        const dateParts = datePart.split('/');
        if (dateParts.length < 3) return 0;
        
        const day = parseInt(dateParts[0]);
        const month = parseInt(dateParts[1]) - 1;
        const year = parseInt(dateParts[2]);

        let hour = 0;
        let minute = 0;
        let second = 0;

        if (timePart) {
            const timeParts = timePart.split(':');
            hour = parseInt(timeParts[0]) || 0;
            minute = parseInt(timeParts[1]) || 0;
            second = parseInt(timeParts[2]) || 0;
        }

        const d = new Date(year, month, day, hour, minute, second);
        return d.getTime();
    } catch (e) {
        return 0;
    }
};

// Helper to calculate difference in BUSINESS days
export const calculateBusinessDaysDiff = (dateStr: string, holidays: string[], referenceDate?: Date | string): number | null => {
  const target = parseDate(dateStr);
  if (!target) return null;
  
  let today: Date;
  if (referenceDate) {
    if (typeof referenceDate === 'string') {
        today = parseDate(referenceDate) || new Date();
    } else {
        today = new Date(referenceDate);
    }
  } else {
    today = new Date();
  }
  
  today.setHours(0,0,0,0);
  target.setHours(0,0,0,0);
  
  const holidayTimestamps = new Set(
    holidays.map(h => {
        const d = parseDate(h);
        return d ? d.setHours(0,0,0,0) : null;
    }).filter(Boolean) as number[]
  );

  const start = new Date(today);
  const end = new Date(target);
  
  if (start.getTime() === end.getTime()) return 0;

  const isFuture = end.getTime() > start.getTime();
  let count = 0;
  
  const loopStart = new Date(isFuture ? start : end);
  const loopEnd = new Date(isFuture ? end : start);
  
  loopStart.setDate(loopStart.getDate() + 1);

  while (loopStart <= loopEnd) {
      const stamp = loopStart.getTime();
      if (!holidayTimestamps.has(stamp)) {
          count++;
      }
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

// Helper to add days skipping holidays
const addBusinessDays = (startDate: Date, daysToAdd: number, holidays: string[]): Date => {
    let currentDate = new Date(startDate);
    currentDate.setHours(0,0,0,0);
    let addedDays = 0;
    
    const holidayTimestamps = new Set(
        holidays.map(h => {
            const d = parseDate(h);
            return d ? d.setHours(0,0,0,0) : null;
        }).filter(Boolean) as number[]
    );

    if (daysToAdd === 0) return currentDate;

    while (addedDays < daysToAdd) {
        currentDate.setDate(currentDate.getDate() + 1);
        const stamp = currentDate.getTime();
        
        if (!holidayTimestamps.has(stamp)) {
            addedDays++;
        }
    }
    return currentDate;
};

export const calculateStatus = (cte: CTE, config: { today: Date, limitDays: number, holidays: string[] }): CTE['computedStatus'] => {
  const limitDate = parseDate(cte.dataLimite);
  if (!limitDate) return 'NO_PRAZO';

  const today = new Date(config.today);
  today.setHours(0,0,0,0);
  
  const limit = new Date(limitDate);
  limit.setHours(0,0,0,0);

  const criticalThresholdDate = addBusinessDays(limit, config.limitDays, config.holidays);
  criticalThresholdDate.setHours(0,0,0,0);

  const daysDiff = calculateBusinessDaysDiff(cte.dataLimite, config.holidays, config.today);

  if (today.getTime() > criticalThresholdDate.getTime()) return 'CRITICO';
  
  if (daysDiff === null) return 'NO_PRAZO';
  if (daysDiff < 0) return 'FORA_DO_PRAZO';
  if (daysDiff === 0) return 'PRIORIDADE';
  if (daysDiff === 1) return 'VENCE_AMANHA';

  return 'NO_PRAZO';
};

// Image Compression Utility
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
        if (!ctx) {
            reject('Canvas error');
            return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const data = elem.toDataURL('image/jpeg', quality);
        resolve(data);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};
