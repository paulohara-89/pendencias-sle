import React, { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';

const AlertOverlay: React.FC = () => {
  const { processedData, notes, isCteEmBusca } = useData();
  const { user } = useAuth();
  const [active, setActive] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Filter items that are truly "Em Busca"
    const emBuscaItems = processedData.filter(item => isCteEmBusca(item.CTE, item.STATUS));
    
    // Check if there is any item where the current user hasn't made a note
    const pendingUserAttention = emBuscaItems.some(item => {
        // Find if user has a note on this CTE
        const userHasNote = notes.some(n => n.CTE === item.CTE && n.USUARIO === user.username);
        return !userHasNote;
    });
    
    if (pendingUserAttention && !dismissed) {
      setActive(true);
      // Play sound loop
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); // Sonar sound placeholder
      audio.loop = true;
      audio.volume = 0.5;
      const playPromise = audio.play();
      
      // Handle cleanup or browser block
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Auto-play was prevented
        });
      }

      return () => {
        audio.pause();
        audio.currentTime = 0;
      };
    }
  }, [processedData, dismissed, user, notes, isCteEmBusca]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-red-900/90 backdrop-blur-sm animate-pulse">
      <div className="bg-white p-8 rounded-lg shadow-2xl max-w-md text-center">
        <AlertCircle size={64} className="text-red-600 mx-auto mb-4" />
        <h2 className="text-3xl font-bold text-red-900 mb-2">MERCADORIA EM BUSCA</h2>
        <p className="text-gray-700 mb-6">Uma ou mais mercadorias estão marcadas como perdidas. Verifique e adicione uma nota para confirmar ciência.</p>
        <button 
          onClick={() => { setActive(false); setDismissed(true); }}
          className="bg-red-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-red-700 transition-colors"
        >
          CIENTE, VERIFICAR AGORA
        </button>
      </div>
    </div>
  );
};

export default AlertOverlay;