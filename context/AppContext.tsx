import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { CTE, User, Note, ConfigData, AppState, Profile } from '../types';
import { fetchAllData, postDataToScript } from '../services/api';
import { calculateStatus, parseDate, parseDateTime } from '../utils';

interface AppContextType extends AppState {
  login: (u: string, p: string) => Promise<boolean>; 
  logout: () => void;
  refreshData: () => Promise<void>;
  addNote: (cteId: string, text: string, images?: string[], isSearch?: boolean, customStatus?: string) => Promise<boolean>;
  
  // User CRUD
  createUser: (user: User) => Promise<boolean>;
  updateUser: (oldUsername: string, user: User) => Promise<boolean>;
  deleteUser: (username: string) => Promise<boolean>;

  // Profile CRUD
  createProfile: (profile: Profile) => Promise<boolean>;
  updateProfile: (oldName: string, profile: Profile) => Promise<boolean>;
  deleteProfile: (name: string) => Promise<boolean>;

  markAsInSearch: (cteId: string, images?: string[]) => Promise<boolean>;
  resolveSearch: (cteId: string, images?: string[]) => Promise<boolean>;
  dismissAlert: () => void;
  openAlertCTE: () => void;
  alertActive: boolean;
  alertCteId: string | null;
  
  selectedCteId: string | null;
  setSelectedCteId: (id: string | null) => void;

  // Derived Lists for Dropdowns
  origins: string[];
  destinations: string[];
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: React.PropsWithChildren) => {
  const [state, setState] = useState<AppState>({
    ctes: [],
    users: [],
    notes: [],
    profiles: [],
    config: { dataHoje: '', dataAmanha: '', prazoLimiteCritico: 3, holidays: [] },
    loading: true,
    error: null,
    currentUser: null,
  });

  const [alertActive, setAlertActive] = useState(false);
  const [alertCteId, setAlertCteId] = useState<string | null>(null);
  const [selectedCteId, setSelectedCteId] = useState<string | null>(null);
  
  // Initialize triggered alerts from LocalStorage to persist across refreshes
  const [sessionTriggeredAlerts, setSessionTriggeredAlerts] = useState<Set<string>>(() => {
    try {
        const saved = localStorage.getItem('triggeredAlerts');
        return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
        return new Set();
    }
  });

  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const origins = useMemo(() => {
    const list = new Set(state.ctes.map(c => c.coleta).filter(Boolean));
    return Array.from(list).sort();
  }, [state.ctes]);

  const destinations = useMemo(() => {
    const list = new Set(state.ctes.map(c => c.entrega).filter(Boolean));
    return Array.from(list).sort();
  }, [state.ctes]);

  useEffect(() => {
    const audio = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU"); 
    audio.loop = true;
    audioRef.current = audio;
  }, []);

  const triggerAlert = (cteId: string) => {
    setAlertCteId(cteId);
    setAlertActive(true);
    audioRef.current?.play().catch(e => console.log("Audio play blocked until interaction"));
    
    setSessionTriggeredAlerts(prev => {
        const newSet = new Set(prev).add(cteId);
        localStorage.setItem('triggeredAlerts', JSON.stringify(Array.from(newSet)));
        return newSet;
    });
  };

  const refreshData = async () => {
    setState(prev => ({ ...prev, loading: prev.ctes.length === 0 })); 
    try {
      const data = await fetchAllData();
      const today = parseDate(data.config.dataHoje) || new Date();
      
      const processedCTEs = data.ctes.map(c => {
        // Sort notes by DATE (Newest first)
        const cteNotes = data.notes.filter(n => n.cteId === c.id);
        cteNotes.sort((a,b) => parseDateTime(b.date) - parseDateTime(a.date));
        
        let finalStatus = c.status;

        // Logic to determine if "EM BUSCA" is active
        const lastDefiningNote = cteNotes.find(n => n.statusBusca === true || n.text.toLowerCase().includes('localizada') || n.text.toLowerCase().includes('resolvido'));

        if (lastDefiningNote) {
            if (lastDefiningNote.statusBusca) {
                 finalStatus = 'EM BUSCA';
            } else if (lastDefiningNote.text.toLowerCase().includes('localizada') || lastDefiningNote.text.toLowerCase().includes('resolvido')) {
                 finalStatus = 'MERCADORIA LOCALIZADA'; // Consider resolved
            }
        } else {
             // Fallback: If the base sheet (BASE tab) says it's active
             if (c.status === 'EM BUSCA') finalStatus = 'EM BUSCA';
        }
        
        // Hard override from sheet if present in BASE tab as LOCALIZADA
        if (c.status === 'MERCADORIA LOCALIZADA') {
            finalStatus = 'MERCADORIA LOCALIZADA';
        }

        return {
          ...c,
          status: finalStatus,
          computedStatus: calculateStatus({ ...c, status: finalStatus }, { 
            today, 
            limitDays: data.config.prazoLimiteCritico,
            holidays: data.config.holidays 
          })
        };
      });

      setState(prev => ({
        ...prev,
        ctes: processedCTEs,
        users: data.users,
        notes: data.notes,
        profiles: data.profiles,
        config: data.config,
        loading: false
      }));

      // Alert Logic
      if (state.currentUser) {
          const emBuscaItems = processedCTEs.filter(c => c.status === 'EM BUSCA');
          
          for (const item of emBuscaItems) {
              const userHasReplied = data.notes.some(n => n.cteId === item.id && n.user === state.currentUser?.username);
              
              if (!userHasReplied) {
                  // Alert only triggers if not currently active AND not previously triggered in history (localStorage)
                  if (!alertActive && !sessionTriggeredAlerts.has(item.id)) {
                      triggerAlert(item.id);
                      break; 
                  }
              }
          }
      }

    } catch (err) {
      console.error(err);
      setState(prev => ({ ...prev, loading: false, error: 'Falha ao carregar dados. Verifique a conexão.' }));
    }
  };

  const dismissAlert = () => {
    setAlertActive(false);
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
  };

  const openAlertCTE = () => {
    if (alertCteId) {
        setSelectedCteId(alertCteId);
        dismissAlert();
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 300000); 
    return () => clearInterval(interval);
  }, [state.currentUser]); 

  const login = async (u: string, p: string): Promise<boolean> => {
    // Return Promise to allow animation
    return new Promise((resolve) => {
        setTimeout(() => {
            if (u.toLowerCase() === 'admin' && p === '02965740155') {
                const adminUser: User = { username: 'admin', role: 'admin', linkedOriginUnit: 'ALL', linkedDestUnit: 'ALL' };
                setState(prev => ({ ...prev, currentUser: adminUser }));
                resolve(true);
                return;
            }
            const found = state.users.find(user => user.username.toLowerCase() === u.toLowerCase() && String(user.password) === p);
            if (found) {
                setState(prev => ({ ...prev, currentUser: found }));
                resolve(true);
                return;
            }
            resolve(false);
        }, 800); // 800ms delay for "Entrando" animation
    });
  };

  const logout = () => {
    setState(prev => ({ ...prev, currentUser: null }));
    // Do not clear sessionTriggeredAlerts on logout to prevent annoying next user on same device, 
    // or clear it if you want fresh alerts for new user. Let's clear for security/freshness.
    setSessionTriggeredAlerts(new Set());
    localStorage.removeItem('triggeredAlerts'); 
    dismissAlert();
  };

  const extractCteInfo = (cteId: string, cteObj?: CTE) => {
      if (cteObj) return { 
          cte: String(cteObj.cte).trim(), 
          serie: String(cteObj.serie).trim(),
          codigo: String(cteObj.codigo || '').trim()
      };
      
      const parts = cteId.split('-');
      if (parts.length >= 2) return { serie: parts[0].trim(), cte: parts[1].trim(), codigo: '' };
      return { cte: cteId, serie: '', codigo: '' };
  };

  const addNote = async (cteId: string, text: string, images: string[] = [], isSearch: boolean = false, customStatus?: string): Promise<boolean> => {
    if (!state.currentUser) return false;

    const targetCte = state.ctes.find(c => c.id === cteId);
    // CRITICAL: Extract CODIGO to ensure it is saved in the sheet (Column D usually)
    const { cte, serie, codigo } = extractCteInfo(cteId, targetCte);

    // Upload Images
    const uploadPromises = (images || []).map(async (imgBase64) => {
        if (imgBase64.startsWith('http')) return imgBase64;
        try {
            const cleanBase64 = imgBase64.includes(',') ? imgBase64.split(',')[1] : imgBase64;
            const mimeType = imgBase64.includes(';') ? imgBase64.split(';')[0].split(':')[1] : 'image/jpeg';
            const response = await postDataToScript('uploadImage', { data: cleanBase64, mimeType: mimeType });
            if (response && (response.success || response.url || (response.data && response.data.url))) {
                return response.url || response.viewUrl || (response.data && response.data.url);
            }
            return null;
        } catch (e) { return null; }
    });
    const uploadedResults = await Promise.all(uploadPromises);
    const validUrls = uploadedResults.filter(url => typeof url === 'string' && url.length > 0);
    let finalImageUrl = validUrls.join(',');

    if (!finalImageUrl && state.notes.length > 0) {
        const previousNoteWithImage = state.notes
            .filter(n => n.cteId === cteId && n.imageUrl && n.imageUrl.trim() !== '')
            .sort((a, b) => parseDateTime(b.date) - parseDateTime(a.date))[0]; // Use Date sort here too
        if (previousNoteWithImage) finalImageUrl = previousNoteWithImage.imageUrl || '';
    }

    const statusToSend = customStatus ? customStatus : (isSearch ? 'EM BUSCA' : '');
    const now = new Date();
    const dateStr = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}`;

    // DETERMINE IF WE SHOULD TARGET PROCESS_CONTROL
    // Rule: If explicitly marking as search, OR if the item is ALREADY in search mode, use PROCESS_CONTROL.
    const isCurrentlyEmBusca = targetCte?.status === 'EM BUSCA';
    const forceProcessControl = isSearch || isCurrentlyEmBusca || customStatus === 'MERCADORIA LOCALIZADA';

    // Optimistic Update
    const newNote: Note = {
      id: Date.now(), // Temporary ID for UI
      cteId,
      date: dateStr,
      user: state.currentUser.username,
      text,
      imageUrl: finalImageUrl,
      statusBusca: statusToSend === 'EM BUSCA' 
    };

    setState(prev => ({ 
        ...prev, 
        notes: [newNote, ...prev.notes], // Add to TOP
        // If status is "MERCADORIA LOCALIZADA", update CTE immediately locally
        ctes: prev.ctes.map(c => c.id === cteId ? { ...c, status: statusToSend || c.status } : c)
    }));

    const payload = {
        cte: cte, 
        serie: serie,
        codigo: codigo, // Include Codigo for Column Correctness
        CODIGO: codigo,
        cteNumber: cte,
        user: state.currentUser.username,
        text: text,
        image: finalImageUrl, 
        imageUrl: finalImageUrl,
        link: finalImageUrl,
        url: finalImageUrl,
        link_imagem: finalImageUrl, 
        LINK_IMAGEM: finalImageUrl, // Critical for PROCESS_CONTROL
        linkImagem: finalImageUrl,
        LinkImagem: finalImageUrl,
        markInSearch: forceProcessControl, // Force backend to write to PROCESS_CONTROL
        sheet: forceProcessControl ? 'PROCESS_CONTROL' : 'NOTES', // Explicit Hint
        status: statusToSend,
        STATUS: statusToSend // Uppercase just in case
    };
    
    const res = await postDataToScript('addNote', payload);
    return res && res.success;
  };
  
  const markAsInSearch = async (cteId: string, images: string[] = []) => {
     return await addNote(cteId, "Mercadoria marcada como: EM BUSCA", images, true, 'EM BUSCA');
  };

  const resolveSearch = async (cteId: string, images: string[] = []) => {
     const targetCte = state.ctes.find(c => c.id === cteId);
     const { cte } = extractCteInfo(cteId, targetCte);

     setState(prev => ({
         ...prev,
         ctes: prev.ctes.map(c => c.id === cteId ? { ...c, status: 'PENDENTE' } : c), 
         notes: prev.notes.map(n => n.cteId === cteId ? { ...n, statusBusca: false } : n) 
     }));

     // Also send the stopAlarm but rely on addNote(MERCADORIA LOCALIZADA) for the record
     const res = await postDataToScript('stopAlarm', { cte: cte });
     return res && res.success;
  };

  // CRUD...
  const createUser = async (user: User) => {
      setState(prev => ({ ...prev, users: [...prev.users, user] }));
      const payload = { ...user, username: user.username, password: user.password, role: user.role, linkedOriginUnit: user.linkedOriginUnit, linkedDestUnit: user.linkedDestUnit, USERNAME: user.username, PASSWORD: user.password, ROLE: user.role, LINKEDORIGINUNIT: user.linkedOriginUnit, LINKEDDESTUNIT: user.linkedDestUnit, sheet: 'USERS' };
      const res = await postDataToScript('createUser', payload);
      return res && res.success;
  };

  const updateUser = async (oldUsername: string, user: User) => {
      setState(prev => ({ ...prev, users: prev.users.map(u => u.username === oldUsername ? user : u) }));
      const payload = { oldUsername, ...user, username: user.username, password: user.password, role: user.role, linkedOriginUnit: user.linkedOriginUnit, linkedDestUnit: user.linkedDestUnit, sheet: 'USERS' };
      const res = await postDataToScript('updateUser', payload);
      return res && res.success;
  };

  const deleteUser = async (username: string) => {
      setState(prev => ({ ...prev, users: prev.users.filter(u => u.username !== username) }));
      const res = await postDataToScript('deleteUser', { username, sheet: 'USERS' });
      return res && res.success;
  };

  const createProfile = async (profile: Profile) => {
      setState(prev => ({ ...prev, profiles: [...prev.profiles, profile] }));
      const payload = { ...profile, NAME: profile.name, DESCRIPTION: profile.description, PERMISSIONS: profile.permissions, ProfileName: profile.name, Description: profile.description, Permissions: profile.permissions, sheet: 'PROFILES' };
      const res = await postDataToScript('createProfile', payload);
      return res && res.success;
  };

  const updateProfile = async (oldName: string, profile: Profile) => {
      setState(prev => ({ ...prev, profiles: prev.profiles.map(p => p.name === oldName ? profile : p) }));
      const payload = { oldName, ...profile, NAME: profile.name, DESCRIPTION: profile.description, PERMISSIONS: profile.permissions, ProfileName: profile.name, Description: profile.description, Permissions: profile.permissions, sheet: 'PROFILES' };
      const res = await postDataToScript('updateProfile', payload);
      return res && res.success;
  };

  const deleteProfile = async (name: string) => {
      setState(prev => ({ ...prev, profiles: prev.profiles.filter(p => p.name !== name) }));
      const res = await postDataToScript('deleteProfile', { name, NAME: name, sheet: 'PROFILES' });
      return res && res.success;
  };

  return (
    <AppContext.Provider value={{ 
        ...state, login, logout, refreshData, addNote, markAsInSearch, resolveSearch,
        createUser, updateUser, deleteUser,
        createProfile, updateProfile, deleteProfile,
        dismissAlert, openAlertCTE, alertActive, alertCteId,
        selectedCteId, setSelectedCteId,
        origins, destinations
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) throw new Error('useApp must be used within an AppProvider');
  return context;
};