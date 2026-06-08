'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import {
  Building2, Plus, Edit2, Trash2, ArrowLeft, RefreshCw,
  Search, Check, AlertTriangle, Loader2, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'sonner';

interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  currency: string;
  type: string;
  balance: string;
  status: string;
}

export default function BankAccountsPage() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  
  // Form State
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [type, setType] = useState('corriente');
  const [currency, setCurrency] = useState('DOP');
  const [balance, setBalance] = useState('0');
  const [submitting, setSubmitting] = useState(false);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/bank/accounts');
      const data = await res.json();
      if (data.success) {
        setAccounts(data.data || []);
      } else {
        throw new Error(data.error?.message || 'Error al obtener cuentas');
      }
    } catch (error: any) {
      toast.error('Error', { description: error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const openAddModal = () => {
    setEditingAccount(null);
    setBankName('');
    setAccountNumber('');
    setType('corriente');
    setCurrency('DOP');
    setBalance('0');
    setShowModal(true);
  };

  const openEditModal = (account: BankAccount) => {
    setEditingAccount(account);
    setBankName(account.bankName);
    setAccountNumber(account.accountNumber);
    setType(account.type);
    setCurrency(account.currency);
    setBalance(account.balance);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const method = editingAccount ? 'PUT' : 'POST';
      const url = editingAccount 
        ? `/api/v1/bank/accounts/${editingAccount.id}`
        : '/api/v1/bank/accounts';

      const body = {
        bankName,
        accountNumber,
        type,
        currency,
        balance: parseFloat(balance),
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Error al guardar cuenta bancaria');
      }

      toast.success(editingAccount ? 'Cuenta actualizada' : 'Cuenta registrada');
      setShowModal(false);
      fetchAccounts();
    } catch (error: any) {
      toast.error('Error de guardado', { description: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de que desea eliminar esta cuenta bancaria?')) return;

    try {
      const res = await fetch(`/api/v1/bank/accounts/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Cuenta bancaria eliminada');
        fetchAccounts();
      } else {
        throw new Error(data.error?.message || 'Error al eliminar');
      }
    } catch (error: any) {
      toast.error('Error al eliminar', { description: error.message });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Toaster position="top-right" richColors />
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-900 pb-5">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-white flex items-center gap-2">
              <Building2 className="h-7 w-7 text-amber-500" />
              Gestión de Bancos y Cuentas
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Administre las cuentas bancarias de su empresa y controle sus balances.
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/5"
          >
            <Plus className="h-4 w-4" />
            Nueva Cuenta Bancaria
          </button>
        </div>

        {/* Bank List View */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/40 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-4 px-6">Banco</th>
                  <th className="py-4 px-6">Número de Cuenta</th>
                  <th className="py-4 px-6">Tipo</th>
                  <th className="py-4 px-6">Moneda</th>
                  <th className="py-4 px-6 text-right">Balance</th>
                  <th className="py-4 px-6 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="h-5 w-5 animate-spin text-amber-500" />
                        <span className="text-slate-400 text-sm">Cargando cuentas bancarias...</span>
                      </div>
                    </td>
                  </tr>
                ) : accounts.length > 0 ? (
                  accounts.map((acc) => (
                    <tr key={acc.id} className="hover:bg-slate-950/20 transition-colors">
                      <td className="py-4 px-6 font-semibold text-white">{acc.bankName}</td>
                      <td className="py-4 px-6 font-mono">{acc.accountNumber}</td>
                      <td className="py-4 px-6 capitalize">{acc.type}</td>
                      <td className="py-4 px-6">{acc.currency}</td>
                      <td className="py-4 px-6 text-right font-semibold text-white">
                        {parseFloat(acc.balance).toLocaleString('es-DO', { style: 'currency', currency: acc.currency })}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <div className="flex items-center justify-center gap-3">
                          <button
                            onClick={() => openEditModal(acc)}
                            className="text-amber-500 hover:text-amber-400"
                            title="Editar"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(acc.id)}
                            className="text-rose-500 hover:text-rose-400"
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      No hay cuentas bancarias registradas en la empresa.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal structure */}
        <AnimatePresence>
          {showModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowModal(false)}
                className="fixed inset-0 bg-black"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-md w-full shadow-2xl z-10 text-slate-300"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                  <h3 className="text-base font-semibold text-white uppercase tracking-wider">
                    {editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta Bancaria'}
                  </h3>
                  <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleSave} className="space-y-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-300 uppercase">Nombre del Banco</label>
                    <input
                      type="text"
                      required
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      placeholder="Banco Popular / Banreservas"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-300 uppercase">Número de Cuenta</label>
                    <input
                      type="text"
                      required
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm font-mono"
                      placeholder="789012345"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-300 uppercase">Tipo de Cuenta</label>
                      <select
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                        className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      >
                        <option value="corriente">Corriente</option>
                        <option value="ahorros">Ahorros</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-300 uppercase">Moneda</label>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      >
                        <option value="DOP">DOP - Peso Dom.</option>
                        <option value="USD">USD - Dólar</option>
                        <option value="EUR">EUR - Euro</option>
                      </select>
                    </div>
                  </div>

                  {!editingAccount && (
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-300 uppercase">Balance Inicial</label>
                      <input
                        type="number"
                        step="any"
                        value={balance}
                        onChange={(e) => setBalance(e.target.value)}
                        className="block w-full rounded-md border-0 bg-slate-950 py-2.5 px-3 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm font-mono"
                      />
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="rounded border border-slate-800 bg-slate-950 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-900"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex items-center gap-1.5 rounded bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                    >
                      {submitting ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Check className="h-4.5 w-4.5" />}
                      Guardar Cuenta
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}
