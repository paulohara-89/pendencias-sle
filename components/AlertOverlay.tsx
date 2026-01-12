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
    // REGRA: Usuários sem unidade de destino vinculada NÃO recebem o alerta intrusivo
    if (!user || !user.linkedDestUnit) {
      setActive(false);
      setTargetCte(null);
      return;
    }

    // 1. Filtra itens que estão verdadeiramente "Em Busca"
    const emBuscaItems = processedData.filter(item => isCteEmBusca(item.CTE, item.SERIE, item.STATUS));
    
    // 2. Filtra apenas itens da unidade de destino do usuário e onde ele ainda não interagiu
    const pendingItem = emBuscaItems.find(item => {
        // Verifica se o item pertence à unidade do usuário
        const isFromMyUnit = item.ENTREGA === user.linkedDestUnit;
        if (!isFromMyUnit) return false;

        // Verifica se o usuário logado já adicionou alguma nota neste CTE
        const userHasNote = notes.some(n => 
          n.CTE === item.CTE && 
          n.USUARIO.toLowerCase() === user.username.toLowerCase()
        );
        
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
        playPromise.catch(() => {
          console.log("Auto-play de áudio bloqueado pelo navegador até interação do usuário.");
        });
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
      <div className="bg-white p-8 rounded-lg shadow-2xl max-w-md text-center border-4 border-red-500">
        <AlertCircle size={64} className="text-red-600 mx-auto mb-4" />
        <h2 className="text-3xl font-bold text-red-900 mb-2 uppercase tracking-tighter">Mercadoria em Busca</h2>
        <div className="bg-red-50 p-4 rounded-lg mb-6 border border-red-100">
          <p className="text-gray-700 font-medium">
              O CTE <span className="font-black text-red-600 text-xl">{targetCte.CTE}</span> da unidade <span className="font-bold">{user?.linkedDestUnit}</span> está marcado como extraviado/em busca.
          </p>
          <p className="text-xs text-red-500 mt-2 font-bold uppercase">Ação Obrigatória: Confirmar ciência ou adicionar nota.</p>
        </div>
        <button 
          onClick={() => { setActive(false); onOpenCte(targetCte); }}
          className="bg-red-600 text-white px-6 py-4 rounded-xl font-black text-lg hover:bg-red-700 transition-all shadow-xl shadow-red-500/40 active:scale-95 w-full uppercase"
        >
          Verificar Agora
        </button>
      </div>
    </div>
  );
};

export default AlertOverlay;