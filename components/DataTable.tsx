import React, { useState, useMemo } from 'react';
import { CteData } from '../types';
import StatusBadge from './StatusBadge';
import { MessageSquare, Filter, X, CheckCircle, Package, ArrowUpDown, ArrowUp, ArrowDown, FileSpreadsheet, Search, AlertTriangle, CalendarCheck2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import clsx from 'clsx';
import { COLORS } from '../constants';

interface Props {
  data: CteData[];
  onNoteClick: (cte: CteData) => void;
  title: string;
  isPendencyView?: boolean;
  isCriticalView?: boolean;
  enableFilters?: boolean; // New prop to force enable filters
  ignoreUnitFilter?: boolean; // Forces table to ignore user's linked unit (for Global Views like Em Busca)
}

type SortDirection = 'asc' | 'desc';
interface SortConfig {
  key: keyof CteData | 'STATUS_CALCULADO' | 'VALOR_NUMBER' | 'DATA_LIMITE_DATE';
  direction: SortDirection;
}

interface FilterCardProps {
  label: string;
  count: number;
  color: string;
  selected: boolean;
  dimmed?: boolean; // New prop for visual feedback
  onClick: () => void;
}

const FilterCard: React.FC<FilterCardProps> = ({ label, count, color, selected, dimmed, onClick }) => (
  <div 
      onClick={onClick}
      className={clsx(
          "rounded-lg p-2 border transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden group hover:shadow-sm min-h-[60px]",
          selected 
              ? "bg-white ring-1 ring-inset z-10 scale-[1.02]" 
              : "bg-gray-50 border-gray-200 hover:bg-white",
          dimmed && !selected ? "opacity-40 hover:opacity-80 scale-95 grayscale-[0.5]" : "opacity-100"
      )}
      style={{ 
          borderColor: selected ? color : undefined, 
          backgroundColor: selected ? `${color}08` : undefined
      }}
  >
      {selected && (
          <div className="absolute top-1 right-1">
              <CheckCircle size={12} fill={color} className="text-white" />
          </div>
      )}
      <span className="font-bold text-[10px] uppercase tracking-wider text-gray-500 truncate block pr-3" style={{ color: selected ? color : undefined }}>
          {label}
      </span>
      <div className="mt-1">
          <span className="text-lg font-bold text-gray-800 leading-none">{count}</span>
      </div>
      <div className="absolute bottom-0 left-0 h-0.5 w-full transition-all" style={{ backgroundColor: color, opacity: selected ? 1 : 0.3 }} />
  </div>
);

const DataTable: React.FC<Props> = ({ data, onNoteClick, title, isPendencyView = false, isCriticalView = false, enableFilters = false, ignoreUnitFilter = false }) => {
  const { user } = useAuth();
  const { notes, getLatestNote, processedData, baseData, isCteEmBusca } = useData();

  // --- Filter State ---
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [paymentFilters, setPaymentFilters] = useState<string[]>([]);
  const [noteFilter, setNoteFilter] = useState<'ALL' | 'WITH' | 'WITHOUT'>('ALL');
  const [globalSearch, setGlobalSearch] = useState('');
  
  // --- Sort State ---
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'DATA_LIMITE_DATE', direction: 'asc' });

  // --- Constants ---
  const STATUS_OPTIONS = useMemo(() => {
    if (isPendencyView) return ['FORA DO PRAZO', 'PRIORIDADE', 'VENCE AMANHÃ', 'NO PRAZO'];
    if (isCriticalView) return ['CRÍTICO'];
    return ['CRÍTICO', 'FORA DO PRAZO', 'PRIORIDADE', 'VENCE AMANHÃ', 'NO PRAZO'];
  }, [isPendencyView, isCriticalView]);

  const PAYMENT_OPTIONS = ['CIF', 'FOB', 'FATURAR_REMETENTE', 'FATURAR_DEST'];
  
  const STATUS_COLORS_MAP: Record<string, string> = {
    'CRÍTICO': COLORS.critical,
    'FORA DO PRAZO': COLORS.late,
    'PRIORIDADE': COLORS.priority,
    'VENCE AMANHÃ': COLORS.tomorrow,
    'NO PRAZO': COLORS.ontime,
  };

  const PAYMENT_COLORS_MAP: Record<string, string> = {
    'CIF': '#10b981',
    'FOB': '#ef4444',
    'FATURAR_REMETENTE': '#eab308',
    'FATURAR_DEST': '#f97316'
  };

  // Encontra a data mais recente baseada na coluna DATA EMISSAO
  const latestEmissaoDate = useMemo(() => {
    if (baseData.length === 0) return '--/--/----';
    let maxVal = 0;
    let maxStr = '';
    baseData.forEach(d => {
       if (!d.DATA_EMISSAO) return;
       const parts = d.DATA_EMISSAO.split('/');
       if (parts.length === 3) {
           const val = parseInt(parts[2] + parts[1].padStart(2, '0') + parts[0].padStart(2, '0'));
           if (val > maxVal) { maxVal = val; maxStr = d.DATA_EMISSAO; }
       }
    });
    return maxStr || '--/--/----';
  }, [baseData]);

  // --- Helpers ---
  const toggleFilter = (list: string[], item: string) => {
    return list.includes(item) ? list.filter(i => i !== item) : [...list, item];
  };

  const getNoteCount = (cte: string) => notes.filter(n => n.CTE === cte).length;

  const parseCurrency = (value: string) => {
    if (!value) return 0;
    try {
        const clean = value.replace(/[^\d,-]/g, '').replace(',', '.');
        return parseFloat(clean) || 0;
    } catch { return 0; }
  };

  const parseDate = (dateStr: string) => {
    if (!dateStr) return 0;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return 0;
    return parseInt(`${parts[2]}${parts[1]}${parts[0]}`);
  };

  const handleSort = (sortKey: SortConfig['key']) => {
    setSortConfig(current => ({
      key: sortKey,
      direction: current.key === sortKey && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // --- Data Processing ---
  const availableUnits = useMemo(() => {
    const sourceForUnits = globalSearch.trim().length > 0 ? processedData : data;
    const units = new Set(sourceForUnits.map(d => d.ENTREGA).filter(Boolean));
    return Array.from(units).sort();
  }, [data, processedData, globalSearch]);

  const filteredData = useMemo(() => {
    const isGlobalSearch = globalSearch.trim().length > 0;
    let result = isGlobalSearch ? processedData : data;

    if (isGlobalSearch) {
      const term = globalSearch.toLowerCase();
      result = result.filter(d => 
        d.CTE.toLowerCase().includes(term) ||
        d.DESTINATARIO.toLowerCase().includes(term) ||
        d.ENTREGA.toLowerCase().includes(term) ||
        d.SERIE.toLowerCase().includes(term)
      );
    } else {
        if (isPendencyView) result = result.filter(d => d.STATUS_CALCULADO !== 'CRÍTICO');
    }

    const userRestrictedUnit = ignoreUnitFilter ? null : user?.linkedDestUnit;
    const effectiveUnit = userRestrictedUnit || selectedUnit;
    if (effectiveUnit) result = result.filter(d => d.ENTREGA === effectiveUnit);

    if (statusFilters.length > 0) result = result.filter(d => statusFilters.includes(d.STATUS_CALCULADO || ''));
    if (paymentFilters.length > 0) result = result.filter(d => paymentFilters.includes(d.FRETE_PAGO || ''));
    if (noteFilter !== 'ALL') {
      result = result.filter(d => {
        const count = getNoteCount(d.CTE);
        return noteFilter === 'WITH' ? count > 0 : count === 0;
      });
    }
    return result;
  }, [data, processedData, isPendencyView, user, selectedUnit, statusFilters, paymentFilters, noteFilter, notes, globalSearch, ignoreUnitFilter]);

  const sortedData = useMemo(() => {
    const sorted = [...filteredData];
    sorted.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';
      switch (sortConfig.key) {
        case 'VALOR_NUMBER':
          valA = parseCurrency(a.VALOR_CTE);
          valB = parseCurrency(b.VALOR_CTE);
          break;
        case 'DATA_LIMITE_DATE':
          valA = parseDate(a.DATA_LIMITE_BAIXA);
          valB = parseDate(b.DATA_LIMITE_BAIXA);
          break;
        case 'CTE':
          valA = parseInt(a.CTE) || 0;
          valB = parseInt(b.CTE) || 0;
          break;
        case 'STATUS_CALCULADO':
          valA = a.STATUS_CALCULADO || a.STATUS || '';
          valB = b.STATUS_CALCULADO || b.STATUS || '';
          break;
        default:
          valA = (a as any)[sortConfig.key] || '';
          valB = (b as any)[sortConfig.key] || '';
      }
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredData, sortConfig]);

  // Counts for filters (Corrected for Dynamic Cross-Filtering)
  const getCount = (filterType: 'status' | 'payment' | 'note', key: string) => {
      let base = globalSearch.trim().length > 0 ? processedData : data;
      if (!globalSearch && isPendencyView) base = base.filter(d => d.STATUS_CALCULADO !== 'CRÍTICO');
      
      const userRestrictedUnit = ignoreUnitFilter ? null : user?.linkedDestUnit;
      const effectiveUnit = userRestrictedUnit || selectedUnit;
      if (effectiveUnit) base = base.filter(d => d.ENTREGA === effectiveUnit);

      // Aplicar filtros das OUTRAS categorias (Cross-Filtering)
      if (filterType === 'status') {
          if (paymentFilters.length > 0) base = base.filter(d => paymentFilters.includes(d.FRETE_PAGO || ''));
          if (noteFilter !== 'ALL') {
              base = base.filter(d => {
                  const count = getNoteCount(d.CTE);
                  return noteFilter === 'WITH' ? count > 0 : count === 0;
              });
          }
          return base.filter(d => d.STATUS_CALCULADO === key).length;
      }
      
      if (filterType === 'payment') {
          if (statusFilters.length > 0) base = base.filter(d => statusFilters.includes(d.STATUS_CALCULADO || ''));
          if (noteFilter !== 'ALL') {
              base = base.filter(d => {
                  const count = getNoteCount(d.CTE);
                  return noteFilter === 'WITH' ? count > 0 : count === 0;
              });
          }
          return base.filter(d => d.FRETE_PAGO === key).length;
      }
      
      if (filterType === 'note') {
         if (statusFilters.length > 0) base = base.filter(d => statusFilters.includes(d.STATUS_CALCULADO || ''));
         if (paymentFilters.length > 0) base = base.filter(d => paymentFilters.includes(d.FRETE_PAGO || ''));
         return base.filter(d => {
             const count = getNoteCount(d.CTE);
             return key === 'WITH' ? count > 0 : count === 0;
         }).length;
      }
      return 0;
  };

  const showFilters = isPendencyView || enableFilters;

  const SortHeader = ({ label, sortKey }: { label: string, sortKey: SortConfig['key'] }) => (
    <th className="px-4 py-3 cursor-pointer group hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort(sortKey)}>
      <div className="flex items-center gap-1">
        {label}
        <div className="text-gray-400 group-hover:text-primary-600">
           {sortConfig.key === sortKey ? (
               sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
           ) : ( <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-50" /> )}
        </div>
      </div>
    </th>
  );

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      
      {/* Search & Update Bar */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
           <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="text-gray-400" size={20} />
           </div>
           <input 
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Busca Global (CTE, Destinatário, Unidade)..."
              className={clsx(
                  "w-full pl-10 pr-4 py-3 rounded-lg border focus:ring-2 focus:ring-primary-500 outline-none transition-all shadow-sm text-gray-900",
                  globalSearch ? "bg-primary-50 border-primary-300 ring-2 ring-primary-100" : "bg-white border-gray-200"
              )}
           />
        </div>
        <div className="flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-lg border border-emerald-100 text-emerald-700 text-xs font-bold shadow-sm h-fit self-center">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <CalendarCheck2 size={16} />
            <span>Atualizado até {latestEmissaoDate}</span>
        </div>
      </div>

      {/* Filter Section */}
      {showFilters && (
        <div className={clsx("space-y-3 bg-white p-4 rounded-xl shadow-sm border border-gray-200 transition-opacity", globalSearch ? "opacity-50 pointer-events-none grayscale" : "opacity-100")}>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <Filter size={18} className="text-primary-600" /> Filtros
                </h2>
                <div className="w-full md:w-auto">
                    {user?.linkedDestUnit && !ignoreUnitFilter ? (
                        <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 cursor-not-allowed">
                            <Package size={14} /> <span className="font-bold text-xs">{user.linkedDestUnit}</span>
                        </div>
                    ) : (
                        <select value={selectedUnit} onChange={(e) => setSelectedUnit(e.target.value)} className="w-full md:w-64 appearance-none bg-gray-50 border border-gray-200 text-gray-700 py-2 px-3 rounded-lg text-xs font-bold focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer">
                            <option value="">Todas as Unidades</option>
                            {availableUnits.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {STATUS_OPTIONS.map(status => (
                    <FilterCard 
                        key={status}
                        label={status}
                        count={getCount('status', status)}
                        color={STATUS_COLORS_MAP[status]}
                        selected={statusFilters.includes(status)}
                        dimmed={statusFilters.length > 0}
                        onClick={() => setStatusFilters(prev => toggleFilter(prev, status))}
                    />
                ))}
                 <FilterCard 
                    label="Com Notas" count={getCount('note', 'WITH')} color={COLORS.priority} 
                    selected={noteFilter === 'WITH'} dimmed={noteFilter !== 'ALL'}
                    onClick={() => setNoteFilter(prev => prev === 'WITH' ? 'ALL' : 'WITH')}
                 />
                 <FilterCard 
                    label="Sem Notas" count={getCount('note', 'WITHOUT')} color="#6b7280" 
                    selected={noteFilter === 'WITHOUT'} dimmed={noteFilter !== 'ALL'}
                    onClick={() => setNoteFilter(prev => prev === 'WITHOUT' ? 'ALL' : 'WITHOUT')}
                 />
            </div>
            
             <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-gray-100">
                {PAYMENT_OPTIONS.map(pay => (
                    <div 
                        key={pay} onClick={() => setPaymentFilters(prev => toggleFilter(prev, pay))}
                        className={clsx(
                            "flex items-center justify-between px-3 py-1.5 rounded-lg border cursor-pointer transition-all select-none",
                            paymentFilters.includes(pay) ? "bg-white shadow-sm ring-1 ring-inset scale-[1.02]" : "bg-gray-50 border-gray-100 hover:bg-gray-100",
                            paymentFilters.length > 0 && !paymentFilters.includes(pay) ? "opacity-40 grayscale" : "opacity-100"
                        )}
                        style={{ borderColor: paymentFilters.includes(pay) ? PAYMENT_COLORS_MAP[pay] : undefined }}
                    >
                        <div className="flex items-center gap-2">
                           <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PAYMENT_COLORS_MAP[pay] }} />
                           <span className="text-[10px] font-bold text-gray-600">{pay.replace('_', ' ')}</span>
                        </div>
                        <span className="text-[10px] font-bold text-gray-800">{getCount('payment', pay)}</span>
                    </div>
                ))}
             </div>
             
             {(statusFilters.length > 0 || paymentFilters.length > 0 || noteFilter !== 'ALL') && (
                 <button onClick={() => { setStatusFilters([]); setPaymentFilters([]); setNoteFilter('ALL'); }} className="w-full py-1.5 text-xs text-red-500 font-bold hover:bg-red-50 rounded transition-colors flex items-center justify-center gap-1">
                    <X size={12} /> Limpar Filtros
                 </button>
             )}
        </div>
      )}

      {/* Main Table Title & Action */}
      <div className="flex justify-between items-center mb-4 mt-6">
        <h2 className="text-xl font-bold text-primary-900">{title} <span className="text-gray-400 text-sm font-normal">({filteredData.length})</span></h2>
        <button onClick={() => {
            const exportData = sortedData.map(d => ({
                CTE: d.CTE, SERIE: d.SERIE, DATA_EMISSAO: d.DATA_EMISSAO, DATA_LIMITE: d.DATA_LIMITE_BAIXA,
                STATUS: d.STATUS_CALCULADO || d.STATUS, UNIDADE: d.ENTREGA, CLIENTE: d.DESTINATARIO, VALOR: d.VALOR_CTE
            }));
            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Dados");
            XLSX.writeFile(wb, `SLE_${title.replace(/\s/g, '_')}.xlsx`);
        }} className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 text-sm font-medium shadow-sm flex items-center gap-2 transition-colors">
          <FileSpreadsheet size={18} /> Exportar Excel
        </button>
      </div>

      <div className="hidden md:block overflow-x-auto bg-white rounded-lg shadow border border-gray-200">
        <table className="w-full text-sm text-left">
          <thead className="bg-primary-50 text-primary-900 uppercase font-bold text-xs">
            <tr>
              <SortHeader label="Status" sortKey="STATUS_CALCULADO" />
              <SortHeader label="CTE / Série" sortKey="CTE" />
              <SortHeader label="Data Limite" sortKey="DATA_LIMITE_DATE" />
              <SortHeader label="Unid. Destino / Cliente" sortKey="DESTINATARIO" />
              <SortHeader label="Valor" sortKey="VALOR_NUMBER" />
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedData.map((row, idx) => {
              const noteCount = getNoteCount(row.CTE);
              const isEmBusca = isCteEmBusca(row.CTE, row.SERIE, row.STATUS);
              const userHasInteracted = notes.some(n => n.CTE === row.CTE && n.USUARIO.toLowerCase() === user?.username.toLowerCase());
              const needsAttention = isEmBusca && !userHasInteracted && !!user?.linkedDestUnit;

              return (
                <tr key={`${row.CTE}-${idx}`} className={clsx("transition-colors", needsAttention ? "bg-red-50 hover:bg-red-100 border-l-4 border-red-500 animate-[pulse_3s_ease-in-out_infinite]" : "hover:bg-gray-50")}>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 items-start">
                      {needsAttention && <span className="flex items-center gap-1 text-[10px] font-black text-red-600 bg-red-100 px-1.5 py-0.5 rounded animate-bounce"><AlertTriangle size={10} /> ATENÇÃO</span>}
                      <StatusBadge status={row.STATUS_CALCULADO || row.STATUS} />
                      <StatusBadge status={row.FRETE_PAGO} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{row.CTE}</div>
                    <div className="text-xs text-gray-500">Série: {row.SERIE}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx("font-bold", row.STATUS_CALCULADO === 'FORA DO PRAZO' ? 'text-red-600' : 'text-gray-700')}>{row.DATA_LIMITE_BAIXA}</span>
                  </td>
                  <td className="px-4 py-3 truncate max-w-xs">
                    <div className="truncate text-xs text-primary-600 font-bold uppercase mb-0.5">{row.ENTREGA}</div>
                    <div className="truncate font-medium text-gray-800">{row.DESTINATARIO}</div>
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-gray-700">{row.VALOR_CTE}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => onNoteClick(row)} className={clsx("p-2 rounded-full relative transition-all group", needsAttention ? "bg-red-600 text-white shadow-lg" : noteCount > 0 ? "text-orange-500 bg-orange-50" : "text-gray-400 hover:text-primary-600 hover:bg-gray-100")}>
                      <MessageSquare size={18} fill={noteCount > 0 ? "currentColor" : "none"} />
                      {noteCount > 0 && <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold border border-white">{noteCount}</span>}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredData.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">Nenhum resultado para os filtros aplicados.</div>}
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {sortedData.map((row, idx) => {
           const noteCount = getNoteCount(row.CTE);
           const needsAttention = isCteEmBusca(row.CTE, row.SERIE, row.STATUS) && !notes.some(n => n.CTE === row.CTE && n.USUARIO.toLowerCase() === user?.username.toLowerCase()) && !!user?.linkedDestUnit;
           return (
            <div key={`${row.CTE}-${idx}`} className={clsx("bg-white p-4 rounded-lg shadow border-l-4 transition-all", needsAttention ? "border-red-500 bg-red-50" : "border-primary-500")}>
              <div className="flex justify-between items-start mb-2">
                <div><div className="text-lg font-bold text-gray-900">CTE {row.CTE}</div><div className="text-xs text-gray-500">Série {row.SERIE}</div></div>
                <div className="flex flex-col gap-1 items-end"><StatusBadge status={row.STATUS_CALCULADO || row.STATUS} /><StatusBadge status={row.FRETE_PAGO} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-gray-700 mb-3 pt-2 border-t border-gray-50">
                <div><span className="block text-xs text-gray-400">Limite</span><span className="font-bold">{row.DATA_LIMITE_BAIXA}</span></div>
                <div><span className="block text-xs text-gray-400">Valor</span><span className="font-mono font-bold">{row.VALOR_CTE}</span></div>
              </div>
              <div className="flex justify-end pt-2 border-t border-gray-50">
                  <button onClick={() => onNoteClick(row)} className={clsx("flex items-center font-medium text-sm transition-colors px-3 py-1.5 rounded-lg", needsAttention ? "bg-red-600 text-white shadow-lg" : noteCount > 0 ? "text-orange-500" : "text-gray-500")}>
                    <MessageSquare size={16} className="mr-1" fill={noteCount > 0 ? "currentColor" : "none"} />
                    {needsAttention ? "Resolver / Ciente" : (noteCount > 0 ? `Notas (${noteCount})` : 'Anotar')}
                  </button>
              </div>
            </div>
           );
        })}
      </div>
    </div>
  );
};

export default DataTable;