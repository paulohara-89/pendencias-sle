import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchSheetData, postToSheet } from '../services/api';
import { CteData, NoteData, UserData, GlobalData, ProfileData } from '../types';
import { parse, addDays, isAfter, isBefore, isEqual, format } from 'date-fns';
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
  resolveIssue: (cte: string) => Promise<void>;
  addUser: (user: UserData) => Promise<void>;
  deleteUser: (username: string) => Promise<void>;
  saveProfile: (profile: ProfileData) => Promise<void>;
  deleteProfile: (name: string) => Promise<void>;
  globalData: GlobalData;
  isCteEmBusca: (cte: string, originalStatus: string) => boolean;
  counts: KPICounts;
  getLatestNote: (cte: string) => NoteData | null;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [baseData, setBaseData] = useState<CteData[]>([]);
  const [notes, setNotes] = useState<NoteData[]>([]);
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

  // Helper to check Status based on History (Last Note wins)
  const getLatestNote = (cte: string) => {
      const cteNotes = notes.filter(n => n.CTE === cte);
      if (cteNotes.length === 0) return null;
      return cteNotes.sort((a, b) => {
          const idA = parseInt(a.ID) || 0;
          const idB = parseInt(b.ID) || 0;
          return idB - idA;
      })[0];
  };

  const isCteEmBusca = (cte: string, originalStatus: string) => {
      const latest = getLatestNote(cte);
      if (latest) {
          if (latest.STATUS_BUSCA === 'EM BUSCA') return true;
          if (latest.STATUS_BUSCA === 'RESOLVIDO' || latest.STATUS_BUSCA === 'LOCALIZADA') return false;
      }
      return originalStatus === 'EM BUSCA';
  };

  // Calculation Logic
  useEffect(() => {
    if (baseData.length === 0) {
      setProcessedData([]);
      setCounts({ pendencias: 0, criticos: 0, emBusca: 0 });
      return;
    }

    const parseDate = (dateStr: string) => {
      try {
        return parse(dateStr, 'dd/MM/yyyy', new Date());
      } catch {
        return new Date();
      }
    };

    const today = new Date();
    today.setHours(0,0,0,0);

    const calculated = baseData.map(item => {
      const limitDate = parseDate(item.DATA_LIMITE_BAIXA);
      const criticalLimit = addDays(limitDate, globalData.deadlineDays || 2);
      
      let status: CteData['STATUS_CALCULADO'] = 'NO PRAZO';

      if (isAfter(today, limitDate)) status = 'FORA DO PRAZO';
      if (isAfter(today, criticalLimit)) status = 'CRÍTICO';
      if (isEqual(today, limitDate)) status = 'PRIORIDADE';
      const tomorrow = addDays(today, 1);
      if (isEqual(tomorrow, limitDate)) status = 'VENCE AMANHÃ';

      return { ...item, STATUS_CALCULADO: status };
    });

    // Apply Filters for Display
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
        // Em Busca - Global Count (Notification logic)
        if (isCteEmBusca(d.CTE, d.STATUS)) {
            cEmBusca++;
        }

        // Check if item belongs to user's unit (or if user is Admin/No Unit)
        const matchesUnit = !user?.linkedDestUnit || d.ENTREGA === user.linkedDestUnit;

        if (matchesUnit) {
            // Count Criticals: ONLY 'CRÍTICO'
            if (d.STATUS_CALCULADO === 'CRÍTICO') {
                cCriticos++;
            } else {
                // Count Pendencies (everything NOT critical, including FORA DO PRAZO)
                cPendencias++;
            }
        }
    });

    setCounts({
        pendencias: cPendencias,
        criticos: cCriticos,
        emBusca: cEmBusca
    });

  }, [baseData, globalData, filterStatus, searchTerm, filterDirection, notes, user]);

  const addNote = async (notePayload: Omit<NoteData, 'ID'> & { base64Image?: string }) => {
     const now = new Date();
     const formattedDate = now.toLocaleString('pt-BR', {
       day: '2-digit', month: '2-digit', year: 'numeric',
       hour: '2-digit', minute: '2-digit'
     });

     const tempID = "temp-" + Math.random().toString(36).substr(2, 9);

     const finalNoteLocal: NoteData = {
       ...notePayload,
       ID: tempID,
       DATA: formattedDate,
       pending: true, 
     };

     setNotes(prev => [...prev, finalNoteLocal]);

     const apiPayload = {
       cte: notePayload.CTE,
       serie: notePayload.SERIE,
       user: notePayload.USUARIO,
       text: notePayload.TEXTO,
       image: notePayload.base64Image || "", 
       markInSearch: notePayload.STATUS_BUSCA === 'EM BUSCA'
     };

     try {
         await postToSheet('addNote', apiPayload);
         setNotes(prev => prev.map(n => n.ID === tempID ? { ...n, pending: false } : n));
     } catch (error) {
         console.error("Failed to add note", error);
     }
  };

  const deleteNote = async (id: string) => {
      const noteToDelete = notes.find(n => n.ID === id);
      setNotes(prev => prev.filter(n => n.ID !== id));

      try {
          await postToSheet('deleteNote', { id: id });
      } catch (error) {
          console.error("Failed to delete note", error);
          if(noteToDelete) setNotes(prev => [...prev, noteToDelete]);
          alert("Não foi possível deletar a nota no servidor.");
      }
  };

  const resolveIssue = async (cte: string) => {
      const now = new Date();
      const formattedDate = now.toLocaleString('pt-BR');
      
      const resolveNote: NoteData = {
          ID: "temp-resolve-" + Math.random(),
          CTE: cte,
          SERIE: "0", 
          CODIGO: "0",
          DATA: formattedDate,
          USUARIO: "Sistema",
          TEXTO: "Mercadoria marcada como LOCALIZADA/RESOLVIDA.",
          LINK_IMAGEM: "",
          STATUS_BUSCA: "RESOLVIDO",
          pending: true
      };
      
      setNotes(prev => [...prev, resolveNote]);

      try {
          await postToSheet('stopAlarm', { cte: cte });
          alert("Mercadoria marcada como encontrada com sucesso!");
          refreshData();
      } catch (error) {
          alert("Erro ao resolver pendência.");
          setNotes(prev => prev.filter(n => n.ID !== resolveNote.ID));
      }
  };

  // --- Users Management ---
  const addUser = async (user: UserData) => {
      setUsers(prev => [...prev, user]);
      try {
          await postToSheet('addUser', user);
      } catch(e) {
          console.error(e);
          alert('Erro ao salvar usuário no servidor');
          setUsers(prev => prev.filter(u => u.username !== user.username));
      }
  };

  const deleteUser = async (username: string) => {
      const oldUsers = [...users];
      setUsers(prev => prev.filter(u => u.username !== username));
      try {
          await postToSheet('deleteUser', { username });
      } catch(e) {
          console.error(e);
          setUsers(oldUsers);
          alert('Erro ao remover usuário');
      }
  };

  // --- Profiles Management ---
  const saveProfile = async (profile: ProfileData) => {
      const existingIdx = profiles.findIndex(p => p.name === profile.name);
      let oldProfiles = [...profiles];
      
      if (existingIdx >= 0) {
          // Update
          const updated = [...profiles];
          updated[existingIdx] = profile;
          setProfiles(updated);
      } else {
          // Create
          setProfiles(prev => [...prev, profile]);
      }

      try {
          await postToSheet('saveProfile', {
              name: profile.name,
              description: profile.description,
              permissions: profile.permissions.join(',')
          });
      } catch(e) {
          console.error(e);
          setProfiles(oldProfiles);
          alert('Erro ao salvar perfil');
      }
  };

  const deleteProfile = async (name: string) => {
      const oldProfiles = [...profiles];
      setProfiles(prev => prev.filter(p => p.name !== name));
      try {
          await postToSheet('deleteProfile', { name });
      } catch(e) {
          console.error(e);
          setProfiles(oldProfiles);
          alert('Erro ao remover perfil');
      }
  };

  return (
    <DataContext.Provider value={{
      baseData,
      processedData,
      notes,
      users,
      profiles,
      loading,
      refreshData,
      filterStatus,
      setFilterStatus,
      filterDirection,
      setFilterDirection,
      searchTerm,
      setSearchTerm,
      addNote,
      deleteNote,
      resolveIssue,
      addUser,
      deleteUser,
      saveProfile,
      deleteProfile,
      globalData,
      isCteEmBusca,
      counts,
      getLatestNote
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error("useData must be used within DataProvider");
  return context;
};