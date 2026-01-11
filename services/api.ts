import Papa from 'papaparse';
import { URLS } from '../constants';
import { CteData, NoteData, UserData, GlobalData, ProfileData } from '../types';

const fetchCsv = async (url: string) => {
  const response = await fetch(url);
  const text = await response.text();
  return new Promise<any[]>((resolve, reject) => {
    Papa.parse(text, {
      header: false,
      complete: (results) => resolve(results.data as any[]),
      error: (err) => reject(err)
    });
  });
};

export const fetchSheetData = async () => {
  try {
    const [baseRows, notesRows, usersRows, dataRows, profilesRows] = await Promise.all([
      fetchCsv(URLS.BASE),
      fetchCsv(URLS.NOTES),
      fetchCsv(URLS.USERS),
      fetchCsv(URLS.DATA),
      fetchCsv(URLS.PROFILES)
    ]);

    // Parse BASE
    // Skip header row (index 0)
    const baseData: CteData[] = baseRows.slice(1).map(row => {
        if (!row[0]) return null;
        return {
          CTE: row[0],
          SERIE: row[1],
          CODIGO: row[2],
          DATA_EMISSAO: row[3],
          PRAZO_BAIXA_DIAS: row[4],
          DATA_LIMITE_BAIXA: row[5],
          STATUS: row[6],
          COLETA: row[7],
          ENTREGA: row[8],
          VALOR_CTE: row[9],
          TX_ENTREGA: row[10],
          VOLUMES: row[11],
          PESO: row[12],
          FRETE_PAGO: row[13],
          DESTINATARIO: row[14],
          JUSTIFICATIVA: row[15] || ''
        };
    }).filter(Boolean) as CteData[];

    // Parse NOTES
    // Skip header row
    const notesData: NoteData[] = notesRows.slice(1).map(row => {
        if (!row[0]) return null;
        return {
          ID: row[0],
          CTE: row[1],
          SERIE: row[2],
          CODIGO: row[3],
          DATA: row[4],
          USUARIO: row[5],
          TEXTO: row[6],
          LINK_IMAGEM: row[7]?.trim() || '', // Trim added to fix URL issues
          STATUS_BUSCA: row[8]
        };
    }).filter(Boolean) as NoteData[];

    // Parse USERS
    // Skip header row. Assuming columns: username, password, role, origin, dest
    const usersData: UserData[] = usersRows.slice(1).map(row => {
        if (!row[0]) return null;
        return {
            username: row[0]?.trim(),
            password: row[1]?.trim() || '', 
            role: row[2]?.trim(),
            linkedOriginUnit: row[3]?.trim(),
            linkedDestUnit: row[4]?.trim()
        };
    }).filter(Boolean) as UserData[];

    // Parse DATA (Global config)
    const globalData: GlobalData = {
        today: dataRows[0]?.[1] || new Date().toLocaleDateString('pt-BR'),
        tomorrow: dataRows[1]?.[1] || '',
        deadlineDays: parseInt(dataRows[2]?.[1]) || 2
    };

    // Parse PROFILES
    // Skip header. Columns: NAME, DESCRIPTION, PERMISSIONS
    const profilesData: ProfileData[] = profilesRows.slice(1).map(row => {
        if (!row[0]) return null;
        return {
            name: row[0]?.trim(),
            description: row[1]?.trim() || '',
            permissions: row[2] ? row[2].split(',').map((p: string) => p.trim()) : []
        };
    }).filter(Boolean) as ProfileData[];

    return {
      base: baseData,
      notes: notesData,
      users: usersData,
      data: globalData,
      profiles: profilesData,
      raw: { baseRows, notesRows, usersRows, dataRows, profilesRows }
    };

  } catch (error) {
    console.error("Error fetching sheet", error);
    throw error;
  }
};

export const postToSheet = async (action: string, payload: any) => {
  // Use pure JSON body. Apps Script `handleRequest` reads `e.postData.contents`
  const body = JSON.stringify({
    action: action,
    payload: payload
  });

  try {
    await fetch(URLS.APP_SCRIPT, {
      method: 'POST',
      body: body,
      mode: 'no-cors', // Important for Google Apps Script simple triggers/web apps without explicit CORS headers sometimes, though your script handles OPTIONS.
      headers: {
        'Content-Type': 'text/plain' // Avoids preflight OPTIONS request in some cases
      }
    });
    return true;
  } catch (error) {
    console.error("Error posting to sheet", error);
    return false;
  }
};