import type { AIProvider, ChatMessage, ChatOptions, ChatResponse } from "../contracts/Provider";
import * as fs from 'fs';

export interface GroqProviderConfig {
  readonly apiKey: string;
  readonly defaultModel?: string;
}

export class GroqProvider implements AIProvider {
  private readonly apiKey: string;
  private readonly defaultModel: string;

  constructor(config: GroqProviderConfig) {
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel ?? "llama-3.1-8b-instant"; // Modelo más ligero para evitar límites de tokens
  }

  public async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const requestBody: any = {
      messages: messages as any,
      model: options?.model ?? this.defaultModel,
      max_tokens: 1024,
    };

    if (options?.tools && options.tools.length > 0) {
      requestBody.tools = options.tools;
      requestBody.tool_choice = "auto";
    }

    try {
      const fetchResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!fetchResponse.ok) {
        throw new Error(`Groq API Error: ${fetchResponse.status} ${fetchResponse.statusText} - ${await fetchResponse.text()}`);
      }

      const response = await fetchResponse.json();
      const choice = response.choices?.[0]?.message;
      let content = choice?.content ?? null;
      let tool_calls: any = choice?.tool_calls ?? [];

      // Fallback: If the model hallucinates a raw text function call (common in smaller models)
      if (content && typeof content === 'string') {
        const fnMatch = content.match(/<function=([^>]+)>(.*?)<\/function>/i) || content.match(/function=([^>]+)>(.*?)</i);
        if (fnMatch) {
          const fnName = fnMatch[1];
          const fnArgsStr = fnMatch[2];
          try {
            const fnArgs = JSON.parse(fnArgsStr);
            tool_calls.push({
              id: `call_${Date.now()}`,
              type: 'function',
              function: {
                name: fnName,
                arguments: JSON.stringify(fnArgs)
              }
            });
            content = null; // Clear content so it processes the tool call
          } catch (e) {
            console.warn("Failed to parse hallucinated function args:", fnArgsStr);
          }
        }
      }

      return {
        content: content,
        tool_calls: tool_calls.length > 0 ? tool_calls : undefined
      };
    } catch (error: any) {
      console.error("[Groq API Error]:", error);
      try {
        fs.writeFileSync(
          'scratch/groq_error.json', 
          JSON.stringify({
            name: error.name,
            message: error.message,
            status: error.status,
            errorObj: error.error,
            requestMessages: requestBody.messages
          }, null, 2)
        );
      } catch (e) {}
      throw error;
    }
  }

  public async embeddings(input: string): Promise<unknown> {
    throw new Error("Embeddings no están soportados nativamente en GroqProvider por el momento.");
  }

  public async completion(prompt: string): Promise<unknown> {
    const fetchResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
        model: this.defaultModel,
      })
    });
    
    if (!fetchResponse.ok) {
      throw new Error(`Groq API Error: ${fetchResponse.status} ${fetchResponse.statusText}`);
    }

    const response = await fetchResponse.json();
    return response.choices?.[0]?.message?.content ?? "";
  }
}

