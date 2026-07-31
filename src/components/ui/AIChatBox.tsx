'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function AIChatBox() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '¡Hola! Soy Shiky, tu IA y Co-piloto de ContFast Enterprise. Conozco tu base de datos y negocio. ¿En qué te puedo ayudar hoy?',
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [companyName, setCompanyName] = useState<string>('Nombre de la empresa');
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
    fetch('/api/v1/company/settings')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data?.companyName) {
          setCompanyName(data.data.companyName);
        }
      })
      .catch(console.error);
  }, []);

  // Auto-scroll al último mensaje
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          input: userMsg.content,
          history: messages.map(m => ({ role: m.role, content: m.content }))
        }),
      });

      const data = await res.json();
      
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.success ? data.content : `Error: ${data.error}`,
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, botMsg]);
    } catch (error) {
      setMessages((prev) => [
        ...prev, 
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Lo siento, ha ocurrido un error de conexión.',
          timestamp: new Date(),
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[70vh] min-h-[500px] max-h-[800px] w-full max-w-5xl mx-auto rounded-3xl overflow-hidden border border-slate-200/80 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      
      {/* Header */}
      <div className="relative p-6 border-b border-slate-100 bg-slate-50/50">
        <div className="relative flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-md shadow-violet-500/10">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                AI Core Engine
              </h2>
              <p className="text-xs text-slate-500 font-medium tracking-wider uppercase">Conectado a "{companyName}"</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-semibold text-emerald-600">Online</span>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/20 scrollbar-thin scrollbar-thumb-slate-200">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className={cn(
                "flex gap-4 max-w-[85%]",
                msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
              )}
            >
              {/* Avatar */}
              <div className={cn(
                "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-sm",
                msg.role === 'assistant' 
                  ? "bg-gradient-to-br from-violet-500 to-indigo-500 border border-violet-200"
                  : "bg-slate-100 border border-slate-200"
              )}>
                {msg.role === 'assistant' ? <Bot className="w-5 h-5 text-white" /> : <User className="w-5 h-5 text-slate-600" />}
              </div>

              {/* Bubble */}
              <div className={cn(
                "p-4 rounded-2xl relative group",
                msg.role === 'assistant'
                  ? "bg-white border border-slate-150 text-slate-800 rounded-tl-none shadow-sm hover:bg-slate-50/30 transition-colors"
                  : "bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-tr-none shadow-sm"
              )}>
                <div className="whitespace-pre-wrap leading-relaxed text-sm font-medium">
                  {msg.content}
                </div>
                <span className={cn(
                  "text-[10px] mt-2 block opacity-60",
                  msg.role === 'assistant' ? "text-slate-500" : "text-violet-100 text-right"
                )}>
                  {isMounted ? msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-4 max-w-[85%]"
          >
             <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-indigo-500 border border-violet-200 shadow-sm">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="p-4 rounded-2xl bg-white border border-slate-150 rounded-tl-none flex items-center gap-3 shadow-sm">
                <Loader2 className="w-5 h-5 text-violet-500 animate-spin" />
                <span className="text-sm font-medium text-slate-500 animate-pulse">Procesando...</span>
              </div>
          </motion.div>
        )}
        <div ref={endOfMessagesRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-slate-100">
        <form onSubmit={handleSubmit} className="relative flex items-center max-w-4xl mx-auto">
          <div className="relative w-full flex items-center bg-slate-50/60 hover:bg-slate-50/80 focus-within:bg-white border border-slate-200 focus-within:border-violet-500/50 focus-within:ring-4 focus-within:ring-violet-500/10 rounded-[28px] transition-all duration-200 shadow-sm">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              placeholder="Pregúntale a tu IA sobre inventario, ventas, o solicita auditorías..."
              className="w-full bg-transparent text-slate-800 placeholder:text-slate-400 rounded-[28px] pl-6 pr-16 py-4 focus:outline-none font-medium text-sm"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-2 p-2.5 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-md hover:shadow-violet-500/15 transition-all transform hover:scale-105 active:scale-95"
            >
              <Send className="w-5 h-5 ml-[2px]" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
