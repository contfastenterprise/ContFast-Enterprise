'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, BrainCircuit, CheckCircle2, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface Proposal {
  id: string;
  area: string;
  summary: string;
  justification: string;
  confidenceLevel: string;
  riskLevel: string;
  status: string;
  createdAt: string;
}

export default function ProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchProposals = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/agent/proposals');
      if (!res.ok) throw new Error('Error al cargar propuestas');
      const data = await res.json();
      setProposals(data);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProposals();
  }, []);

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      const res = await fetch('/api/v1/agent/proposals/generate', { method: 'POST' });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al generar propuesta');
      }
      toast.success('Nueva propuesta generada exitosamente');
      fetchProposals();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleAction = async (id: string, status: 'approved' | 'rejected') => {
    try {
      const res = await fetch(`/api/v1/agent/proposals/${id}/action`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('Error al actualizar propuesta');
      toast.success(`Propuesta ${status === 'approved' ? 'aprobada' : 'rechazada'}`);
      fetchProposals();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const getConfidenceColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'alta': return 'bg-green-100 text-green-800';
      case 'media': return 'bg-yellow-100 text-yellow-800';
      case 'baja': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRiskColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'bajo': return 'bg-green-100 text-green-800';
      case 'medio': return 'bg-yellow-100 text-yellow-800';
      case 'alto': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
            <BrainCircuit className="w-8 h-8 text-indigo-600" />
            Agente Empresarial (IA)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Recomendaciones automatizadas basadas en el análisis de su flujo de efectivo.
          </p>
        </div>
        <Button 
          onClick={handleGenerate} 
          disabled={generating}
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6 shadow-md transition-all active:scale-95"
        >
          {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BrainCircuit className="w-4 h-4 mr-2" />}
          Generar Análisis de Flujo
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : proposals.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <BrainCircuit className="w-12 h-12 mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900">No hay propuestas</h3>
          <p className="text-slate-500 mt-1">Genera un análisis para comenzar a recibir recomendaciones.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {proposals.map(proposal => (
            <Card key={proposal.id} className="flex flex-col hover:shadow-lg transition-shadow border-slate-200 bg-white/50 backdrop-blur-sm">
              <CardHeader className="pb-3 border-b border-slate-100 bg-white rounded-t-xl">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant="outline" className="capitalize border-indigo-200 text-indigo-700 bg-indigo-50">
                    {proposal.area.replace('_', ' ')}
                  </Badge>
                  <span className="text-xs text-slate-400 font-medium">
                    {formatDistanceToNow(new Date(proposal.createdAt), { addSuffix: true, locale: es })}
                  </span>
                </div>
                <CardTitle className="text-lg leading-tight text-slate-800">{proposal.summary}</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 flex-1">
                <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                  {proposal.justification}
                </p>
                <div className="flex gap-2 text-xs font-semibold mt-auto">
                  <span className={`px-2 py-1 rounded-md ${getConfidenceColor(proposal.confidenceLevel)}`}>
                    Confianza: <span className="capitalize">{proposal.confidenceLevel}</span>
                  </span>
                  <span className={`px-2 py-1 rounded-md ${getRiskColor(proposal.riskLevel)}`}>
                    Riesgo: <span className="capitalize">{proposal.riskLevel}</span>
                  </span>
                </div>
              </CardContent>
              <CardFooter className="pt-4 border-t border-slate-100 bg-white rounded-b-xl flex gap-2">
                {proposal.status === 'pending' ? (
                  <>
                    <Button 
                      variant="outline" 
                      className="flex-1 text-green-700 border-green-200 hover:bg-green-50"
                      onClick={() => handleAction(proposal.id, 'approved')}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" /> Aprobar
                    </Button>
                    <Button 
                      variant="outline" 
                      className="flex-1 text-red-700 border-red-200 hover:bg-red-50"
                      onClick={() => handleAction(proposal.id, 'rejected')}
                    >
                      <XCircle className="w-4 h-4 mr-2" /> Rechazar
                    </Button>
                  </>
                ) : (
                  <div className={`w-full text-center py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 ${
                    proposal.status === 'approved' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    {proposal.status === 'approved' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    {proposal.status === 'approved' ? 'Propuesta Aprobada' : 'Propuesta Rechazada'}
                  </div>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
