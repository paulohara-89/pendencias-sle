
import Papa from 'papaparse';
import { CTE, Note, User, ConfigData, Profile } from '../types';
import { parseCurrency } from '../utils';

// Using the Sheet ID from the "Edit" link provided to access via GVIZ API for specific tabs
const SHEET_ID = '1hnZkQ2uWgKLu4gUmmfVaxfoHw8NKZmVOnv7lEJ8xWN0';
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzPWSLErtpiqSP7StNxeXZVyObA2uzryNVZiVMgYI884Sr7S5JH3tT16CeNNLjps4YI/exec';

const getSheetUrl = (sheetName: string) => 
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${sheetName}`;

// Helper to ensure consistent ID generation (removes spaces, forces string)
const generateId = (serie: any, cte: any) => {
    const s = serie ? String(serie).trim() : '';
    const c = cte ? String(cte).trim() : '';
    return `${s}-${c}`;
};

export const fetchAllData = async (): Promise<{ ctes: CTE[], users: User[], notes: Note[], profiles: Profile[], config: ConfigData }> => {
  try {
    // Fetch all necessary tabs. 
    // DATA tab is fetched WITHOUT headers because Row 1 contains actual data (DATA HOJE)
    const [baseData, usersData, profilesData, processControlData, notesTabData, configRaw] = await Promise.all([
      fetchCsv(getSheetUrl('BASE'), true),
      fetchCsv(getSheetUrl('USERS'), true),
      fetchCsv(getSheetUrl('PROFILES'), true),
      fetchCsv(getSheetUrl('PROCESS_CONTROL'), true), 
      fetchCsv(getSheetUrl('NOTES'), true),
      fetchCsv(getSheetUrl('DATA'), false) // False here is key!
    ]);

    // --- Process BASE (CTEs) ---
    const ctes: CTE[] = baseData.map((row: any) => ({
      id: generateId(row['SERIE'], row['CTE']),
      cte: String(row['CTE']).trim(),
      serie: String(row['SERIE']).trim(),
      codigo: row['CODIGO'],
      dataEmissao: row['DATA EMISSAO'],
      prazoBaixa: parseInt(row['PRAZO PARA BAIXA (DIAS)']) || 0,
      dataLimite: row['DATA LIMITE DE BAIXA'],
      status: row['STATUS'],
      coleta: row['COLETA'],
      entrega: row['ENTREGA'],
      valor: parseCurrency(row['VALOR DO CTE']),
      txEntrega: parseCurrency(row['TX_ENTREGA']),
      volumes: parseInt(row['VOLUMES']) || 0,
      peso: parseFloat(row['PESO']?.replace(',', '.')) || 0,
      fretePago: row['FRETE_PAGO'],
      destinatario: row['DESTINATARIO'],
      justificativa: row['JUSTIFICATIVA']
    })).filter(c => c.cte && c.serie);

    // --- Process USERS ---
    const users: User[] = usersData.map((row: any) => ({
      username: row['username'] || row['USERNAME'],
      password: row['password'] || row['PASSWORD'], 
      role: (row['role'] || row['ROLE'] || 'operador').toLowerCase(),
      linkedOriginUnit: row['linkedOriginUnit'] || row['LINKEDORIGINUNIT'] || '',
      linkedDestUnit: row['linkedDestUnit'] || row['LINKEDDESTUNIT'] || ''
    })).filter(u => u.username);

    // --- Process PROFILES ---
    const profiles: Profile[] = profilesData.map((row: any) => ({
      name: row['NAME'] || row['ProfileName'],
      description: row['DESCRIPTION'] || row['Description'],
      permissions: row['PERMISSIONS'] || row['Permissions'] || '[]'
    })).filter(p => p.name);

    // --- Process NOTES ---
    const baseTimestamp = Date.now();
    const processNoteRow = (row: any, index: number, sourcePrefix: string): Note | null => {
      const serie = row['SERIE'] || row['serie'] || row['Serie'] || '';
      const cte = row['CTE'] || row['cte'] || row['Cte'] || '';
      const user = row['USER'] || row['USUARIO'] || row['user'] || row['usuario'] || 'Sistema';
      const text = row['DESCRIPTION'] || row['TEXTO'] || row['description'] || row['texto'] || '';
      const statusStr = row['STATUS'] || row['status'];
      const statusBuscaFlag = row['STATUS_BUSCA'] || row['status_busca'];
      
      if (!serie && !cte) return null;

      return {
        id: row['ID'] || `${sourcePrefix}-${baseTimestamp}-${index}`,
        cteId: generateId(serie, cte), 
        date: row['DATA'] || row['data'],
        user: user, 
        text: text, 
        imageUrl: row['LINK_IMAGEM'] || row['link_imagem'],
        statusBusca: (statusStr === 'EM BUSCA' || String(statusBuscaFlag).toLowerCase() === 'true')
      };
    };

    const notesFromProcess = processControlData.map((row, i) => processNoteRow(row, i, 'PC')).filter((n): n is Note => n !== null);
    const notesFromTab = notesTabData.map((row, i) => processNoteRow(row, i, 'NT')).filter((n): n is Note => n !== null);
    const allNotes = [...notesFromProcess, ...notesFromTab];
    
    const uniqueNotesMap = new Map();
    allNotes.forEach(note => {
        const contentHash = `${note.user}-${note.text}-${note.date}`;
        const key = (note.id && String(note.id).length > 5) ? `${note.id}-${contentHash}` : contentHash;
        if (!uniqueNotesMap.has(key)) uniqueNotesMap.set(key, note);
    });
    const notes = Array.from(uniqueNotesMap.values());

    // --- Process CONFIG (DATA Tab - Using index because header:false) ---
    // Row 0: ["DATA HOJE", "29/12/2025", "", "25/12/2025"]
    // Row 1: ["DATA AMANHÃ", "30/12/2025", "", "31/12/2025"]
    // Row 2: ["PRAZO LIMITE", "10", "", ""]
    
    const todayStr = (configRaw[0] && configRaw[0][1]) || new Date().toLocaleDateString('pt-BR');
    const tomorrowStr = (configRaw[1] && configRaw[1][1]) || '';
    const limitDays = (configRaw[2] && parseInt(configRaw[2][1])) || 3;

    // Holidays are in Column D (Index 3)
    const holidays: string[] = configRaw
        .map(row => row[3])
        .filter(val => typeof val === 'string' && val.match(/\d{2}\/\d{2}\/\d{4}/));

    const config: ConfigData = {
      dataHoje: todayStr,
      dataAmanha: tomorrowStr,
      prazoLimiteCritico: limitDays,
      holidays: holidays
    };

    return { ctes, users, notes, profiles, config };

  } catch (error) {
    console.error("Error fetching data:", error);
    throw error;
  }
};

const fetchCsv = (url: string, hasHeader: boolean = true): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: hasHeader,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data as any[]),
      error: (err) => reject(err)
    });
  });
};

export const postDataToScript = async (action: string, payload: any) => {
  const body = JSON.stringify({ action, payload });
  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body
    });
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    return await response.json();
  } catch (e) {
    console.error("Error sending data", e);
    return { success: false, error: String(e) };
  }
};

export const testConnection = async () => {
  try {
     const response = await fetch(getSheetUrl('BASE'), { method: 'HEAD' });
     return response.ok;
  } catch (e) {
    return false;
  }
}
