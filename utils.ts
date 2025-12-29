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

// New Helper: Parse DD/MM/YYYY HH:mm:ss for sorting
export const parseDateTime = (dateStr: string): number => {
    if (!dateStr || typeof dateStr !== 'string') return 0;
    try {
        const parts = dateStr.split(' '); // Split date and time
        const datePart = parts[0];
        const timePart = parts[1];

        const dateParts = datePart.split('/');
        if (dateParts.length < 3) return 0;
        
        // Setup Date
        const day = parseInt(dateParts[0]);
        const month = parseInt(dateParts[1]) - 1;
        const year = parseInt(dateParts[2]);

        // Setup Time (default to 00:00 if missing)
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

// Helper to calculate difference in BUSINESS days from Today (Skipping Holidays)
export const calculateBusinessDaysDiff = (dateStr: string, holidays: string[]): number | null => {
  const target = parseDate(dateStr);
  if (!target) return null;
  
  const today = new Date();
  today.setHours(0,0,0,0);
  target.setHours(0,0,0,0);
  
  // Parse holidays to timestamps
  const holidayTimestamps = new Set(
    holidays.map(h => {
        const d = parseDate(h);
        return d ? d.setHours(0,0,0,0) : null;
    }).filter(Boolean) as number[]
  );

  const start = new Date(today);
  const end = new Date(target);
  
  // Determine direction
  const isFuture = end.getTime() >= start.getTime();
  
  let count = 0;
  
  const loopStart = isFuture ? new Date(start) : new Date(end);
  const loopEnd = isFuture ? new Date(end) : new Date(start);
  
  // Move loopStart one day forward to start counting difference
  loopStart.setDate(loopStart.getDate() + 1);

  while (loopStart <= loopEnd) {
      const stamp = loopStart.getTime();
      // If it is NOT a holiday, we count it.
      if (!holidayTimestamps.has(stamp)) {
          count++;
      }
      loopStart.setDate(loopStart.getDate() + 1);
  }

  return isFuture ? count : -count;
};

// Legacy simple diff for compatibility if needed
export const getDaysDifference = (dateStr: string): number | null => {
  const target = parseDate(dateStr);
  if (!target) return null;
  const today = new Date();
  today.setHours(0,0,0,0);
  target.setHours(0,0,0,0);
  const diffTime = target.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('pt-BR').format(date);
};

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'CRITICO': return 'bg-red-700 text-white border border-red-900';
    case 'FORA_DO_PRAZO': return 'bg-red-500 text-white border border-red-600';
    case 'PRIORIDADE': return 'bg-orange-500 text-white border border-orange-600'; // Same day
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
    let addedDays = 0;
    
    // Parse holidays to timestamps for easy comparison
    const holidayTimestamps = new Set(
        holidays.map(h => {
            const d = parseDate(h);
            return d ? d.setHours(0,0,0,0) : null;
        }).filter(Boolean) as number[]
    );

    // If tolerance is 0, return immediately
    if (daysToAdd === 0) return currentDate;

    while (addedDays < daysToAdd) {
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
        const stamp = new Date(currentDate).setHours(0,0,0,0);
        
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

  // Critical Logic: Limit Date + Config Limit Days (skipping holidays) < Today
  const criticalThresholdDate = addBusinessDays(limit, config.limitDays, config.holidays);
  criticalThresholdDate.setHours(0,0,0,0);

  const diffTime = limit.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (today > criticalThresholdDate) return 'CRITICO';
  if (today > limit) return 'FORA_DO_PRAZO';
  if (diffDays === 0) return 'PRIORIDADE';
  if (diffDays === 1) return 'VENCE_AMANHA';

  return 'NO_PRAZO';
};

// Image Compression Utility
// OPTIMIZATION: 600px width and 0.4 quality balances speed and readability for documents
export const compressImage = (file: File, maxWidth = 600, quality = 0.4): Promise<string> => {
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
        
        // Output format as JPEG with quality reduction
        const data = elem.toDataURL('image/jpeg', quality);
        resolve(data);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};