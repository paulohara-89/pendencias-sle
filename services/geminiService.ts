import { GoogleGenAI } from "@google/genai";
import { KPIData } from "../types";

// Note: In a real environment, this key should be in process.env.API_KEY
// We will check for it, or gracefully fail if not present.
const API_KEY = process.env.API_KEY || '';

export const generateInsights = async (kpiData: KPIData): Promise<string> => {
  if (!API_KEY) {
    return "Chave de API do Gemini não configurada. Por favor, adicione a chave API_KEY ao ambiente.";
  }

  try {
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    
    const prompt = `
      Analise os seguintes dados de logística da São Luiz Express e forneça 3 insights curtos e acionáveis sobre pendências e faturamento.
      Total CTEs: ${kpiData.total}
      Valor Total: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(kpiData.totalValue)}
      Por Status: ${JSON.stringify(kpiData.byStatus)}
      Por Tipo: ${JSON.stringify(kpiData.byType)}
      
      Responda em texto corrido, objetivo, sem markdown excessivo.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp', // Using a fast model
      contents: prompt,
    });

    return response.text || "Não foi possível gerar insights no momento.";
  } catch (error) {
    console.error("Erro ao chamar Gemini:", error);
    return "Erro ao gerar análise de IA. Verifique a conexão.";
  }
};