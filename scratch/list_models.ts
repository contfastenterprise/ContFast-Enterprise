import * as dotenv from 'dotenv';
dotenv.config();
import Groq from "groq-sdk";

async function main() {
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  try {
    const models = await client.models.list();
    console.log("Modelos disponibles:");
    models.data.forEach(m => console.log(m.id));
  } catch (error) {
    console.error(error);
  }
}

main();
