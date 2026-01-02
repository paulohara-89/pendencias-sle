
import Papa from 'papaparse';
import { CTE, Note, User, ConfigData, Profile } from '../types';
import { parseCurrency } from '../utils';

const SHEET_ID = '1hnZkQ2uWgKLu4gUmmfVaxfoHw8NKZmVOnv7lEJ8xWN0';
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzPWSLErtpiqSP7StNxeXZVyObA2uzryNVZiVMgYI884Sr7S5JH3tT16CeNNLjps4YI/exec';

const getSheetUrl = (sheetName: string) => 
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;

const generateId = (serie: any, cte: any) => {
    const s = serie ? String(serie).trim() : '';
    const c = cte ? String(cte).trim() : '';
    return `${s}-${c}`;
};

export const fetchAllData = async (): Promise<{ ctes: CTE[], users: User[], notes: Note[], profiles: Profile[], config: ConfigData }> => {
  try {
    const [baseData, usersData, profilesData, processControlData, notesTabData, configRaw] = await Promise.all([
      fetchCsv(getSheetUrl('BASE'), true),
      fetchCsv(getSheetUrl('USERS'), true),
      fetchCsv(getSheetUrl('PROFILES'), true),
      fetchCsv(getSheetUrl('PROCESS_CONTROL'), true), 
      fetchCsv(getSheetUrl('NOTES'), true),
      fetchCsv(getSheetUrl('DATA'), false) 
    ]);

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

    const users: User[] = usersData.map((row: any) => ({
      username: row['username'] || row['USERNAME'],
      password: row['password'] || row['PASSWORD'], 
      role: (row['role'] || row['ROLE'] || 'operador').toLowerCase(),
      linkedOriginUnit: row['linkedOriginUnit'] || row['LINKEDORIGINUNIT'] || '',
      linkedDestUnit: row['linkedDestUnit'] || row['LINKEDDESTUNIT'] || ''
    })).filter(u => u.username);

    const profiles: Profile[] = profilesData.map((row: any) => ({
      name: row['NAME'] || row['ProfileName'],
      description: row['DESCRIPTION'] || row['Description'],
      permissions: row['PERMISSIONS'] || row['Permissions'] || '[]'
    })).filter(p => p.name);

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

    const todayStr = (configRaw[0] && configRaw[0][1]) || new Date().toLocaleDateString('pt-BR');
    const tomorrowStr = (configRaw[1] && configRaw[1][1]) || '';
    const limitDays = (configRaw[2] && parseInt(configRaw[2][1])) || 10;

    const holidays: string[] = configRaw
        .map(row => row[3])
        .filter(val => val && String(val).match(/\d{2}\/\d{2}\/\d{4}/));

    const config: ConfigData = {
      dataHoje: todayStr,
      dataAmanha: tomorrowStr,
      prazoLimiteCritico: limitDays,
      holidays: holidays
    };

    return { ctes, users, notes, profiles, config };

  } catch (error) {
    console.error("Erro ao carregar dados:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido ao carregar planilha.";
    throw new Error(errorMessage);
  }
};

const fetchCsv = async (url: string, hasHeader: boolean = true): Promise<any[]> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
        if (response.status === 404) throw new Error("Aba da planilha não encontrada.");
        if (response.status === 403) throw new Error("Sem permissão para acessar a planilha. Certifique-se de que ela está 'disponível para qualquer pessoa com o link'.");
        throw new Error(`Erro HTTP: ${response.status}`);
    }
    const csvText = await response.text();
    return new Promise((resolve, reject) => {
        Papa.parse(csvText, {
            header: hasHeader,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data as any[]),
            error: (err: any) => reject(new Error("Falha ao processar o formato CSV da planilha."))
        });
    });
  } catch (e) {
      console.error(`Falha no fetchCsv para ${url}:`, e);
      throw e;
  }
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
     const response = await fetch(getSheetUrl('BASE'), { method: 'GET' });
     return response.ok;
  } catch (e) {
    return false;
  }
}
