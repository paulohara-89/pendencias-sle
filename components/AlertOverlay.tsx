import React, { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { CteData } from '../types';

interface Props {
    onOpenCte: (cte: CteData) => void;
}

const AlertOverlay: React.FC<Props> = ({ onOpenCte }) => {
  const { processedData, notes, isCteEmBusca } = useData();
  const { user } = useAuth();
  const [active, setActive] = useState(false);
  const [targetCte, setTargetCte] = useState<CteData | null>(null);

  useEffect(() => {
    if (!user) return;

    // Filter items that are truly "Em Busca", passing SERIE
    const emBuscaItems = processedData.filter(item => isCteEmBusca(item.CTE, item.SERIE, item.STATUS));
    
    // Find the first item where the CURRENT user hasn't made a note
    const pendingItem = emBuscaItems.find(item => {
        // Find if user has a note on this CTE
        const userHasNote = notes.some(n => n.CTE === item.CTE && n.USUARIO.toLowerCase() === user.username.toLowerCase());
        return !userHasNote;
    });
    
    if (pendingItem) {
      setTargetCte(pendingItem);
      setActive(true);
      
      // Play sound loop
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); 
      audio.loop = true;
      audio.volume = 0.5;
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }

      return () => {
        audio.pause();
        audio.currentTime = 0;
      };
    } else {
        setActive(false);
        setTargetCte(null);
    }
  }, [processedData, user, notes, isCteEmBusca]);

  if (!active || !targetCte) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-red-900/90 backdrop-blur-sm animate-pulse">
      <div className="bg-white p-8 rounded-lg shadow-2xl max-w-md text-center">
        <AlertCircle size={64} className="text-red-600 mx-auto mb-4" />
        <h2 className="text-3xl font-bold text-red-900 mb-2">MERCADORIA EM BUSCA</h2>
        <p className="text-gray-700 mb-6 font-medium">
            CTE <span className="font-bold">{targetCte.CTE}</span> está marcado como perdido.<br/>
            Você precisa confirmar ciência ou adicionar uma nota.
        </p>
        <button 
          onClick={() => { setActive(false); onOpenCte(targetCte); }}
          className="bg-red-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-red-700 transition-colors w-full"
        >
          CIENTE, VERIFICAR AGORA
        </button>
      </div>
    </div>
  );
};

export default AlertOverlay;