import React, { useEffect, useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, 
  PieChart, Pie, Sector, CartesianGrid
} from 'recharts';

interface AgencyMetric {
  name: string;
  volume: number;
  value: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#ef4444'];

export const Dashboard = () => {
  const { ctes, currentUser } = useApp();
  
  // Filters State (Multi-select)
  const [selectedDestUnit, setSelectedDestUnit] = useState<string>('all');
  const [statusFilters, setStatusFilters] = useState<string[]>([]); 
  const [paymentFilters, setPaymentFilters] = useState<string[]>([]);
  
  // Charts State
  const [offenderViewMode, setOffenderViewMode] = useState<'chart' | 'list'>('chart');
  const [offenderMetric, setOffenderMetric] = useState<'volume' | 'value'>('value');
  const [offenderSort, setOffenderSort] = useState<'metric' | 'name'>('metric'); 
  
  // Efficiency Sort State
  const [efficiencySort, setEfficiencySort] = useState<'asc' | 'desc' | 'vol'>('asc'); // asc = Piores primeiro (Ofensores)

  const [activeIndex, setActiveIndex] = useState(0); // For Pie Chart hover
  
  // Responsive State for Chart Layout
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isAdmin = currentUser?.role.toLowerCase() === 'admin';

  // Extract Unique Destination Units
  const destinationUnits = useMemo(() => {
    const units = new Set(ctes.map(c => c.entrega).filter(Boolean));
    return Array.from(units).sort();
  }, [ctes]);

  // Set default unit for non-admins
  useEffect(() => {
    if (!isAdmin && currentUser?.linkedDestUnit) {
        setSelectedDestUnit(currentUser.linkedDestUnit);
    }
  }, [currentUser, isAdmin]);

  // Helper to toggle array items
  const toggleFilter = (item: string, current: string[], setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    if (current.includes(item)) {
      setter(current.filter(i => i !== item));
    } else {
      setter([...current, item]);
    }
  };

  // Apply Filters
  const filteredCtes = useMemo(() => {
    let data = ctes;

    // 1. User Role Scope
    if (!isAdmin) {
      data = data.filter(c => 
        (currentUser.linkedOriginUnit && c.coleta.includes(currentUser.linkedOriginUnit)) ||
        (currentUser.linkedDestUnit && c.entrega.includes(currentUser.linkedDestUnit)) ||
        c.status === 'EM BUSCA'
      );
    }

    // 2. Destination Selector
    if (selectedDestUnit !== 'all') {
      data = data.filter(c => c.entrega === selectedDestUnit);
    }

    // 3. Status Filters (Multi)
    if (statusFilters.length > 0) {
      data = data.filter(c => {
         if (statusFilters.includes('EM_BUSCA') && (c.status === 'EM BUSCA' || c.justificativa?.toUpperCase().includes('BUSCA'))) return true;
         return statusFilters.includes(c.computedStatus || '');
      });
    }

    // 4. Payment Filters (Multi)
    if (paymentFilters.length > 0) {
       data = data.filter(c => paymentFilters.some(pf => c.fretePago.includes(pf)));
    }

    return data;
  }, [ctes, currentUser, selectedDestUnit, statusFilters, paymentFilters, isAdmin]);

  // KPIs
  const kpis = {
    total: filteredCtes.length,
    critico: filteredCtes.filter(c => c.computedStatus === 'CRITICO').length,
    foraPrazo: filteredCtes.filter(c => c.computedStatus === 'FORA_DO_PRAZO').length,
    venceAmanha: filteredCtes.filter(c => c.computedStatus === 'VENCE_AMANHA').length,
    prioridade: filteredCtes.filter(c => c.computedStatus === 'PRIORIDADE').length,
    noPrazo: filteredCtes.filter(c => c.computedStatus === 'NO_PRAZO').length,
    valorTotal: filteredCtes.reduce((acc, curr) => acc + curr.valor, 0),
    emBusca: filteredCtes.filter(c => c.status === 'EM BUSCA' || c.justificativa?.toUpperCase().includes('BUSCA')).length
  };

  // Status Chart Data (Pie)
  const statusData = [
    { name: 'Crítico', value: kpis.critico, color: '#ef4444', key: 'CRITICO' },
    { name: 'Fora Prazo', value: kpis.foraPrazo, color: '#f87171', key: 'FORA_DO_PRAZO' },
    { name: 'Prioridade', value: kpis.prioridade, color: '#f97316', key: 'PRIORIDADE' },
    { name: 'Vence Amanhã', value: kpis.venceAmanha, color: '#eab308', key: 'VENCE_AMANHA' },
    { name: 'No Prazo', value: kpis.noPrazo, color: '#06b6d4', key: 'NO_PRAZO' },
  ].filter(d => d.value > 0); 

  // Efficiency Calculation
  const efficiencyData = useMemo(() => {
      // Determine grouping key based on filter context
      const groupByKey = (selectedDestUnit === 'all') ? 'entrega' : 'coleta';
      
      const groups: Record<string, { positive: number; negative: number; total: number }> = {};

      filteredCtes.forEach(c => {
          const rawKey = c[groupByKey];
          if (!rawKey) return;
          
          // Clean key name for chart display - keep shorter for X-Axis
          const key = rawKey.length > 25 ? rawKey.substring(0, 25) + '...' : rawKey;
          
          if (!groups[key]) groups[key] = { positive: 0, negative: 0, total: 0 };
          
          const status = c.computedStatus;
          
          // Categorize Logic
          if (['NO_PRAZO', 'VENCE_AMANHA', 'PRIORIDADE'].includes(status || '')) {
              groups[key].positive++;
              groups[key].total++;
          } else if (['CRITICO', 'FORA_DO_PRAZO'].includes(status || '')) {
              groups[key].negative++;
              groups[key].total++;
          }
      });

      return Object.entries(groups)
          .map(([name, data]) => ({
              name,
              positive: data.positive,
              negative: data.negative,
              total: data.total,
              efficiency: data.total > 0 ? Math.round((data.positive / data.total) * 100) : 0
          }))
          .filter(d => d.total > 0)
          .sort((a, b) => {
              if (efficiencySort === 'vol') return b.total - a.total; // Biggest Volume
              if (efficiencySort === 'asc') return a.efficiency - b.efficiency; // Worst Efficiency (Offenders)
              return b.efficiency - a.efficiency; // Best Efficiency
          })
          .slice(0, 15); // LIMIT TO TOP 15 to avoid layout breaking

  }, [filteredCtes, selectedDestUnit, efficiencySort]);

  // Offending Data
  const offendersData = useMemo(() => {
     const grouped = filteredCtes.reduce<Record<string, AgencyMetric>>((acc, curr) => {
        const key = isAdmin ? (curr.coleta || 'Desconhecida') : (curr.destinatario || 'Consumidor');
        const cleanKey = key.length > 35 ? key.substring(0, 35) + '...' : key;
        
        if (!acc[key]) acc[key] = { name: cleanKey, volume: 0, value: 0 };
        acc[key].volume += 1;
        acc[key].value += curr.valor;
        return acc;
     }, {});

     const list = (Object.values(grouped) as AgencyMetric[]);
     
     if (offenderSort === 'name') {
         return list
            .sort((a, b) => offenderMetric === 'volume' ? b.volume - a.volume : b.value - a.value)
            .slice(0, 10)
            .sort((a, b) => a.name.localeCompare(b.name));
     }

     return list
        .sort((a, b) => offenderMetric === 'volume' ? b.volume - a.volume : b.value - a.value)
        .slice(0, 10); 
  }, [filteredCtes, offenderMetric, isAdmin, offenderSort]);

  const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  // Pie Chart Active Shape
  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };

  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent } = props;
    return (
      <g>
        <text x={cx} y={cy} dy={-10} textAnchor="middle" fill={fill} className="text-lg font-bold">
          {payload.name}
        </text>
        <text x={cx} y={cy} dy={20} textAnchor="middle" fill="#666" className="text-xs">
          {`${(percent * 100).toFixed(1)}%`}
        </text>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius + 5}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
        />
      </g>
    );
  };

  // Color logic for efficiency bars
  const getEfficiencyColor = (value: number) => {
      if (value >= 90) return '#10b981'; // Green
      if (value >= 70) return '#f59e0b'; // Orange
      return '#ef4444'; // Red
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20 max-w-[1800px] mx-auto">
      
      {/* Header & Main Filters */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-4 sm:p-5 rounded-3xl border border-gray-100 shadow-sm sticky top-0 z-20 backdrop-blur-md bg-white/90">
         <div>
            <h2 className="text-2xl font-bold text-gray-800 tracking-tight">Visão Geral</h2>
            <p className="text-xs text-gray-500 font-medium">Monitoramento de performance e pendências.</p>
         </div>

         <div className="flex flex-col md:flex-row gap-4 w-full lg:w-auto">
             {/* Unit Selector */}
             <div className="flex items-center gap-3 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100 w-full md:w-auto">
                <i className="ph-fill ph-map-pin text-indigo-500"></i>
                <div className="flex flex-col flex-1 md:flex-none">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Unidade Destino</span>
                  {isAdmin ? (
                    <select 
                      value={selectedDestUnit}
                      onChange={(e) => setSelectedDestUnit(e.target.value)}
                      className="bg-transparent font-bold text-gray-800 text-sm focus:outline-none cursor-pointer w-full"
                    >
                      <option value="all">Todas as Unidades</option>
                      {destinationUnits.map(unit => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-bold text-gray-800 text-sm flex items-center gap-2">
                        {currentUser?.linkedDestUnit || 'Todas'} <i className="ph-bold ph-lock-key text-gray-300 text-xs"></i>
                    </span>
                  )}
                </div>
             </div>

             {/* Payment Filter */}
             <div className="flex items-center gap-2 bg-gray-50 px-2 py-2 rounded-xl border border-gray-100 overflow-x-auto no-scrollbar w-full md:w-auto">
                {['CIF', 'FOB', 'FATURAR REMETENTE', 'FATURAR DEST'].map(type => (
                   <button
                     key={type}
                     onClick={() => toggleFilter(type, paymentFilters, setPaymentFilters)}
                     className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border whitespace-nowrap ${
                       paymentFilters.includes(type)
                       ? 'bg-primary text-white border-primary shadow-sm' 
                       : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'
                     }`}
                   >
                     {type}
                   </button>
                ))}
             </div>
         </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard 
           title="Pendências Totais" 
           value={kpis.total} 
           icon="ph-files" 
           color="text-blue-600 bg-blue-50"
           active={statusFilters.length === 0}
           onClick={() => setStatusFilters([])}
        />
        <KPICard 
           title="Valor em Risco" 
           value={formatCurrency(kpis.valorTotal)}
           icon="ph-currency-dollar" 
           color="text-green-600 bg-green-50"
        />
        <KPICard 
           title="Status Crítico" 
           value={kpis.critico} 
           icon="ph-warning-octagon" 
           color="text-red-600 bg-red-50"
           borderColor="border-red-200"
           active={statusFilters.includes('CRITICO')}
           onClick={() => toggleFilter('CRITICO', statusFilters, setStatusFilters)}
        />
        <KPICard 
           title="Em Busca / Perdido" 
           value={kpis.emBusca} 
           icon="ph-magnifying-glass" 
           color="text-purple-600 bg-purple-50"
           active={statusFilters.includes('EM_BUSCA')}
           onClick={() => toggleFilter('EM_BUSCA', statusFilters, setStatusFilters)}
        />
      </div>

      {/* MAIN ANALYTICS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Efficiency Chart - Vertical Layout */}
          <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col h-[500px]">
              <div className="mb-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4 shrink-0">
                 <div>
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <i className="ph-fill ph-ranking text-primary"></i> Ranking de Eficiência
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                        Top 15 unidades/agências baseadas na % de entregas no prazo.
                    </p>
                 </div>
                 
                 <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-xl self-start flex-wrap">
                     <button 
                         onClick={() => setEfficiencySort('asc')}
                         className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${efficiencySort === 'asc' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                         title="Mostrar piores primeiro (Ofensores)"
                     >
                         Ofensores
                     </button>
                     <button 
                         onClick={() => setEfficiencySort('desc')}
                         className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${efficiencySort === 'desc' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                         title="Mostrar melhores primeiro"
                     >
                         Melhores
                     </button>
                 </div>
              </div>

              {/* Chart Container */}
              <div className="flex-1 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        layout="vertical"
                        data={efficiencyData}
                        margin={{ top: 5, right: 30, bottom: 5, left: 0 }}
                        barSize={18}
                    >
                        <CartesianGrid stroke="#f3f4f6" horizontal={true} vertical={true} strokeDasharray="3 3" />
                        <XAxis type="number" domain={[0, 100]} hide />
                        <YAxis 
                            type="category" 
                            dataKey="name" 
                            width={140}
                            tick={{fontSize: 11, fill: '#4b5563', fontWeight: 500}}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip 
                            cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                    <div className="bg-white p-3 rounded-xl shadow-xl border border-gray-100 text-xs">
                                        <p className="font-bold text-gray-800 mb-2 border-b border-gray-100 pb-1">{data.name}</p>
                                        <div className="space-y-1">
                                            <div className="flex justify-between gap-4">
                                                <span className="text-gray-500">Eficiência:</span>
                                                <span className="font-bold" style={{color: getEfficiencyColor(data.efficiency)}}>{data.efficiency}%</span>
                                            </div>
                                            <div className="flex justify-between gap-4">
                                                <span className="text-gray-500">Volume Total:</span>
                                                <span className="font-bold text-gray-800">{data.total}</span>
                                            </div>
                                            <div className="flex justify-between gap-4">
                                                <span className="text-gray-500">No Prazo:</span>
                                                <span className="font-bold text-green-600">{data.positive}</span>
                                            </div>
                                            <div className="flex justify-between gap-4">
                                                <span className="text-gray-500">Atrasado/Crítico:</span>
                                                <span className="font-bold text-red-500">{data.negative}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                                }
                                return null;
                            }}
                        />
                        <Bar dataKey="efficiency" radius={[0, 4, 4, 0]}>
                             {efficiencyData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={getEfficiencyColor(entry.efficiency)} />
                             ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
              </div>
          </div>

          {/* Status Distribution (Donut) */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col h-[500px]">
                <div className="mb-4">
                   <h3 className="font-bold text-lg text-gray-800">Status Global</h3>
                   <p className="text-xs text-gray-500">Distribuição percentual da carteira.</p>
                </div>

                <div className="flex-1 flex items-center justify-center relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                        <Pie
                            activeIndex={activeIndex}
                            activeShape={renderActiveShape}
                            data={statusData}
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={90}
                            fill="#8884d8"
                            dataKey="value"
                            onMouseEnter={onPieEnter}
                            paddingAngle={3}
                        >
                            {statusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} stroke="none" cursor="pointer" onClick={() => toggleFilter(entry.key, statusFilters, setStatusFilters)} />
                            ))}
                        </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                
                {/* Legend for Donut */}
                <div className="grid grid-cols-2 gap-2 mt-auto">
                    {statusData.map((status) => (
                        <button
                            key={status.key}
                            onClick={() => toggleFilter(status.key, statusFilters, setStatusFilters)}
                            className={`flex items-center gap-2 p-2 rounded-lg border text-[10px] font-bold transition ${statusFilters.includes(status.key) ? 'bg-gray-100 border-gray-300' : 'bg-white border-transparent hover:bg-gray-50'}`}
                        >
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: status.color }}></span>
                            <span className="truncate text-gray-600">{status.name}</span>
                            <span className="ml-auto text-gray-400">{status.value}</span>
                        </button>
                    ))}
                </div>
          </div>
      </div>

      {/* Offenders Section */}
      <div className="bg-white p-4 sm:p-6 rounded-3xl border border-gray-100 shadow-sm">
         <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4 border-b border-gray-50 pb-4">
             <div>
                <h3 className="text-lg font-bold text-gray-800">
                    {isAdmin ? 'Agências Ofensoras' : 'Principais Clientes Ofensores'} <span className="text-gray-400 text-sm font-normal">(Top 10)</span>
                </h3>
             </div>
             
             <div className="flex gap-3 bg-gray-50 p-1 rounded-xl flex-wrap w-full xl:w-auto">
                 <div className="flex bg-white rounded-lg shadow-sm flex-1 xl:flex-none justify-center">
                    <button 
                        onClick={() => setOffenderViewMode('chart')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${offenderViewMode === 'chart' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <i className="ph-bold ph-chart-bar"></i> Gráfico
                    </button>
                    <button 
                        onClick={() => setOffenderViewMode('list')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${offenderViewMode === 'list' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <i className="ph-bold ph-list-dashes"></i> Lista
                    </button>
                 </div>
                 
                 <div className="w-px bg-gray-200 my-1 hidden xl:block"></div>

                 <div className="flex bg-white rounded-lg shadow-sm flex-1 xl:flex-none justify-center">
                    <button 
                        onClick={() => setOffenderMetric('volume')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${offenderMetric === 'volume' ? 'text-primary' : 'text-gray-400'}`}
                    >
                        Vol
                    </button>
                    <button 
                        onClick={() => setOffenderMetric('value')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${offenderMetric === 'value' ? 'text-primary' : 'text-gray-400'}`}
                    >
                        R$
                    </button>
                 </div>

                 <div className="w-px bg-gray-200 my-1 hidden xl:block"></div>
                 
                 <div className="flex bg-white rounded-lg shadow-sm flex-1 xl:flex-none justify-center">
                     <button 
                         onClick={() => setOffenderSort(offenderSort === 'metric' ? 'name' : 'metric')}
                         className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 text-gray-500 hover:text-primary ${offenderSort === 'name' ? 'text-primary bg-indigo-50' : ''}`}
                         title={offenderSort === 'name' ? "Ordenado por Nome (A-Z)" : "Ordenado por Volume/Valor (Maior-Menor)"}
                     >
                         <i className={`ph-bold ${offenderSort === 'name' ? 'ph-sort-ascending' : 'ph-sort-descending'}`}></i> 
                         {offenderSort === 'name' ? 'A-Z' : 'Top'}
                     </button>
                 </div>
             </div>
         </div>

         <div className="min-h-[350px]">
            {offenderViewMode === 'chart' ? (
                <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={offendersData} layout="vertical" margin={{ left: 0, right: 30, top: 10, bottom: 10 }}>
                        <XAxis type="number" hide />
                        <YAxis 
                            dataKey="name" 
                            type="category" 
                            width={isMobile ? 100 : 180} 
                            tick={({ x, y, payload }) => (
                                <g transform={`translate(${x},${y})`}>
                                    <text x={0} y={0} dy={4} textAnchor="end" fill="#6b7280" fontSize={isMobile ? 10 : 11} fontWeight={500}>
                                        {payload.value.length > (isMobile ? 15 : 25) ? `${payload.value.substring(0, (isMobile ? 15 : 25))}...` : payload.value}
                                    </text>
                                </g>
                            )}
                            interval={0}
                        />
                        <Tooltip 
                            cursor={{fill: '#F8F9FC'}} 
                            contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}}
                            formatter={(value: number) => [
                                offenderMetric === 'value' ? formatCurrency(value) : value, 
                                offenderMetric === 'value' ? 'Faturamento' : 'Volume'
                            ]}
                        />
                        <Bar 
                            dataKey={offenderMetric} 
                            radius={[0, 6, 6, 0]} 
                            barSize={isMobile ? 15 : 20}
                        >
                            {offendersData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={offenderMetric === 'volume' ? '#6366f1' : '#10b981'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[500px]">
                        <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase font-bold tracking-wider">
                            <tr>
                                <th className="p-3 pl-4 rounded-l-lg cursor-pointer hover:bg-gray-100" onClick={() => setOffenderSort('name')}>
                                    Nome do Cliente/Agência {offenderSort === 'name' && <i className="ph-bold ph-caret-up inline ml-1"></i>}
                                </th>
                                <th className="p-3 text-right cursor-pointer hover:bg-gray-100" onClick={() => { setOffenderMetric('volume'); setOffenderSort('metric'); }}>
                                    Volume {offenderMetric === 'volume' && offenderSort === 'metric' && <i className="ph-bold ph-caret-down inline ml-1"></i>}
                                </th>
                                <th className="p-3 text-right rounded-r-lg cursor-pointer hover:bg-gray-100" onClick={() => { setOffenderMetric('value'); setOffenderSort('metric'); }}>
                                    Faturamento {offenderMetric === 'value' && offenderSort === 'metric' && <i className="ph-bold ph-caret-down inline ml-1"></i>}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {offendersData.map((item, idx) => (
                                <tr key={idx} className="hover:bg-gray-50 transition group">
                                    <td className="p-3 pl-4 text-sm font-medium text-gray-700 group-hover:text-primary break-words max-w-[200px]">{item.name}</td>
                                    <td className="p-3 text-right font-bold text-gray-600 whitespace-nowrap">{item.volume}</td>
                                    <td className="p-3 text-right font-bold text-green-600 whitespace-nowrap">{formatCurrency(item.value)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
         </div>
      </div>
    </div>
  );
};

const KPICard = ({ title, value, icon, color, borderColor = 'border-transparent', active, onClick }: any) => (
  <div 
    onClick={onClick}
    className={`p-6 rounded-3xl border transition-all duration-300 flex flex-col justify-between h-36 relative overflow-hidden group cursor-pointer ${
      active 
      ? `bg-white border-primary ring-2 ring-primary/10 shadow-lg transform -translate-y-1` 
      : 'bg-white border-gray-100 hover:border-gray-300 hover:shadow-md'
    }`}
  >
    <div className="flex justify-between items-start z-10">
      <div>
        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">{title}</p>
        <h3 className="text-3xl font-bold text-gray-900 tracking-tight">{value}</h3>
      </div>
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${color} transition-transform group-hover:scale-110`}>
        <i className={`ph-fill ${icon} text-2xl`}></i>
      </div>
    </div>
    
    {/* Decorative background circle */}
    <div className={`absolute -bottom-4 -right-4 w-24 h-24 rounded-full opacity-10 ${color.split(' ')[0].replace('text', 'bg')}`}></div>
  </div>
);