import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchSheetData, postToSheet } from '../services/api';
import { CteData, NoteData, UserData, GlobalData, ProfileData, ProcessData } from '../types';
import { useAuth } from './AuthContext';

interface KPICounts {
  pendencias: number;
  criticos: number;
  emBusca: number;
  tad: number;
}

interface Attachment {
  name: string;
  type: string;
  base64: string;
}

interface DataContextType {
  baseData: CteData[];
  processedData: CteData[];
  fullData: CteData[];
  notes: NoteData[];
  processControlData: ProcessData[];
  users: UserData[];
  profiles: ProfileData[];
  loading: boolean;
  refreshData: () => Promise<void>;
  filterStatus: string | null;
  setFilterStatus: (s: string | null) => void;
  filterDirection: 'all' | 'inbound' | 'outbound';
  setFilterDirection: (d: 'all' | 'inbound' | 'outbound') => void;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
  addNote: (note: Omit<NoteData, 'ID'> & { attachments?: Attachment[] }) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  resolveIssue: (cte: string, serie?: string, customText?: string) => Promise<void>;
  addUser: (user: UserData) => Promise<void>;
  deleteUser: (username: string) => Promise<void>;
  saveProfile: (profile: ProfileData) => Promise<void>;
  deleteProfile: (name: string) => Promise<void>;
  globalData: GlobalData;
  isCteEmBusca: (cte: string, serie: string, originalStatus: string) => boolean;
  isCteTad: (cte: string, serie: string) => boolean;
  counts: KPICounts;
  getLatestNote: (cte: string, serie?: string) => NoteData | null;
}

const isValid = (d: any): boolean => d instanceof Date && !isNaN(d.getTime());
const startOfDay = (d: Date): Date => {
  const newDate = new Date(d);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
};
const addDays = (d: Date, amount: number): Date => {
  const newDate = new Date(d);
  newDate.setDate(newDate.getDate() + amount);
  return newDate;
};
const isAfter = (d1: Date, d2: Date): boolean => d1.getTime() > d2.getTime();
const isEqual = (d1: Date, d2: Date): boolean => d1.getTime() === d2.getTime();

const parseCustom = (dateStr: string, formatStr: string): Date | null => {
  const parts = dateStr.split(/[\/\-]/);
  if (parts.length !== 3) return null;
  let day, month, year;
  if (formatStr.startsWith('d')) {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      let yStr = parts[2];
      if (yStr.length === 2) yStr = "20" + yStr;
      year = parseInt(yStr, 10);
  } else if (formatStr.startsWith('y')) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
  } else return null;
  const d = new Date(year, month, day);
  return (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) ? d : null;
};

const parseISOLocal = (s: string): Date => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, d] = s.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    return new Date(s);
};

const parseNoteDate = (dateStr: string) => {
    if(!dateStr) return 0;
    try {
        const [d, t] = dateStr.split(' ');
        if(!d) return 0;
        const [day, month, year] = d.split('/').map(Number);
        if (t) {
            const [hour, min, sec] = t.split(':').map(Number);
            return new Date(year, month-1, day, hour, min, sec || 0).getTime();
        }
        return new Date(year, month-1, day).getTime();
    } catch (e) { return 0; }
};

const DataContext = createContext<DataContextType | undefined>(undefined);

function extractAttachmentLinks(result: any) {
  const candidates: string[] = [];

  function addFrom(obj: any) {
    if (!obj || typeof obj !== "object") return;

    if (Array.isArray(obj.attachmentLinks)) candidates.push(...obj.attachmentLinks);
    if (Array.isArray(obj.urls)) candidates.push(...obj.urls);
    if (Array.isArray(obj.attachments)) {
      obj.attachments.forEach((item: any) => {
        if (typeof item === "string") candidates.push(item);
        else if (item && typeof item === "object") {
          candidates.push(item.url, item.viewUrl, item.openUrl, item.downloadUrl, item.imageUrl, item.link);
        }
      });
    }

    candidates.push(
      obj.imageUrl,
      obj.finalStringArgs,
      obj.url,
      obj.viewUrl,
      obj.openUrl,
      obj.downloadUrl,
      obj.link,
      obj.LINK_IMAGEM
    );
  }

  addFrom(result);
  addFrom(result?.data);
  addFrom(result?.data?.data);

  return [...new Set(
    candidates
      .filter(Boolean)
      .flatMap(v => String(v).split(/\s,\s|,\s|\s,|\|/))
      .map(v => v.trim())
      .filter(v => /^https?:\/\//i.test(v))
  )];
}

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [baseData, setBaseData] = useState<CteData[]>([]);
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [processControlData, setProcessControlData] = useState<ProcessData[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const [globalData, setGlobalData] = useState<GlobalData>({ today: '', tomorrow: '', deadlineDays: 0 });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterDirection, setFilterDirection] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [processedData, setProcessedData] = useState<CteData[]>([]);
  const [fullData, setFullData] = useState<CteData[]>([]);
  const [counts, setCounts] = useState<KPICounts>({ pendencias: 0, criticos: 0, emBusca: 0, tad: 0 });

  const refreshData = async (force = false) => {
    if (baseData.length === 0) setLoading(true);
    try {
      const result = await fetchSheetData(force);
      setBaseData(result.base);
      
      setNotes(prev => {
          const fetchedIds = new Set(result.notes.map((n: any) => String(n.ID)));
          const missingLocalNotes = prev.filter(n => !fetchedIds.has(String(n.ID)));
          return [...result.notes, ...missingLocalNotes];
      });

      setProcessControlData(prev => {
          const fetchedIds = new Set((result.process || []).map((p: any) => String(p.ID)));
          const missingLocalProcess = prev.filter(p => p.ID && !fetchedIds.has(String(p.ID)));
          return [...(result.process || []), ...missingLocalProcess];
      });

      setUsers(result.users);
      setProfiles(result.profiles || []);
      setGlobalData(result.data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { refreshData(); }, []);

  const getLatestNote = (cte: string, serie?: string) => {
      let cteNotes = notes.filter(n => n.CTE === cte);
      if (serie) {
          const cleanSerie = String(serie).replace(/^0+/, '');
          const withSerieMatch = cteNotes.filter(n => String(n.SERIE || '').replace(/^0+/, '') === cleanSerie);
          if (withSerieMatch.length > 0) cteNotes = withSerieMatch;
      }
      if (cteNotes.length === 0) return null;
      return cteNotes.sort((a, b) => {
          if (a.pending && !b.pending) return -1;
          if (!a.pending && b.pending) return 1;
          return parseNoteDate(b.DATA) - parseNoteDate(a.DATA);
      })[0];
  };

  const isCteTad = (cte: string, serie: string) => {
      const cleanSerie = String(serie || '').replace(/^0+/, '');
      
      const currentCte = baseData.find(c => c.CTE === cte && (!cleanSerie || String(c.SERIE).replace(/^0+/, '') === cleanSerie));
      if (currentCte && (currentCte.STATUS === 'RESOLVIDO' || currentCte.STATUS === 'LOCALIZADA')) return false;

      // 1. Verifica no histórico do PROCESS_CONTROL
      let history = processControlData.filter(p => p.CTE === cte);
      if (cleanSerie) {
          history = history.filter(p => String(p.SERIE || '').replace(/^0+/, '') === cleanSerie);
      }
      
      if (history.length > 0) {
          const latestProcess = history[history.length - 1]; 
          
          if (latestProcess.STATUS === 'RESOLVIDO' || latestProcess.STATUS === 'LOCALIZADA') return false;
          if (latestProcess.STATUS === 'TAD') return true;
          
          // Heurística: se o status for EM BUSCA mas a descrição mencionar TAD de forma clara
          const desc = (latestProcess.DESCRIPTION || '').toUpperCase();
          if (latestProcess.STATUS === 'EM BUSCA' && (desc.includes('TAD') || desc.includes('T.A.D'))) return true;
      }
      
      // 2. Verifica nas notas (procurando a última nota que tenha um status definido ou texto de TAD)
      const cteNotes = notes.filter(n => n.CTE === cte).sort((a, b) => {
          return parseNoteDate(b.DATA) - parseNoteDate(a.DATA);
      });

      // Procura a nota mais recente que tenha alterado o status
      const latestStatusNote = cteNotes.find(n => n.STATUS_BUSCA);
      if (latestStatusNote) {
          if (latestStatusNote.STATUS_BUSCA === 'RESOLVIDO' || latestStatusNote.STATUS_BUSCA === 'LOCALIZADA') return false;
          if (latestStatusNote.STATUS_BUSCA === 'TAD') return true;
      }

      // Heurística de texto na nota mais recente (independente de ter status_busca preenchido)
      const latestNote = cteNotes[0];
      if (latestNote) {
          const text = (latestNote.TEXTO || '').toUpperCase();
          if (text.includes('TAD INICIADO') || text.includes('MARCADO COMO TAD') || text.includes('PROCESSO DE TAD')) {
              return true;
          }
      }

      return false;
  };

  const isCteEmBusca = (cte: string, serie: string, originalStatus: string) => {
      if (originalStatus === 'RESOLVIDO' || originalStatus === 'LOCALIZADA') return false;
      if (isCteTad(cte, serie)) return false;

      const cleanSerie = String(serie || '').replace(/^0+/, '');
      let history = processControlData.filter(p => p.CTE === cte);
      if (cleanSerie) {
          history = history.filter(p => String(p.SERIE || '').replace(/^0+/, '') === cleanSerie);
      }
      
      if (history.length > 0) {
          const latestProcess = history[history.length - 1];
          if (latestProcess.STATUS === 'RESOLVIDO' || latestProcess.STATUS === 'LOCALIZADA') return false;
          
          if (latestProcess.STATUS === 'EM BUSCA') return true;
          if (latestProcess.STATUS === 'TAD') return false;
      }
      
      const latestNote = getLatestNote(cte);
      if (latestNote && (latestNote.STATUS_BUSCA === 'RESOLVIDO' || latestNote.STATUS_BUSCA === 'LOCALIZADA')) return false;

      if (history.length === 0 && originalStatus === 'EM BUSCA') {
          return true;
      }
      return false;
  };

  useEffect(() => {
    if (baseData.length === 0) {
      setProcessedData([]); setFullData([]); setCounts({ pendencias: 0, criticos: 0, emBusca: 0, tad: 0 });
      return;
    }

    const parseDate = (dateStr: string) => {
      if (!dateStr || typeof dateStr !== 'string') return null;
      const cleanDate = dateStr.trim();
      if (!cleanDate) return null;
      let d: Date | null = null;
      const formats = ['dd/MM/yyyy', 'd/M/yyyy', 'yyyy-MM-dd', 'dd-MM-yyyy', 'd/M/yy'];
      for (const fmt of formats) {
          const parsed = parseCustom(cleanDate, fmt);
          if (parsed && isValid(parsed)) { d = parsed; break; }
      }
      if (!d) {
          const iso = parseISOLocal(cleanDate);
          if (isValid(iso)) d = iso;
      }
      if (!d && !isNaN(Number(cleanDate)) && Number(cleanDate) > 30000) {
          d = new Date((Number(cleanDate) - 25569) * 86400 * 1000);
      }
      return (d && isValid(d)) ? startOfDay(d) : null;
    };

    let refToday = parseDate(globalData.today) || startOfDay(new Date());
    let refTomorrow = parseDate(globalData.tomorrow) || addDays(refToday, 1);
    const tolerance = globalData.deadlineDays || 0;

    const calculated = baseData.map(item => {
      let status: CteData['STATUS_CALCULADO'] = 'NO PRAZO';
      const limitDate = parseDate(item.DATA_LIMITE_BAIXA);
      if (limitDate) {
          const criticalThreshold = addDays(limitDate, tolerance);
          if (isAfter(refToday, criticalThreshold)) status = 'CRÍTICO';
          else if (isAfter(refToday, limitDate)) status = 'FORA DO PRAZO';
          else if (isEqual(refToday, limitDate)) status = 'PRIORIDADE';
          else if (isEqual(refTomorrow, limitDate)) status = 'VENCE AMANHÃ';
          else status = 'NO PRAZO';
      }
      
      let displayStatus = item.STATUS;
      if (isCteTad(item.CTE, item.SERIE)) {
          displayStatus = 'TAD';
      }

      return { ...item, STATUS: displayStatus, STATUS_CALCULADO: status };
    });

    setFullData(calculated);

    const filteredByUnit = calculated.filter(d => {
        if (isCteEmBusca(d.CTE, d.SERIE, d.STATUS)) return true;
        if (isCteTad(d.CTE, d.SERIE)) return true;
        if (!user || user.role.toLowerCase() === 'admin') return true;
        if (!user.linkedDestUnit) return true;
        return d.ENTREGA === user.linkedDestUnit;
    });

    const filtered = filteredByUnit.filter(item => {
      if (searchTerm && !item.CTE.includes(searchTerm) && !item.SERIE.includes(searchTerm)) return false;
      if (filterStatus && item.STATUS_CALCULADO !== filterStatus && item.STATUS !== filterStatus) return false;
      return true;
    });

    setProcessedData(filtered);

    let cPendencias = 0; let cCriticos = 0; let cEmBusca = 0; let cTad = 0;
    filteredByUnit.forEach(d => {
        const isCurrentlyEmBusca = isCteEmBusca(d.CTE, d.SERIE, d.STATUS);
        const isCurrentlyTad = isCteTad(d.CTE, d.SERIE);
        if (isCurrentlyEmBusca) cEmBusca++;
        if (isCurrentlyTad) cTad++;
        if (!isCurrentlyEmBusca && !isCurrentlyTad) {
            const matchesUnit = !user?.linkedDestUnit || d.ENTREGA === user.linkedDestUnit;
            if (matchesUnit) {
                if (d.STATUS_CALCULADO === 'CRÍTICO') cCriticos++;
                else cPendencias++;
            }
        }
    });
    setCounts({ pendencias: cPendencias, criticos: cCriticos, emBusca: cEmBusca, tad: cTad });
  }, [baseData, globalData, filterStatus, searchTerm, filterDirection, notes, user, processControlData]);

  const addNote = async (notePayload: Omit<NoteData, 'ID'> & { attachments?: Attachment[] }) => {
     const now = new Date();
     const formattedDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
     const tempID = "temp-" + Math.random().toString(36).substr(2, 9);
     
     // 1. Determina status efetivo (respeita payload ou estado atual)
     let effectiveStatus = notePayload.STATUS_BUSCA;
     let processStatus = "";
     let processDesc = "";
     
     // Configura descrição de processo se houver mudança ou início
     if (notePayload.STATUS_BUSCA === 'EM BUSCA') {
         // Verifica se JÁ está em busca para não registrar como INICIADO novamente
         const cleanSerie = String(notePayload.SERIE || '').replace(/^0+/, '');
         const item = baseData.find(c => c.CTE === notePayload.CTE && String(c.SERIE||'').replace(/^0+/,'') === cleanSerie);
         
         if (isCteEmBusca(notePayload.CTE, notePayload.SERIE || '', item?.STATUS || '')) {
             processStatus = "EM BUSCA";
             processDesc = notePayload.TEXTO || "Atualização";
         } else {
             processStatus = "EM BUSCA";
             processDesc = "INICIADO VIA OBS: " + (notePayload.TEXTO || "Sem descrição");
         }
     } else if (notePayload.STATUS_BUSCA === 'TAD') {
         // Verifica se JÁ está em TAD para não registrar como INICIADO novamente
         if (isCteTad(notePayload.CTE, notePayload.SERIE || '')) {
             processStatus = "TAD";
             processDesc = notePayload.TEXTO || "Atualização TAD";
         } else {
             processStatus = "TAD";
             processDesc = "TAD INICIADO: " + (notePayload.TEXTO || "Sem descrição");
         }
     } else if (effectiveStatus) {
         // Se estamos apenas preservando o status (ex: add foto em TAD existente)
         // processStatus = effectiveStatus;
         // processDesc = notePayload.TEXTO || "Atualização";
     }

     const finalNoteLocal: NoteData = { 
         ...notePayload, 
         ID: tempID, 
         DATA: formattedDate, 
         pending: true, 
         LINK_IMAGEM: "" // Initialized empty, filled via backend response or remains empty
     };
     
     if (processStatus) {
         // Se for novo TAD/EmBusca, usa descrição completa. Se for manutenção, usa texto do usuário.
         if (notePayload.STATUS_BUSCA) finalNoteLocal.TEXTO = processDesc;
     }

     setNotes(prev => [...prev, finalNoteLocal]);
     
     if (processStatus) {
         setProcessControlData(prev => [...prev, { 
             ID: tempID, CTE: notePayload.CTE, SERIE: notePayload.SERIE || "", DATA: formattedDate, USER: notePayload.USUARIO, DESCRIPTION: processDesc, LINK: "", STATUS: processStatus 
         }]);
         
         if (processStatus === 'TAD' || processStatus === 'EM BUSCA') {
             const cleanSerie = String(notePayload.SERIE || '').replace(/^0+/, '');
             setBaseData(prev => prev.map(item => 
                 (item.CTE === notePayload.CTE && String(item.SERIE).replace(/^0+/, '') === cleanSerie) 
                 ? { ...item, STATUS: processStatus } 
                 : item
             ));
         }
     }
     
     const cleanAttachments = (notePayload.attachments || []).map(att => {
        return {
            fileName: att.name,
            name: att.name,
            mimeType: att.type,
            type: att.type,
            data: att.base64,
            base64: att.base64
        };
     });

     try {
         // CRÍTICO: markInSearch aciona o alerta de EM BUSCA no backend.
         const shouldMarkInSearch = notePayload.STATUS_BUSCA === 'EM BUSCA';
         
         // Se for novo TAD, usa descrição especial. Senão, usa texto normal.
         const textToSend = (notePayload.STATUS_BUSCA === 'TAD' && !isCteTad(notePayload.CTE, notePayload.SERIE || '')) 
            ? processDesc 
            : (notePayload.TEXTO || "Sem descrição");

         const payloadToSend = { 
           cte: notePayload.CTE, 
           cteNumber: notePayload.CTE,
           serie: notePayload.SERIE || "", 
           username: notePayload.USUARIO, 
           user: notePayload.USUARIO, 
           text: textToSend,
           description: textToSend,
           image: "", // Sempre envia vazio para evitar que o backend force 'EM BUSCA'
           attachments: cleanAttachments,
           markInSearch: shouldMarkInSearch, 
           status_busca: notePayload.STATUS_BUSCA, // Apenas envia se foi explicitamente marcado
           isTad: notePayload.STATUS_BUSCA === 'TAD',
           status: notePayload.STATUS_BUSCA,
           currentStatus: notePayload.STATUS_BUSCA
         };

         // console.log("DEBUG selectedFiles length", notePayload.attachments?.length);
         // console.log("DEBUG attachmentsToSend", cleanAttachments);
         // console.log("DEBUG addNote payload", payloadToSend);

         if (notePayload.attachments && notePayload.attachments.length > 0 && cleanAttachments.length === 0) {
             throw new Error("Arquivo selecionado, mas nenhum anexo foi convertido para Base64.");
         }

         const backendResult = await postToSheet('addNote', payloadToSend);

         // console.log("DEBUG addNote result", backendResult);
         
         const attachmentLinks = extractAttachmentLinks(backendResult);
         // console.log("DEBUG extracted links", attachmentLinks);

         if (cleanAttachments.length > 0 && attachmentLinks.length === 0) {
            console.error("Resposta completa do backend sem link:", backendResult);
            throw new Error("O backend respondeu sucesso, mas não retornou link do anexo.");
         }
         
         const finalLinksString = attachmentLinks.join(" , ");

         setNotes(prev => prev.map(n => n.ID === tempID ? { ...n, pending: false, LINK_IMAGEM: finalLinksString } : n));
         
         // Trigger refresh to fetch actual server records cleanly - NO LONGER NEEDED, updated locally
     } catch (error) { 
         console.error("Add Note Failed", error); 
         setNotes(prev => prev.filter(n => n.ID !== tempID)); // Remove a nota pendente se falhar
         throw error; // Repassa o erro para o NoteModal
     }
  };

  const deleteNote = async (id: string) => {
      const noteToDelete = notes.find(n => String(n.ID) === String(id));
      setNotes(prev => prev.filter(n => String(n.ID) !== String(id)));
      try { await postToSheet('deleteNote', { id: id }); } catch (error) {
          if(noteToDelete) { setNotes(prev => [...prev, noteToDelete]); alert("Erro ao deletar nota."); }
      }
  };

  const resolveIssue = async (cte: string, serie?: string, customText?: string) => {
      let targetSerie = serie || baseData.find(c => c.CTE === cte)?.SERIE || "0";
      const now = new Date();
      const formattedDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const textMsg = customText || "RESOLVIDO: Mercadoria marcada como LOCALIZADA.";
      const username = user?.username || "Sistema";
      const cleanSerie = String(targetSerie).replace(/^0+/, '');
      
      setBaseData(prev => prev.map(item => 
          (item.CTE === cte && String(item.SERIE).replace(/^0+/, '') === cleanSerie) 
          ? { ...item, STATUS: 'RESOLVIDO' } 
          : item
      ));

      const resolveNote: NoteData = { ID: "temp-resolve-" + Math.random(), CTE: cte, SERIE: targetSerie!, CODIGO: "0", DATA: formattedDate, USUARIO: username, TEXTO: textMsg, LINK_IMAGEM: "", STATUS_BUSCA: "RESOLVIDO", pending: true };
      
      setNotes(prev => [...prev, resolveNote]);
      setProcessControlData(prev => [...prev, { ID: resolveNote.ID, CTE: cte, SERIE: targetSerie!, DATA: formattedDate, USER: username, DESCRIPTION: textMsg, LINK: "", STATUS: "RESOLVIDO" }]);
      
      try {
          // CRÍTICO: markInSearch = true para garantir que o backend crie uma nova linha em PROCESS_CONTROL com o status RESOLVIDO
          await postToSheet('addNote', { 
              cte: cte, 
              serie: targetSerie, 
              username: username, 
              user: username, 
              text: textMsg, 
              markInSearch: true, 
              isTad: false, 
              status: 'RESOLVIDO', 
              status_busca: 'RESOLVIDO' 
          });
          
          await postToSheet('stopAlarm', { cte: cte, serie: targetSerie });
          setNotes(prev => prev.map(n => n.ID === resolveNote.ID ? { ...n, pending: false } : n));
          alert("Situação resolvida!");
      } catch (error) { 
          alert("Erro ao resolver."); 
          setNotes(prev => prev.filter(n => n.ID !== resolveNote.ID));
      }
  };

  const addUser = async (u: UserData) => {
      setUsers(prev => [...prev, u]);
      try { await postToSheet('addUser', u); } catch(e) { setUsers(prev => prev.filter(usr => usr.username !== u.username)); }
  };
  const deleteUser = async (username: string) => {
      const old = [...users]; setUsers(prev => prev.filter(u => u.username !== username));
      try { await postToSheet('deleteUser', { username }); } catch(e) { setUsers(old); }
  };
  const saveProfile = async (p: ProfileData) => {
      const old = [...profiles]; const idx = profiles.findIndex(pr => pr.name === p.name);
      if (idx >= 0) { const upd = [...profiles]; upd[idx] = p; setProfiles(upd); } else setProfiles(prev => [...prev, p]);
      try { await postToSheet('saveProfile', { name: p.name, description: p.description, permissions: p.permissions.join(',') }); } catch(e) { setProfiles(old); }
  };
  const deleteProfile = async (name: string) => {
      const old = [...profiles]; setProfiles(prev => prev.filter(p => p.name !== name));
      try { await postToSheet('deleteProfile', { name }); } catch(e) { setProfiles(old); }
  };

  return (
    <DataContext.Provider value={{ baseData, processedData, fullData, notes, users, profiles, processControlData, loading, refreshData, filterStatus, setFilterStatus, filterDirection, setFilterDirection, searchTerm, setSearchTerm, addNote, deleteNote, resolveIssue, addUser, deleteUser, saveProfile, deleteProfile, globalData, isCteEmBusca, isCteTad, counts, getLatestNote }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error("useData must be used within DataProvider");
  return context;
};