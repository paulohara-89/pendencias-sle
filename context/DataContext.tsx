import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchSheetData, postToSheet } from '../services/api';
import { CteData, NoteData, UserData, GlobalData, ProfileData, ProcessData } from '../types';
import { useAuth } from './AuthContext';

interface KPICounts {
  pendencias: number;
  criticos: number;
  emBusca: number;
}

interface DataContextType {
  baseData: CteData[];
  processedData: CteData[];
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
  addNote: (note: Omit<NoteData, 'ID'> & { base64Image?: string }) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  resolveIssue: (cte: string, serie?: string) => Promise<void>;
  addUser: (user: UserData) => Promise<void>;
  deleteUser: (username: string) => Promise<void>;
  saveProfile: (profile: ProfileData) => Promise<void>;
  deleteProfile: (name: string) => Promise<void>;
  globalData: GlobalData;
  isCteEmBusca: (cte: string, serie: string, originalStatus: string) => boolean;
  counts: KPICounts;
  getLatestNote: (cte: string) => NoteData | null;
}

// Helper date functions (replacement for date-fns to avoid dependency issues)
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
  
  if (formatStr.startsWith('d')) { // dd/MM/yyyy, d/M/yyyy, dd-MM-yyyy, d/M/yy
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      let yStr = parts[2];
      if (yStr.length === 2) yStr = "20" + yStr;
      year = parseInt(yStr, 10);
  } else if (formatStr.startsWith('y')) { // yyyy-MM-dd
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
  } else {
      return null;
  }

  const d = new Date(year, month, day);
  if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
      return d;
  }
  return null;
};

const parseISOLocal = (s: string): Date => {
    // Attempt to handle YYYY-MM-DD as local
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, d] = s.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    return new Date(s);
};

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [baseData, setBaseData] = useState<CteData[]>([]);
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [processControlData, setProcessControlData] = useState<ProcessData[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const [globalData, setGlobalData] = useState<GlobalData>({ today: '', tomorrow: '', deadlineDays: 0 });
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterDirection, setFilterDirection] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Derived state
  const [processedData, setProcessedData] = useState<CteData[]>([]);
  const [counts, setCounts] = useState<KPICounts>({ pendencias: 0, criticos: 0, emBusca: 0 });

  const refreshData = async () => {
    setLoading(true);
    try {
      const result = await fetchSheetData();
      setBaseData(result.base);
      setNotes(result.notes);
      setProcessControlData(result.process || []);
      setUsers(result.users);
      setProfiles(result.profiles || []);
      setGlobalData(result.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const getLatestNote = (cte: string) => {
      const cteNotes = notes.filter(n => n.CTE === cte);
      if (cteNotes.length === 0) return null;
      
      const parseNoteDate = (dateStr: string) => {
          if(!dateStr) return 0;
          try {
              // Handle "dd/MM/yyyy HH:mm:ss" or "dd/MM/yyyy HH:mm"
              const [d, t] = dateStr.split(' ');
              if(!d) return 0;
              const [day, month, year] = d.split('/').map(Number);
              
              if (t) {
                  const [hour, min, sec] = t.split(':').map(Number);
                  return new Date(year, month-1, day, hour, min, sec || 0).getTime();
              }
              return new Date(year, month-1, day).getTime();
          } catch (e) {
              return 0;
          }
      };

      return cteNotes.sort((a, b) => {
          // Priority: Pending notes (optimistic UI) are always considered "newer" 
          // to ensure immediate UI feedback before server sync
          if (a.pending && !b.pending) return -1;
          if (!a.pending && b.pending) return 1;

          const dateA = parseNoteDate(a.DATA);
          const dateB = parseNoteDate(b.DATA);
          // Descending order (newest first)
          return dateB - dateA;
      })[0];
  };

  const isCteEmBusca = (cte: string, serie: string, originalStatus: string) => {
      // 1. Check Process Control Data (Source of Truth from Backend Script)
      // FIX: Filter by CTE AND SERIE to ensure uniqueness
      // Handle loose serie matching (e.g. "6" vs "06")
      let history = processControlData.filter(p => p.CTE === cte);
      
      if (serie) {
          const cleanSerie = String(serie).replace(/^0+/, '');
          history = history.filter(p => String(p.SERIE).replace(/^0+/, '') === cleanSerie);
      }
      
      if (history.length > 0) {
          // Assume the last item in the array is the most recent (Appended rows)
          const latestProcess = history[history.length - 1];
          // If latest status is RESOLVIDO, it is NOT em busca
          return latestProcess.STATUS === 'EM BUSCA';
      }

      // 2. Fallback to Latest Note logic (for legacy or manual note entries not in Process Sheet)
      const latest = getLatestNote(cte);
      if (latest) {
           if (latest.STATUS_BUSCA === 'RESOLVIDO' || latest.STATUS_BUSCA === 'LOCALIZADA') return false;
           // Only trust note search status if we have no process data
           if (latest.STATUS_BUSCA === 'EM BUSCA') return true;
      }
      
      return originalStatus === 'EM BUSCA';
  };

  useEffect(() => {
    if (baseData.length === 0) {
      setProcessedData([]);
      setCounts({ pendencias: 0, criticos: 0, emBusca: 0 });
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
          if (parsed && isValid(parsed)) {
              d = parsed;
              break;
          }
      }
      if (!d) {
          const iso = parseISOLocal(cleanDate);
          if (isValid(iso)) d = iso;
      }
      if (!d && !isNaN(Number(cleanDate)) && Number(cleanDate) > 30000) {
          d = new Date((Number(cleanDate) - 25569) * 86400 * 1000);
      }
      if (d && isValid(d)) {
          return startOfDay(d);
      }
      return null;
    };

    // 1. Establish Reference Dates from Global Data (Sheet DATAS)
    let refToday = parseDate(globalData.today);
    if (!refToday) refToday = startOfDay(new Date());

    let refTomorrow = parseDate(globalData.tomorrow);
    if (!refTomorrow) refTomorrow = addDays(refToday, 1);

    const tolerance = globalData.deadlineDays || 0;

    const calculated = baseData.map(item => {
      let status: CteData['STATUS_CALCULADO'] = 'NO PRAZO';
      const limitDate = parseDate(item.DATA_LIMITE_BAIXA);

      if (limitDate) {
          // Rule 2: CRÍTICO = Today > (Limit + Tolerance)
          const criticalThreshold = addDays(limitDate, tolerance);

          if (isAfter(refToday, criticalThreshold)) {
              status = 'CRÍTICO';
          }
          // Rule 1: FORA DO PRAZO = Today > Limit (and not Critical)
          else if (isAfter(refToday, limitDate)) {
              status = 'FORA DO PRAZO';
          }
          // Rule 3: PRIORIDADE = Limit == Today
          else if (isEqual(refToday, limitDate)) {
              status = 'PRIORIDADE';
          }
          // Rule 4: VENCE AMANHÃ = Limit == Tomorrow
          else if (isEqual(refTomorrow, limitDate)) {
              status = 'VENCE AMANHÃ';
          }
          // Rule 5: NO PRAZO = Limit > Today (Implied by being none of the above and limit existing)
          else {
              status = 'NO PRAZO';
          }
      } else {
          // If no date, assume No Prazo or handle error
          status = 'NO PRAZO';
      }

      return { ...item, STATUS_CALCULADO: status };
    });

    const filtered = calculated.filter(item => {
      if (searchTerm && !item.CTE.includes(searchTerm) && !item.SERIE.includes(searchTerm)) return false;
      if (filterStatus && item.STATUS_CALCULADO !== filterStatus && item.STATUS !== filterStatus) return false;
      return true;
    });

    setProcessedData(filtered);

    let cPendencias = 0;
    let cCriticos = 0;
    let cEmBusca = 0;

    calculated.forEach(d => {
        // Fix: Pass SERIE to isCteEmBusca
        if (isCteEmBusca(d.CTE, d.SERIE, d.STATUS)) {
            cEmBusca++;
        }
        const matchesUnit = !user?.linkedDestUnit || d.ENTREGA === user.linkedDestUnit;

        if (matchesUnit) {
            if (d.STATUS_CALCULADO === 'CRÍTICO') {
                cCriticos++;
            } else {
                cPendencias++;
            }
        }
    });

    setCounts({
        pendencias: cPendencias,
        criticos: cCriticos,
        emBusca: cEmBusca
    });

  }, [baseData, globalData, filterStatus, searchTerm, filterDirection, notes, user, processControlData]); 

  const addNote = async (notePayload: Omit<NoteData, 'ID'> & { base64Image?: string }) => {
     const now = new Date();
     // Ensure format matches backend expectation "dd/MM/yyyy HH:mm:ss" for accurate sorting
     const day = String(now.getDate()).padStart(2, '0');
     const month = String(now.getMonth() + 1).padStart(2, '0');
     const year = now.getFullYear();
     const hour = String(now.getHours()).padStart(2, '0');
     const min = String(now.getMinutes()).padStart(2, '0');
     const sec = String(now.getSeconds()).padStart(2, '0');
     
     const formattedDate = `${day}/${month}/${year} ${hour}:${min}:${sec}`;
     
     const tempID = "temp-" + Math.random().toString(36).substr(2, 9);
     const finalNoteLocal: NoteData = {
       ...notePayload,
       ID: tempID,
       DATA: formattedDate,
       pending: true, 
       // If image is present locally, display it immediately
       LINK_IMAGEM: notePayload.base64Image || "" 
     };
     
     setNotes(prev => [...prev, finalNoteLocal]);

     // Optimistic update for Process Control if marked as search
     if (notePayload.STATUS_BUSCA === 'EM BUSCA') {
         const newProcess: ProcessData = {
             ID: tempID,
             CTE: notePayload.CTE,
             SERIE: notePayload.SERIE || "",
             DATA: formattedDate,
             USER: notePayload.USUARIO,
             DESCRIPTION: "INICIADO VIA OBS: " + notePayload.TEXTO,
             LINK: notePayload.base64Image || "",
             STATUS: "EM BUSCA"
         };
         setProcessControlData(prev => [...prev, newProcess]);
     }
     
     // IMPORTANT: The backend expects keys 'cte', 'serie', 'text', 'user' (for process control)
     const apiPayload = {
       cte: notePayload.CTE,
       serie: notePayload.SERIE || "", 
       username: notePayload.USUARIO,  
       user: notePayload.USUARIO, // Backend uses 'user' key for Process Sheet
       text: notePayload.TEXTO,
       image: notePayload.base64Image || "",
       markInSearch: notePayload.STATUS_BUSCA === 'EM BUSCA'
     };
     
     try {
         await postToSheet('addNote', apiPayload);
         setNotes(prev => prev.map(n => n.ID === tempID ? { ...n, pending: false } : n));
         // Trigger refresh to get confirmed data
         setTimeout(() => { refreshData(); }, 1500);
     } catch (error) {
         console.error("Failed to add note", error);
     }
  };

  const deleteNote = async (id: string) => {
      const noteToDelete = notes.find(n => String(n.ID) === String(id));
      setNotes(prev => prev.filter(n => String(n.ID) !== String(id)));
      
      try {
          await postToSheet('deleteNote', { id: id });
      } catch (error) {
          console.error("Failed to delete note", error);
          if(noteToDelete) {
             setNotes(prev => [...prev, noteToDelete]);
             alert("Não foi possível deletar a nota no servidor.");
          }
      }
  };

  const resolveIssue = async (cte: string, serie?: string) => {
      // Logic to resolve: If SERIE not passed, try to find in base data, otherwise default to "0" (unsafe)
      // Best is to use the passed serie.
      let targetSerie = serie;
      if (!targetSerie) {
          const cteData = baseData.find(c => c.CTE === cte);
          targetSerie = cteData?.SERIE || "0";
      }

      // Prepare optimistic updates
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      const hour = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const sec = String(now.getSeconds()).padStart(2, '0');
      const formattedDate = `${day}/${month}/${year} ${hour}:${min}:${sec}`;

      const textMsg = "RESOLVIDO: Mercadoria marcada como LOCALIZADA.";
      const username = user?.username || "Sistema";

      // 1. Optimistically update Base Data (The main list)
      // This ensures that `liveCte.STATUS` in NoteModal becomes 'RESOLVIDO' instantly
      const cleanSerie = String(targetSerie).replace(/^0+/, '');
      
      setBaseData(prev => prev.map(item => {
          if (item.CTE === cte && String(item.SERIE).replace(/^0+/, '') === cleanSerie) {
              return { ...item, STATUS: 'RESOLVIDO' };
          }
          return item;
      }));

      // 2. Optimistically update Processed Data
      setProcessedData(prev => prev.map(item => {
          if (item.CTE === cte && String(item.SERIE).replace(/^0+/, '') === cleanSerie) {
              return { ...item, STATUS: 'RESOLVIDO' };
          }
          return item;
      }));

      // 3. Optimistically add Note
      const resolveNote: NoteData = {
          ID: "temp-resolve-" + Math.random(),
          CTE: cte,
          SERIE: targetSerie!, 
          CODIGO: "0",
          DATA: formattedDate,
          USUARIO: username,
          TEXTO: textMsg,
          LINK_IMAGEM: "",
          STATUS_BUSCA: "RESOLVIDO",
          pending: true
      };
      setNotes(prev => [...prev, resolveNote]);

      // 4. Optimistically update Process Control
      setProcessControlData(prev => {
          const newResolveRow: ProcessData = {
              ID: resolveNote.ID,
              CTE: cte,
              SERIE: targetSerie!,
              DATA: formattedDate,
              USER: username,
              DESCRIPTION: textMsg,
              LINK: "",
              STATUS: "RESOLVIDO"
          };
          return [...prev, newResolveRow];
      });

      try {
          // Send addNote to ensure the text and status are saved in NOTES sheet
          await postToSheet('addNote', {
             cte: cte,
             serie: targetSerie,
             username: username,
             user: username,
             text: textMsg,
             markInSearch: false,
             status: 'RESOLVIDO', 
             status_busca: 'RESOLVIDO' 
          });
          
          // Call stopAlarm to ensure PROCESS_CONTROL is updated/closed
          await postToSheet('stopAlarm', { 
              cte: cte,
              serie: targetSerie 
          });
          
          alert("Mercadoria marcada como encontrada com sucesso!");
          
          // Refresh after a delay
          setTimeout(() => { refreshData(); }, 3000);
      } catch (error) {
          console.error("Error resolving issue", error);
          alert("Erro ao resolver pendência.");
          setNotes(prev => prev.filter(n => n.ID !== resolveNote.ID));
          // Note: Reverting baseData is harder here without a refresh, so we rely on refreshData to eventually sync up if it failed.
      }
  };

  const addUser = async (user: UserData) => {
      setUsers(prev => [...prev, user]);
      try { await postToSheet('addUser', user); } catch(e) { console.error(e); alert('Erro ao salvar usuário no servidor'); setUsers(prev => prev.filter(u => u.username !== user.username)); }
  };
  const deleteUser = async (username: string) => {
      const oldUsers = [...users]; setUsers(prev => prev.filter(u => u.username !== username));
      try { await postToSheet('deleteUser', { username }); } catch(e) { console.error(e); setUsers(oldUsers); alert('Erro ao remover usuário'); }
  };
  const saveProfile = async (profile: ProfileData) => {
      const existingIdx = profiles.findIndex(p => p.name === profile.name);
      let oldProfiles = [...profiles];
      if (existingIdx >= 0) { const updated = [...profiles]; updated[existingIdx] = profile; setProfiles(updated); } else { setProfiles(prev => [...prev, profile]); }
      try { await postToSheet('saveProfile', { name: profile.name, description: profile.description, permissions: profile.permissions.join(',') }); } catch(e) { console.error(e); setProfiles(oldProfiles); alert('Erro ao salvar perfil'); }
  };
  const deleteProfile = async (name: string) => {
      const oldProfiles = [...profiles]; setProfiles(prev => prev.filter(p => p.name !== name));
      try { await postToSheet('deleteProfile', { name }); } catch(e) { console.error(e); setProfiles(oldProfiles); alert('Erro ao remover perfil'); }
  };

  return (
    <DataContext.Provider value={{ baseData, processedData, notes, users, profiles, processControlData, loading, refreshData, filterStatus, setFilterStatus, filterDirection, setFilterDirection, searchTerm, setSearchTerm, addNote, deleteNote, resolveIssue, addUser, deleteUser, saveProfile, deleteProfile, globalData, isCteEmBusca, counts, getLatestNote }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error("useData must be used within DataProvider");
  return context;
};