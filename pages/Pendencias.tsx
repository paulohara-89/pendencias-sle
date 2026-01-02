
import React, { useState, useMemo, useRef, useEffect, memo, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { getStatusColor, getPaymentColor, parseDate, calculateBusinessDaysDiff, compressImage, parseDateTime, formatImageUrl } from '../utils';
import { CTE, Note } from '../types';
import * as XLSX from 'xlsx';

// Sorting Types
type SortKey = 'cte' | 'dataEmissao' | 'dataLimite' | 'status' | 'origem' | 'destino' | 'pagamento' | 'destinatario';
type SortDirection = 'asc' | 'desc';

export const DetailModal = ({ cte, onClose }: { cte: CTE; onClose: () => void }) => {
  const { notes, addNote, currentUser, markAsInSearch, resolveSearch } = useApp();
  const { addToast } = useToast();
  const [newNote, setNewNote] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter notes for this CTE
  const cteNotes = notes
    .filter(n => n.cteId === cte.id)
    .sort((a, b) => parseDateTime(a.date) - parseDateTime(b.date));

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [cteNotes]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleSendNote = async () => {
    if (!newNote.trim() && selectedFiles.length === 0) return;
    setIsSubmitting(true);

    const imagesBase64: string[] = [];
    for (const file of selectedFiles) {
        try {
            const base64 = await compressImage(file);
            imagesBase64.push(base64);
        } catch (e) {
            console.error("Compression failed", e);
        }
    }

    const success = await addNote(cte.id, newNote, imagesBase64);
    if (success) {
        setNewNote('');
        setSelectedFiles([]);
        // Force scroll after adding
        setTimeout(() => {
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }, 100);
        addToast('Nota adicionada com sucesso', 'success');
    } else {
        addToast('Erro ao adicionar nota', 'error');
    }
    setIsSubmitting(false);
  };

  const handleMarkSearch = async () => {
      if(!confirm('Deseja marcar esta mercadoria como EM BUSCA? Isso gerará um alerta para todos.')) return;
      setIsSubmitting(true);
      const success = await markAsInSearch(cte.id);
      if(success) addToast('Marcado como EM BUSCA', 'success');
      setIsSubmitting(false);
  };

  const handleResolve = async () => {
      if(!confirm('Confirmar que a mercadoria foi LOCALIZADA?')) return;
      setIsSubmitting(true);
      const success = await resolveSearch(cte.id);
      if(success) addToast('Mercadoria localizada e resolvida!', 'success');
      setIsSubmitting(false);
  };

  return (
    <div 
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in cursor-pointer"
        onClick={onClose}
    >
        <div 
            className="bg-white w-full max-w-4xl h-[90vh] rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-hidden relative animate-scale-in cursor-auto"
            onClick={(e) => e.stopPropagation()}
        >
            <button 
                onClick={onClose}
                className="absolute top-4 right-4 z-50 bg-gray-100 p-2 rounded-full hover:bg-red-100 hover:text-red-500 transition shadow-sm text-gray-500 flex items-center justify-center border border-gray-200"
                title="Fechar"
            >
                <i className="ph-bold ph-x text-xl"></i>
            </button>

            <div className="w-full md:w-1/3 bg-gray-50 p-6 overflow-y-auto border-r border-gray-100 hidden md:block pt-12 md:pt-6">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">{cte.cte}</h2>
                    <p className="text-sm text-gray-500 font-medium">Série {cte.serie}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                         <span className={`px-2 py-1 rounded-md text-xs font-bold ${getStatusColor(cte.computedStatus || 'NO_PRAZO')}`}>
                            {cte.computedStatus?.replace(/_/g, ' ')}
                         </span>
                         <span className={`px-2 py-1 rounded-md text-xs font-bold ${getPaymentColor(cte.fretePago)}`}>
                            {cte.fretePago}
                         </span>
                    </div>
                </div>

                <div className="space-y-4 text-sm text-gray-600">
                    <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">Rota</p>
                        <div className="flex flex-col gap-2">
                             <div>
                                 <p className="font-bold text-gray-800">{cte.coleta}</p>
                                 <p className="text-xs text-gray-400">Origem</p>
                             </div>
                             <div className="w-px h-4 bg-gray-300 ml-1"></div>
                             <div>
                                 <p className="font-bold text-gray-800">{cte.entrega}</p>
                                 <p className="text-xs text-gray-400">Destino</p>
                             </div>
                        </div>
                    </div>

                    <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                         <p className="text-xs font-bold text-gray-400 uppercase mb-1">Prazos</p>
                         <div className="flex justify-between">
                             <span>Emissão:</span>
                             <span className="font-medium">{cte.dataEmissao}</span>
                         </div>
                         <div className="flex justify-between mt-1">
                             <span>Limite:</span>
                             <span className="font-bold text-red-600">{cte.dataLimite}</span>
                         </div>
                    </div>

                    <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                         <p className="text-xs font-bold text-gray-400 uppercase mb-1">Financeiro</p>
                         <div className="flex justify-between">
                             <span>Valor CTE:</span>
                             <span className="font-medium text-green-600">R$ {cte.valor.toFixed(2)}</span>
                         </div>
                    </div>

                     <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                         <p className="text-xs font-bold text-gray-400 uppercase mb-1">Cliente</p>
                         <p className="font-medium text-gray-800 break-words">{cte.destinatario}</p>
                    </div>
                </div>

                <div className="mt-8 space-y-3">
                    {cte.status === 'EM BUSCA' ? (
                        <button 
                            onClick={handleResolve}
                            disabled={isSubmitting}
                            className="w-full py-3 bg-green-600 text-white rounded-xl font-bold shadow-lg hover:bg-green-700 transition flex items-center justify-center gap-2"
                        >
                           <i className="ph-bold ph-check-circle"></i> Mercadoria Localizada
                        </button>
                    ) : (
                        <button 
                            onClick={handleMarkSearch}
                            disabled={isSubmitting}
                            className="w-full py-3 bg-purple-100 text-purple-700 border border-purple-200 rounded-xl font-bold hover:bg-purple-200 transition flex items-center justify-center gap-2"
                        >
                           <i className="ph-bold ph-binoculars"></i> MARCAR EM BUSCA
                        </button>
                    )}
                </div>
            </div>

            <div className="md:hidden p-4 border-b border-gray-100 bg-gray-50 pt-12">
                 <h2 className="text-xl font-bold text-gray-800">{cte.cte}</h2>
                 <p className="text-sm text-gray-500">Série {cte.serie} - {cte.destinatario}</p>
                 <div className="mt-3 flex gap-2">
                    {cte.status === 'EM BUSCA' ? (
                         <button onClick={handleResolve} className="flex-1 text-xs bg-green-600 text-white px-3 py-2 rounded-lg font-bold flex items-center justify-center gap-1">
                            <i className="ph-bold ph-check"></i> Resolver
                         </button>
                    ) : (
                         <button onClick={handleMarkSearch} className="flex-1 text-xs bg-purple-100 text-purple-700 px-3 py-2 rounded-lg font-bold flex items-center justify-center gap-1">
                            <i className="ph-bold ph-binoculars"></i> Marcar em Busca
                         </button>
                    )}
                 </div>
            </div>

            <div className="flex-1 flex flex-col bg-white">
                <div className="p-4 border-b border-gray-100 bg-white z-10 hidden md:block pt-6">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <i className="ph-fill ph-chat-circle-text text-primary"></i> Histórico de Tratativas
                    </h3>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F8F9FC]" ref={scrollRef}>
                    {cteNotes.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
                            <i className="ph-duotone ph-chats text-4xl mb-2"></i>
                            <p>Nenhuma nota registrada ainda.</p>
                        </div>
                    ) : (
                        cteNotes.map(note => {
                            const isMe = currentUser?.username === note.user;
                            return (
                                <div key={note.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-4 shadow-sm ${
                                        isMe ? 'bg-indigo-50 text-gray-800 rounded-tr-none' : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                                    }`}>
                                        <div className="flex justify-between items-center gap-4 mb-1">
                                            <span className={`text-xs font-bold ${isMe ? 'text-indigo-600' : 'text-primary'}`}>{note.user}</span>
                                            <span className="text-[10px] text-gray-400">{note.date}</span>
                                        </div>
                                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{note.text}</p>
                                        
                                        {note.imageUrl && (
                                            <div className="mt-3 flex gap-2 flex-wrap">
                                               {note.imageUrl.split(',')
                                                .map(url => url.trim())
                                                .filter(url => url.length > 0)
                                                .map((url, i) => {
                                                   const formattedUrl = formatImageUrl(url);
                                                   return (
                                                   <a key={i} href={formattedUrl} target="_blank" rel="noopener noreferrer">
                                                       <img 
                                                         src={formattedUrl} 
                                                         alt="anexo" 
                                                         className="w-24 h-24 rounded-lg border border-gray-200 object-cover hover:opacity-90 transition bg-white" 
                                                         onError={(e) => {
                                                            (e.target as HTMLImageElement).src = "https://placehold.co/100x100?text=Erro+Imagem";
                                                         }}
                                                       />
                                                   </a>
                                               )})}
                                            </div>
                                        )}
                                        {note.statusBusca && (
                                            <div className="mt-2 text-[10px] font-bold text-purple-500 flex items-center gap-1 uppercase bg-purple-50 px-2 py-1 rounded inline-flex">
                                                <i className="ph-fill ph-binoculars"></i> Marcado Em Busca
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="p-4 bg-white border-t border-gray-100">
                    {selectedFiles.length > 0 && (
                        <div className="flex gap-2 mb-2 overflow-x-auto pb-2">
                            {selectedFiles.map((f, i) => (
                                <div key={i} className="bg-gray-100 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 text-gray-600">
                                    <i className="ph-bold ph-image"></i> {f.name.substring(0, 15)}...
                                    <button onClick={() => setSelectedFiles(selectedFiles.filter((_, idx) => idx !== i))} className="hover:text-red-500"><i className="ph-bold ph-x"></i></button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex gap-2 items-center">
                        <label className="flex items-center gap-2 px-3 py-3 rounded-xl bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-primary cursor-pointer transition border border-gray-200" title="Tirar Foto ou Escolher da Galeria">
                            <input type="file" multiple accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />
                            <i className="ph-bold ph-camera text-xl"></i>
                            <span className="text-xs font-bold hidden sm:inline">Foto/Galeria</span>
                        </label>
                        <div className="flex-1 relative">
                            <input 
                                type="text" 
                                value={newNote}
                                onChange={e => setNewNote(e.target.value)}
                                placeholder="Digite uma nota..."
                                className="w-full pl-4 pr-12 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/20 transition bg-gray-50 focus:bg-white"
                                onKeyDown={e => e.key === 'Enter' && !isSubmitting && handleSendNote()}
                            />
                            <button 
                                onClick={handleSendNote} 
                                disabled={isSubmitting || (!newNote.trim() && selectedFiles.length === 0)}
                                className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 bg-primary text-white rounded-lg hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md"
                            >
                                {isSubmitting ? <i className="ph ph-spinner ph-spin"></i> : <i className="ph-bold ph-paper-plane-right"></i>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export const PendenciasList = ({ mode }: { mode: 'all' | 'critical' | 'search' }) => {
  const { ctes, notes, currentUser, config, setSelectedCteId } = useApp();
  const [filterText, setFilterText] = useState('');
  const [selectedDestUnit, setSelectedDestUnit] = useState<string>('all');
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [paymentFilters, setPaymentFilters] = useState<string[]>([]);
  const [noteFilter, setNoteFilter] = useState<'all' | 'com_nota' | 'sem_nota'>('all');

  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'dataLimite',
    direction: 'asc'
  });

  const isAdmin = currentUser?.role.toLowerCase() === 'admin';

  const destinationUnits = useMemo(() => {
    const units = new Set(ctes.map(c => c.entrega).filter(Boolean));
    return Array.from(units).sort();
  }, [ctes]);

  useEffect(() => {
    if (!isAdmin && currentUser?.linkedDestUnit) {
        setSelectedDestUnit(currentUser.linkedDestUnit);
    }
  }, [currentUser, isAdmin]);

  const toggleStatusFilter = (item: string) => {
    if (statusFilters.includes(item)) setStatusFilters(statusFilters.filter(i => i !== item));
    else setStatusFilters([...statusFilters, item]);
  };

  const togglePaymentFilter = (item: string) => {
    if (paymentFilters.includes(item)) setPaymentFilters(paymentFilters.filter(i => i !== item));
    else setPaymentFilters([...paymentFilters, item]);
  };

  const handleSort = (key: SortKey) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const filteredData = useMemo(() => {
    let data = ctes;

    if (filterText.length > 0) {
        const term = filterText.toLowerCase();
        data = data.filter(c => 
            c.cte.includes(filterText) || 
            c.serie.includes(filterText) || 
            (c.destinatario && c.destinatario.toLowerCase().includes(term)) ||
            (c.codigo && c.codigo.includes(filterText))
        );
    } else {
        if (!isAdmin) {
            data = data.filter(c => 
                (currentUser.linkedOriginUnit && c.coleta.includes(currentUser.linkedOriginUnit)) ||
                (currentUser.linkedDestUnit && c.entrega.includes(currentUser.linkedDestUnit)) ||
                c.status === 'EM BUSCA' 
            );
        }

        if (mode === 'critical') {
            data = data.filter(c => c.computedStatus === 'CRITICO');
        } else if (mode === 'search') {
            data = data.filter(c => c.status === 'EM BUSCA' || c.justificativa?.toUpperCase().includes('BUSCA')); 
        } else {
            data = data.filter(c => c.computedStatus !== 'CRITICO');
        }

        if (selectedDestUnit !== 'all') {
            data = data.filter(c => {
                if (mode === 'search' && !isAdmin) return true;
                return c.entrega === selectedDestUnit;
            });
        }

        if (statusFilters.length > 0) {
            data = data.filter(c => statusFilters.includes(c.computedStatus || ''));
        }

        if (paymentFilters.length > 0) {
            data = data.filter(c => c.fretePago && paymentFilters.some(pf => c.fretePago.includes(pf)));
        }

        if (noteFilter !== 'all') {
            data = data.filter(c => {
                const hasNote = notes.some(n => n.cteId === c.id);
                return noteFilter === 'com_nota' ? hasNote : !hasNote;
            });
        }
    }

    data = [...data].sort((a, b) => {
      let valA: any, valB: any;

      switch (sortConfig.key) {
        case 'cte': 
          valA = parseInt(a.cte) || 0; 
          valB = parseInt(b.cte) || 0; 
          break;
        case 'dataEmissao':
          valA = parseDate(a.dataEmissao)?.getTime() || 0;
          valB = parseDate(b.dataEmissao)?.getTime() || 0;
          break;
        case 'dataLimite':
          valA = parseDate(a.dataLimite)?.getTime() || 0;
          valB = parseDate(b.dataLimite)?.getTime() || 0;
          break;
        case 'status':
          valA = a.computedStatus || '';
          valB = b.computedStatus || '';
          break;
        case 'origem':
          valA = a.coleta || '';
          valB = b.coleta || '';
          break;
        case 'pagamento':
          valA = a.fretePago || '';
          valB = b.fretePago || '';
          break;
        case 'destinatario':
          valA = a.destinatario || '';
          valB = b.destinatario || '';
          break;
        default:
          return 0;
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return data;
  }, [ctes, mode, filterText, currentUser, paymentFilters, selectedDestUnit, statusFilters, isAdmin, sortConfig, noteFilter, notes]);

  const exportToExcel = () => {
    const enrichedData = filteredData.map(item => {
        const itemNotes = notes
            .filter(n => n.cteId === item.id)
            .sort((a, b) => parseDateTime(b.date) - parseDateTime(a.date));
        const latestNote = itemNotes.length > 0 ? itemNotes[0] : null;
        const noteText = latestNote ? `[${latestNote.date} ${latestNote.user}]: ${latestNote.text}` : item.justificativa;
        return { ...item, justificativa: noteText };
    });
    const ws = XLSX.utils.json_to_sheet(enrichedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    XLSX.writeFile(wb, `Relatorio_${mode}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`);
  };

  const renderDeadline = (limitDateStr: string) => {
      // PASS SYSTEM TODAY FOR CONSISTENT CALCULATION
      const daysDiff = calculateBusinessDaysDiff(limitDateStr, config.holidays, config.dataHoje);
      if (daysDiff === null) return <span className="text-gray-400">-</span>;
      if (daysDiff < 0) return <span className="text-[10px] font-bold text-red-600 whitespace-nowrap" title="Dias úteis após vencimento">Atrasado {Math.abs(daysDiff)} dias</span>;
      if (daysDiff === 0) return <span className="text-[10px] font-bold text-orange-500 whitespace-nowrap" title="Vence hoje">Vence Hoje</span>;
      if (daysDiff === 1) return <span className="text-[10px] font-bold text-yellow-600 whitespace-nowrap" title="Vence amanhã (dia útil)">Vence Amanhã</span>;
      return <span className="text-[10px] font-medium text-green-600 whitespace-nowrap" title="Dias úteis restantes">{daysDiff} dias restantes</span>;
  };

  const getStatusTooltip = (key: string) => {
     switch(key) {
         case 'FORA_DO_PRAZO': return 'Mercadoria vencida, mas ainda dentro do limite de tolerância.';
         case 'CRITICO': return 'Mercadoria com prazo estourado e tolerância excedida.';
         case 'VENCE_AMANHA': return 'Prazo de entrega vence no próximo dia útil.';
         case 'PRIORIDADE': return 'Prazo de entrega vence hoje.';
         case 'NO_PRAZO': return 'Entrega dentro do prazo regular.';
         default: return '';
     }
  };

  const SortIcon = ({ colKey }: { colKey: SortKey }) => {
    if (sortConfig.key !== colKey) return <i className="ph-bold ph-caret-up-down text-gray-300 ml-1 text-xs"></i>;
    return <i className={`ph-bold ${sortConfig.direction === 'asc' ? 'ph-caret-up' : 'ph-caret-down'} text-primary ml-1 text-xs`}></i>;
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="glass-panel p-4 rounded-2xl flex flex-col gap-4">
        <div className="flex flex-col xl:flex-row justify-between items-center gap-4">
            <div className="flex flex-col md:flex-row items-center gap-3 w-full xl:w-auto">
                <div className="relative w-full md:w-80">
                    <i className="ph-bold ph-magnifying-glass absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-lg"></i>
                    <input 
                    type="text" 
                    placeholder="Busca Universal (CTE, Série, Destinatário)..." 
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/10 transition shadow-sm font-medium"
                    />
                </div>
                
                {!filterText && (
                  <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-sm w-full md:w-auto animate-fade-in">
                      <i className="ph-fill ph-map-pin text-gray-400"></i>
                      {isAdmin ? (
                        <select 
                            className="bg-transparent text-sm font-bold text-gray-700 focus:outline-none cursor-pointer w-full md:w-48"
                            value={selectedDestUnit}
                            onChange={(e) => setSelectedDestUnit(e.target.value)}
                        >
                            <option value="all">Todas as Direções</option>
                            {destinationUnits.map(unit => (
                            <option key={unit} value={unit}>{unit}</option>
                            ))}
                        </select>
                      ) : (
                        <div className="flex items-center gap-2">
                             <span className="font-bold text-gray-800 text-sm">{currentUser?.linkedDestUnit || 'Todas'}</span>
                             <i className="ph-bold ph-lock-key text-gray-400 text-xs" title="Filtro bloqueado"></i>
                        </div>
                      )}
                  </div>
                )}
            </div>

            <div className="flex gap-3 w-full xl:w-auto items-center justify-end">
                <button onClick={exportToExcel} className="flex items-center gap-2 px-5 py-2.5 bg-green-100 text-green-700 font-medium rounded-xl hover:bg-green-200 transition shadow-sm">
                    <i className="ph-fill ph-microsoft-excel-logo text-lg"></i> <span className="hidden sm:inline">Exportar</span>
                </button>
            </div>
        </div>

        <div className="h-px bg-gray-100 w-full"></div>

        {!filterText ? (
          <div className="flex flex-col md:flex-row gap-6 animate-fade-in">
              <div className="flex gap-2 flex-wrap items-center">
                  <span className="text-[10px] font-bold text-gray-400 uppercase mr-1">Pagamento:</span>
                  {['CIF', 'FOB', 'FATURAR REMETENTE', 'FATURAR DEST'].map(type => (
                  <button
                      key={type}
                      onClick={() => togglePaymentFilter(type)}
                      title={`Filtrar por ${type}`}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition border ${
                      paymentFilters.includes(type) 
                      ? 'bg-primary text-white border-primary shadow-md ring-2 ring-primary/20' 
                      : 'bg-white text-gray-500 border-gray-200 hover:border-secondary hover:text-secondary'
                      }`}
                  >
                      {type}
                  </button>
                  ))}
              </div>

              {mode !== 'critical' && (
                <div className="flex gap-2 flex-wrap items-center">
                    <span className="text-[10px] font-bold text-gray-400 uppercase mr-1">Status:</span>
                    {[
                    { label: 'Fora do Prazo', key: 'FORA_DO_PRAZO', color: 'bg-red-500' },
                    { label: 'Prioridade', key: 'PRIORIDADE', color: 'bg-orange-500' },
                    { label: 'Vence Amanhã', key: 'VENCE_AMANHA', color: 'bg-yellow-400' },
                    { label: 'No Prazo', key: 'NO_PRAZO', color: 'bg-cyan-500' }
                    ].map(status => (
                        <button
                            key={status.key}
                            onClick={() => toggleStatusFilter(status.key)}
                            className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition border flex items-center gap-1 ${
                                statusFilters.includes(status.key)
                                ? 'bg-white text-gray-800 border-gray-300 ring-2 ring-gray-100 shadow-sm' 
                                : 'bg-white text-gray-500 border-gray-200'
                            }`}
                        >
                            <span className={`w-2 h-2 rounded-full ${status.color}`}></span>
                            {status.label}
                        </button>
                    ))}
                </div>
              )}

              <div className="flex gap-2 flex-wrap items-center">
                  <span className="text-[10px] font-bold text-gray-400 uppercase mr-1">Notas:</span>
                  <button
                      onClick={() => setNoteFilter(noteFilter === 'com_nota' ? 'all' : 'com_nota')}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition border flex items-center gap-1 ${
                      noteFilter === 'com_nota'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200 ring-1 ring-indigo-200' 
                      : 'bg-white text-gray-500 border-gray-200 hover:text-indigo-600'
                      }`}
                  >
                      <i className="ph-fill ph-chat-text"></i> Com Anotação
                  </button>
                  <button
                      onClick={() => setNoteFilter(noteFilter === 'sem_nota' ? 'all' : 'sem_nota')}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition border flex items-center gap-1 ${
                      noteFilter === 'sem_nota'
                      ? 'bg-gray-100 text-gray-800 border-gray-300 ring-1 ring-gray-200' 
                      : 'bg-white text-gray-500 border-gray-200 hover:text-gray-700'
                      }`}
                  >
                      <i className="ph-bold ph-prohibit"></i> Sem Anotação
                  </button>
              </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500 font-medium animate-fade-in flex items-center gap-2">
            <i className="ph-fill ph-globe-hemisphere-west text-secondary"></i>
            <span>Modo Busca Global Ativo: Exibindo resultados de toda a base de dados.</span>
          </div>
        )}
      </div>

      <div className="hidden md:block glass-panel rounded-2xl overflow-hidden border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead className="bg-gray-50/50 text-gray-500 text-xs uppercase tracking-wider font-semibold select-none">
            <tr>
              <th className="p-5 cursor-pointer hover:bg-gray-100 transition whitespace-nowrap" onClick={() => handleSort('cte')}>
                <div className="flex items-center">CTE / Série <SortIcon colKey="cte" /></div>
              </th>
              <th className="p-5 cursor-pointer hover:bg-gray-100 transition whitespace-nowrap" onClick={() => handleSort('destinatario')}>
                <div className="flex items-center">Destinatário <SortIcon colKey="destinatario" /></div>
              </th>
              <th className="p-5 cursor-pointer hover:bg-gray-100 transition whitespace-nowrap" onClick={() => handleSort('dataEmissao')}>
                <div className="flex items-center">Emissão <SortIcon colKey="dataEmissao" /></div>
              </th>
              <th className="p-5 cursor-pointer hover:bg-gray-100 transition whitespace-nowrap" onClick={() => handleSort('dataLimite')}>
                <div className="flex items-center">Prazo / Limite <SortIcon colKey="dataLimite" /></div>
              </th>
              <th className="p-5 cursor-pointer hover:bg-gray-100 transition whitespace-nowrap" onClick={() => handleSort('status')}>
                <div className="flex items-center">Status <SortIcon colKey="status" /></div>
              </th>
              <th className="p-5 cursor-pointer hover:bg-gray-100 transition whitespace-nowrap" onClick={() => handleSort('origem')}>
                <div className="flex items-center">Origem / Destino <SortIcon colKey="origem" /></div>
              </th>
              <th className="p-5 cursor-pointer hover:bg-gray-100 transition whitespace-nowrap" onClick={() => handleSort('pagamento')}>
                <div className="flex items-center">Pagamento <SortIcon colKey="pagamento" /></div>
              </th>
              <th className="p-5 text-right whitespace-nowrap">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredData.map(item => {
                const highlighted = currentUser && !isAdmin && (
                    (currentUser.linkedDestUnit && item.entrega.includes(currentUser.linkedDestUnit)) ||
                    (currentUser.linkedOriginUnit && item.coleta.includes(currentUser.linkedOriginUnit))
                ) && item.status === 'EM BUSCA';

                const noteCount = notes.filter(n => n.cteId === item.id).length;

                return (
                <tr 
                    key={item.id} 
                    className={`transition duration-200 group ${
                        highlighted 
                        ? 'bg-orange-50/80 hover:bg-orange-100 border-l-4 border-l-orange-500' 
                        : 'hover:bg-gray-50/80'
                    }`}
                >
                    <td className="p-5 font-bold text-primary whitespace-nowrap">
                    {item.cte} <span className="text-gray-400 font-normal text-xs ml-1">/ {item.serie}</span>
                    {highlighted && <span className="ml-2 bg-orange-200 text-orange-800 text-[10px] px-1.5 py-0.5 rounded font-bold">SUA UNIDADE</span>}
                    </td>
                    <td className="p-5 text-sm font-medium text-gray-700 max-w-[200px] truncate" title={item.destinatario}>
                        {item.destinatario}
                    </td>
                    <td className="p-5 text-sm text-gray-600 whitespace-nowrap">{item.dataEmissao}</td>
                    <td className="p-5 text-sm whitespace-nowrap">
                    <div className="flex flex-col">
                        <span className="text-gray-400 text-[10px] uppercase">Limite</span>
                        <span className="font-bold text-gray-800">{item.dataLimite}</span>
                        {renderDeadline(item.dataLimite)}
                    </div>
                    </td>
                    <td className="p-5 whitespace-nowrap">
                    <span 
                        title={getStatusTooltip(item.computedStatus || '')}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide cursor-help ${getStatusColor(item.computedStatus || 'NO_PRAZO')}`}
                    >
                        {item.computedStatus?.replace(/_/g, ' ')}
                    </span>
                    </td>
                    <td className="p-5 text-xs text-gray-500 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-700">{item.coleta}</span>
                        <i className="ph-bold ph-arrow-right text-gray-300"></i>
                        <span className="font-medium text-gray-700">{item.entrega}</span>
                    </div>
                    </td>
                    <td className="p-5 whitespace-nowrap">
                    <span 
                        className={`cursor-pointer px-2 py-1 rounded border text-[10px] font-bold uppercase hover:opacity-80 ${getPaymentColor(item.fretePago)}`}
                        onClick={() => !filterText && togglePaymentFilter(item.fretePago)}
                    >
                        {item.fretePago}
                    </span>
                    </td>
                    <td className="p-5 text-right whitespace-nowrap">
                    <div className="flex justify-end gap-2">
                        <button 
                        onClick={() => setSelectedCteId(item.id)}
                        className="relative w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white flex items-center justify-center transition shadow-sm group-hover:scale-105"
                        title="Ver Detalhes e Notas"
                        >
                        <i className={`text-lg ${noteCount > 0 ? 'ph-fill ph-chat-text' : 'ph-bold ph-chat'}`}></i>
                        {noteCount > 0 && (
                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold min-w-[20px] h-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm px-1">
                                {noteCount}
                            </span>
                        )}
                        </button>
                    </div>
                    </td>
                </tr>
            )})}
          </tbody>
        </table>
        {filteredData.length === 0 && (
          <div className="p-10 text-center text-gray-400">
             <i className="ph-duotone ph-files text-4xl mb-2 opacity-50"></i>
             <p>Nenhum registro encontrado para os filtros atuais.</p>
          </div>
        )}
      </div>

      <div className="md:hidden grid grid-cols-1 gap-4">
        {filteredData.map(item => {
          const highlighted = currentUser && !isAdmin && (
              (currentUser.linkedDestUnit && item.entrega.includes(currentUser.linkedDestUnit)) ||
              (currentUser.linkedOriginUnit && item.coleta.includes(currentUser.linkedOriginUnit))
          ) && item.status === 'EM BUSCA';
          
          const noteCount = notes.filter(n => n.cteId === item.id).length;

          return (
          <div 
             key={item.id} 
             className={`glass-panel p-5 rounded-2xl border-l-4 shadow-sm ${
                 highlighted ? 'bg-orange-50 border-l-orange-500 ring-1 ring-orange-200' : ''
             }`}
             style={{ borderLeftColor: !highlighted ? (item.computedStatus === 'CRITICO' ? '#ef4444' : '#22c5e5') : undefined }}
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="font-bold text-xl text-primary flex items-center gap-2">
                    {item.cte}
                    {highlighted && <i className="ph-fill ph-star text-orange-500 text-xs"></i>}
                </h4>
                <p className="text-xs text-gray-500">Série: {item.serie}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${getStatusColor(item.computedStatus || 'NO_PRAZO')}`}>
                {item.computedStatus?.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="mb-3 px-3 py-2 bg-white rounded-lg border border-gray-100">
                <p className="text-[10px] uppercase text-gray-400 font-bold mb-0.5">Destinatário</p>
                <p className="text-sm font-semibold text-gray-800 leading-tight">{item.destinatario}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm text-gray-600 mb-4 bg-gray-50 p-3 rounded-lg">
              <div>
                <p className="text-[10px] uppercase text-gray-400 font-bold">Limite</p>
                <p className="font-medium whitespace-nowrap">{item.dataLimite}</p>
                {renderDeadline(item.dataLimite)}
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400 font-bold">Valor</p>
                <p className="font-medium">R$ {item.valor.toFixed(2)}</p>
              </div>
            </div>
            <div className="flex justify-between items-center">
               <span className={`px-2 py-1 rounded text-[10px] font-bold ${getPaymentColor(item.fretePago)}`}>{item.fretePago}</span>
               <button onClick={() => setSelectedCteId(item.id)} className="relative text-secondary font-bold text-sm flex items-center gap-2 hover:text-accent bg-indigo-50 px-3 py-1.5 rounded-lg">
                 {noteCount > 0 && <span className="bg-red-500 text-white text-[9px] px-1.5 rounded-full">{noteCount}</span>}
                 Ver Detalhes <i className="ph-bold ph-caret-right"></i>
               </button>
            </div>
          </div>
        )})}
      </div>
    </div>
  );
}
