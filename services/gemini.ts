import { GoogleGenAI } from "@google/genai";

export const generateInsights = async (kpiData: any) => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = `
      Atue como um analista de inteligência de negócios logísticos.
      Analise os seguintes dados do painel de controle de CTEs (Conhecimentos de Transporte):
      ${JSON.stringify(kpiData)}
      
      Gere um resumo curto e direto (máximo 1 parágrafo) identificando tendências preocupantes, 
      unidades com gargalos e uma recomendação de ação. 
      Foque nos itens 'CRÍTICO' e 'FORA DO PRAZO'.
      Não use formatação markdown complexa, apenas texto corrido.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Não foi possível gerar análise no momento. Verifique a chave de API.";
  }
};
