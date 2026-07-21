'use client';

import React from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import clsx from 'clsx';

interface PageLoaderProps {
  logoUrl?: string | null;
  companyName?: string | null;
  message?: string;
  fullScreen?: boolean;
  className?: string;
}

export function PageLoader({
  logoUrl,
  companyName,
  message = 'Inicializando el sistema...',
  fullScreen = true,
  className,
}: PageLoaderProps) {
  // If no logoUrl is passed, render simple fallback or minimal container
  if (!logoUrl) return null;

  const isRemoteUrl = logoUrl.startsWith('http://') || logoUrl.startsWith('https://');

  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-all duration-300 select-none overflow-hidden',
        fullScreen ? 'fixed inset-0 z-50' : 'w-full h-full min-h-[300px]',
        className
      )}
    >
      {/* Background Soft Glow with Corporate Colors (#003366 & #C59B27) */}
      <div className="absolute w-72 h-72 rounded-full bg-gradient-to-tr from-[#003366]/10 via-amber-500/5 to-[#C59B27]/15 blur-3xl pointer-events-none animate-pulse" />

      {/* Main Content Container */}
      <div className="relative z-10 flex flex-col items-center space-y-6 max-w-xs text-center px-4">
        {/* Animated Logo Container with Gentle Breathing Effect (scale 0.98 - 1.02) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{
            opacity: 1,
            scale: [0.98, 1.02, 0.98],
          }}
          transition={{
            opacity: { duration: 0.4 },
            scale: {
              duration: 2.2,
              repeat: Infinity,
              ease: 'easeInOut',
            },
          }}
          className="relative flex items-center justify-center p-3 rounded-2xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200/60 dark:border-slate-800 ring-1 ring-[#003366]/10"
        >
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center overflow-hidden rounded-xl">
            <Image
              src={logoUrl}
              alt={companyName || 'Logo de la Empresa'}
              width={112}
              height={112}
              priority
              unoptimized={isRemoteUrl || logoUrl.startsWith('data:')}
              className="object-contain w-full h-full p-1"
            />
          </div>
        </motion.div>

        {/* Company Name & Status Message */}
        <div className="space-y-1">
          {companyName && (
            <motion.h3
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="text-base font-semibold text-[#003366] dark:text-slate-100 tracking-tight"
            >
              {companyName}
            </motion.h3>
          )}
          <motion.p
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="text-xs text-slate-500 dark:text-slate-400 font-medium"
          >
            {message}
          </motion.p>
        </div>

        {/* Bottom Indicator: Corporate Color Bounce Dots & Shimmer Bar */}
        <div className="flex flex-col items-center space-y-3 pt-2">
          {/* Subtle Progress Bar with Navy (#003366) and Gold (#C59B27) */}
          <div className="w-36 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden relative">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#003366] via-[#C59B27] to-[#003366]"
              animate={{
                x: ['-100%', '100%'],
              }}
              transition={{
                repeat: Infinity,
                duration: 1.6,
                ease: 'easeInOut',
              }}
            />
          </div>

          {/* Corporate Bounce Dots */}
          <div className="flex items-center space-x-2">
            <motion.span
              className="w-2 h-2 rounded-full bg-[#003366]"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay: 0 }}
            />
            <motion.span
              className="w-2 h-2 rounded-full bg-[#C59B27]"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
            />
            <motion.span
              className="w-2 h-2 rounded-full bg-[#003366]"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default PageLoader;
