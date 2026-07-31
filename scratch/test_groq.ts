import * as dotenv from 'dotenv';
dotenv.config();

import Groq from "groq-sdk";

async function main() {
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  
  try {
    console.log("Probando conexión a Groq...");
    const response = await client.chat.completions.create({
      messages: [{ role: "user", content: "Hola, ¿estás funcionando?" }],
      model: "llama-3.3-70b-versatile",
      max_tokens: 10
    });
    console.log("¡Éxito! Groq respondió:", response.choices[0].message?.content);
  } catch (error: any) {
    console.error("Error conectando a Groq:");
    if (error.response) {
      console.error(error.response.status, error.response.data);
    } else {
      console.error(error);
    }
  }
}

main().catch(console.error);
