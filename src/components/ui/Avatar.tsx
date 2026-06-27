'use client';

import React from 'react';
import Image from 'next/image';
import clsx from 'clsx';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}

export function Avatar({ src, name, size = 40, className }: AvatarProps) {
  // Obtener iniciales
  const getInitials = (fullName: string) => {
    const parts = (fullName || '').trim().split(/\s+/);
    if (parts.length === 0 || !parts[0]) return 'U';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  const initials = getInitials(name);

  const finalSrc = src || null;

  return (
    <div
      className={clsx(
        "relative rounded-full flex items-center justify-center overflow-hidden shrink-0 select-none bg-primary/10 text-primary border border-primary/20",
        className
      )}
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-label={`Avatar de ${name}`}
    >
      {finalSrc ? (
        <Image
          src={finalSrc}
          alt={`Avatar de ${name}`}
          fill
          sizes={`${size}px`}
          className="object-cover"
          priority
          unoptimized // Supabase URLs optimizadas pueden no requerir optimización de Next.js
        />
      ) : (
        <span
          className="font-bold text-center leading-none text-primary"
          style={{ fontSize: `${Math.max(10, size * 0.38)}px` }}
        >
          {initials}
        </span>
      )}
    </div>
  );
}
export default Avatar;
