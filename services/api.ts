import Papa from 'papaparse';
import { URLS } from '../constants';
import { CteData, NoteData, UserData, ProfileData, GlobalData, ProcessData } from '../types';

// Helper to fetch and parse CSV
const fetchCsv = async <T>(url: string, config: { header: boolean } = { header: true }): Promise<T[]> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const csvText = await response.text();
    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: config.header,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data as T[]),
        error: (error: Error) => reject(error),
      });
    });
  } catch (error) {
    console.error(`Error fetching CSV from ${url}:`, error);
    return [];
  }
};

const normalizeCteData = (raw: any[]): CteData[] => {
  return raw.map(row => ({
    CTE: row.CTE || row.cte || row['NUMERO_CTE'] || '',
    SERIE: row.SERIE || row.serie || '',
    CODIGO: row.CODIGO || row.codigo || '',
    DATA_EMISSAO: row['DATA EMISSAO'] || row.DATA_EMISSAO || row.data_emissao || '',
    PRAZO_BAIXA_DIAS: row['PRAZO PARA BAIXA (DIAS)'] || row.PRAZO_BAIXA_DIAS || '',
    DATA_LIMITE_BAIXA: row['DATA LIMITE DE BAIXA'] || row.DATA_LIMITE_BAIXA || row.DATA_LIMITE || row.VENCIMENTO || '',
    STATUS: row.STATUS || '',
    COLETA: row.COLETA || row.ORIGEM || '',
    ENTREGA: row.ENTREGA || row.DESTINO || '',
    VALOR_CTE: row['VALOR DO CTE'] || row.VALOR_CTE || row.VALOR || row['VALOR (R$)'] || row.Valor || '0', 
    TX_ENTREGA: row.TX_ENTREGA || '',
    VOLUMES: row.VOLUMES || '',
    PESO: row.PESO || '',
    FRETE_PAGO: row.FRETE_PAGO || '',
    DESTINATARIO: row.DESTINATARIO || row.CLIENTE || '',
    JUSTIFICATIVA: row.JUSTIFICATIVA || ''
  }));
};

const normalizeNotes = (raw: any[]): NoteData[] => {
  return raw.map(row => {
    const rawId = row.ID || row.id || row.Id || '';
    return {
      ID: String(rawId), 
      CTE: row.CTE || row.cte || '',
      SERIE: row.SERIE || row.serie || '',
      CODIGO: row.CODIGO || row.codigo || '',
      DATA: row.DATA || row.data || '',
      USUARIO: row.USUARIO || row.usuario || 'Sistema',
      TEXTO: row.TEXTO || row.texto || '',
      LINK_IMAGEM: row.LINK_IMAGEM || row.link_imagem || '',
      // Correção: Adicionado row.STATUS e row.status para ler corretamente a coluna H da planilha
      STATUS_BUSCA: row.STATUS_BUSCA || row.status_busca || row.STATUS || row.status || '',
      pending: false
    };
  }).filter(n => n.ID !== '');
};

const normalizeUsers = (raw: any[]): UserData[] => {
  return raw.map(row => ({
    username: row.username || row.USERNAME || '',
    password: row.password || row.PASSWORD || '',
    role: row.role || row.ROLE || '',
    linkedOriginUnit: row.linkedOriginUnit || '',
    linkedDestUnit: row.linkedDestUnit || ''
  })).filter(u => u.username);
};

const normalizeProfiles = (raw: any[]): ProfileData[] => {
  return raw.map(row => {
    let perms: string[] = [];
    const rawPerms = row.permissions || row.PERMISSIONS;
    if (typeof rawPerms === 'string') {
      perms = rawPerms.split(',').map((p: string) => p.trim()).filter(Boolean);
    }

    return {
      name: row.name || row.NAME || '',
      description: row.description || row.DESCRIPTION || '',
      permissions: perms
    };
  }).filter(p => p.name);
};

const normalizeProcess = (raw: any[]): ProcessData[] => {
  return raw.map(row => ({
    ID: row.ID || row.id || '',
    CTE: row.CTE || row.cte || '',
    SERIE: row.SERIE || row.serie || '',
    DATA: row.DATA || row.data || '',
    USER: row.USER || row.user || row.USUARIO || '',
    DESCRIPTION: row.DESCRIPTION || row.description || '',
    LINK: row.LINK || row.link || row.LINK_IMAGEM || '',
    STATUS: row.STATUS || row.status || ''
  })).filter(p => p.ID);
};

export const fetchSheetData = async () => {
  const [baseRaw, notesRaw, usersRaw, profilesRaw, globalRaw, processRaw] = await Promise.all([
    fetchCsv<any>(URLS.BASE),
    fetchCsv<any>(URLS.NOTES),
    fetchCsv<any>(URLS.USERS),
    fetchCsv<any>(URLS.PROFILES),
    fetchCsv<any>(URLS.DATA, { header: false }),
    fetchCsv<any>(URLS.PROCESS_CONTROL),
  ]);

  const base = normalizeCteData(baseRaw);
  const notes = normalizeNotes(notesRaw);
  const users = normalizeUsers(usersRaw);
  const profiles = normalizeProfiles(profilesRaw);
  const process = normalizeProcess(processRaw);

  const data: GlobalData = { today: '', tomorrow: '', deadlineDays: 2 };
  
  if (globalRaw && globalRaw.length >= 3) {
      const rows = globalRaw as unknown as string[][];
      data.today = rows[0]?.[1] || '';
      data.tomorrow = rows[1]?.[1] || '';
      const days = parseInt(rows[2]?.[1]);
      data.deadlineDays = isNaN(days) ? 2 : days;
  }

  return { base, notes, users, profiles, data, process };
};

export const postToSheet = async (action: string, payload: any) => {
  // Envia como string JSON para corresponder ao e.postData.contents no Apps Script
  const body = JSON.stringify({
    action: action,
    payload: payload
  });

  try {
    const response = await fetch(URLS.APP_SCRIPT, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8', 
      },
      body: body,
      redirect: 'follow' // Importante para Apps Script
    });
    
    // Lê primeiro como texto para evitar crash em erros HTML
    const responseText = await response.text();
    
    try {
        const json = JSON.parse(responseText);
        // Retorna sucesso mesmo se json.success for undefined (alguns scripts retornam direto)
        return json.success !== false;
    } catch (parseError) {
        console.warn("Resposta não-JSON do servidor:", responseText);
        // Se a resposta contiver "Success" ou similar em texto, consideramos ok
        if (responseText.includes('Success') || responseText.includes('true')) {
            return true;
        }
        throw new Error("Formato de resposta inválido do servidor: " + responseText.substring(0, 100));
    }
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};
