export interface CTE {
  id: string; // Combined SERIE-CTE
  cte: string;
  serie: string;
  codigo: string;
  dataEmissao: string;
  prazoBaixa: number;
  dataLimite: string;
  status: string;
  coleta: string;
  entrega: string;
  valor: number;
  txEntrega: number;
  volumes: number;
  peso: number;
  fretePago: string; // Tipo Pagamento
  destinatario: string;
  justificativa: string;
  computedStatus?: 'NO_PRAZO' | 'VENCE_AMANHA' | 'PRIORIDADE' | 'FORA_DO_PRAZO' | 'CRITICO';
}

export interface User {
  username: string;
  password?: string;
  role: string;
  linkedOriginUnit: string;
  linkedDestUnit: string;
}

export interface Profile {
  name: string;
  description: string;
  permissions: string; // JSON string
}

export interface Note {
  id: string | number; // Changed to support UUIDs from Google Sheets
  cteId: string; // SERIE-CTE
  date: string;
  user: string;
  text: string;
  imageUrl?: string;
  statusBusca: boolean;
}

export interface ConfigData {
  dataHoje: string;
  dataAmanha: string;
  prazoLimiteCritico: number;
  holidays: string[];
}

export enum PaymentType {
  FOB = 'FOB',
  CIF = 'CIF',
  FATURAR_REMETENTE = 'FATURAR_REMETENTE',
  FATURAR_DEST = 'FATURAR_DEST',
}

export interface AppState {
  ctes: CTE[];
  users: User[];
  notes: Note[];
  profiles: Profile[];
  config: ConfigData;
  loading: boolean;
  error: string | null;
  currentUser: User | null;
}