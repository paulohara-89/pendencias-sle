import React, { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { CteData } from '../types';

interface Props {
    onOpenCte: (cte: CteData) => void;
}

const AlertOverlay: React.FC<Props> = ({ onOpenCte }) => {
  const { baseData, notes, isCteEmBusca } = useData();
  const { user } = useAuth();
  const [active, setActive] = useState(false);
  const [targetCte, setTargetCte] = useState<CteData | null>(null);

  useEffect(() => {
    // REGRA 1: Se o usuário NÃO possui unidade cadastrada (ou é admin global), não emite alerta intrusivo
    if (!user || !user.linkedDestUnit || user.role.toLowerCase() === 'admin') {
      setActive(false);
      setTargetCte(null);
      return;
    }

    // REGRA 2: Verificar se existe algum documento "EM BUSCA" na base
    // que este usuário (sua unidade) ainda NÃO tenha colocado anotação.
    // O alerta é GLOBAL para todas as unidades quando algo está em busca.
    const pendingItem = baseData.find(item => {
        // Verifica se o item está com status EM BUSCA
        const statusIsEmBusca = isCteEmBusca(item.CTE, item.SERIE, item.STATUS);
        if (!statusIsEmBusca) return false;

        // Verifica se ESTE usuário logado já adicionou alguma anotação
        // Se ele já comentou, significa que já deu o parecer da sua unidade.
        const userHasNote = notes.some(n => 
          n.CTE === item.CTE && 
          n.USUARIO.toLowerCase() === user.username.toLowerCase()
        );
        
        // Se está em busca e o usuário não tem nota, alerta nele.
        return !userHasNote;
    });
    
    if (pendingItem) {
      // Se já estivermos mostrando este exato CTE, não reinicia o áudio
      if (targetCte?.CTE === pendingItem.CTE && active) return;

      setTargetCte(pendingItem);
      setActive(true);
      
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); 
      audio.loop = true;
      audio.volume = 0.5;
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          console.log("Auto-play de áudio bloqueado até interação.");
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
  }, [baseData, user, notes, isCteEmBusca]);

  if (!active || !targetCte) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-red-900/90 backdrop-blur-sm animate-pulse">
      <div className="bg-white p-8 rounded-lg shadow-2xl max-w-md text-center border-4 border-red-500">
        <div className="relative">
             <AlertCircle size={64} className="text-red-600 mx-auto mb-4" />
        </div>
        <h2 className="text-3xl font-bold text-red-900 mb-2 uppercase tracking-tighter italic">Mercadoria em Busca</h2>
        <div className="bg-red-50 p-4 rounded-lg mb-6 border border-red-100">
          <p className="text-gray-700 font-medium">
              Atenção! O documento <span className="font-black text-red-600 text-xl">{targetCte.CTE}</span> está marcado como <span className="font-bold">EM BUSCA</span>.
          </p>
          <p className="text-sm text-red-800 mt-2 font-bold uppercase underline">
              Sua unidade ({user?.linkedDestUnit}) deve verificar este item. Por favor, adicione uma anotação confirmando se a mercadoria se encontra na sua base.
          </p>
        </div>
        <button 
          onClick={() => { setActive(false); onOpenCte(targetCte); }}
          className="bg-red-600 text-white px-6 py-4 rounded-xl font-black text-lg hover:bg-red-700 transition-all shadow-xl shadow-red-500/40 active:scale-95 w-full uppercase"
        >
          Verificar e Anotar
        </button>
      </div>
    </div>
  );
};

export default AlertOverlay;