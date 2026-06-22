import React, { ButtonHTMLAttributes, forwardRef } from 'react';
import { BorderRotate } from './animated-gradient-border';
import { cn } from '@/utils/cn';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'warning';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg' | 'icon';
  animated?: boolean;
  animationMode?: 'auto-rotate' | 'rotate-on-hover' | 'stop-rotate-on-hover';
  animationSpeed?: number;
  gradientColors?: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

const defaultColors: Record<ButtonVariant, { primary: string; secondary: string; accent: string; bg: string; text: string }> = {
  primary: {
    primary: '#003366',
    secondary: '#C5A059',
    accent: '#3b6998',
    bg: '#003366',
    text: 'text-white'
  },
  secondary: {
    primary: '#003366',
    secondary: '#C5A059',
    accent: '#e2d1b0',
    bg: '#C5A059',
    text: 'text-slate-950'
  },
  outline: {
    primary: '#cbd5e1',
    secondary: '#94a3b8',
    accent: '#64748b',
    bg: '#ffffff',
    text: 'text-slate-700 hover:bg-slate-50'
  },
  ghost: {
    primary: '#cbd5e1',
    secondary: '#94a3b8',
    accent: '#64748b',
    bg: 'transparent',
    text: 'text-slate-700 hover:bg-slate-100'
  },
  danger: {
    primary: '#dc2626',
    secondary: '#f87171',
    accent: '#fbcfe8',
    bg: '#fdf2f8',
    text: 'text-pink-700 hover:bg-pink-100/50'
  },
  success: {
    primary: '#16a34a',
    secondary: '#4ade80',
    accent: '#bbf7d0',
    bg: '#f0fdf4',
    text: 'text-green-700 hover:bg-green-100/50'
  },
  warning: {
    primary: '#ca8a04',
    secondary: '#facc15',
    accent: '#fef9c3',
    bg: '#fefce8',
    text: 'text-yellow-700 hover:bg-yellow-100/50'
  }
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      children,
      variant = 'primary',
      size = 'md',
      animated = false,
      animationMode = 'auto-rotate',
      animationSpeed = 5,
      gradientColors,
      disabled,
      ...props
    },
    ref
  ) => {
    const colors = defaultColors[variant];
    const borderColors = gradientColors || {
      primary: colors.primary,
      secondary: colors.secondary,
      accent: colors.accent
    };

    // Parse border radius based on size
    const getBorderRadius = () => {
      if (size === 'sm' || size === 'icon') return 8;
      if (size === 'lg') return 16;
      return 12; // md is default
    };

    const sizeClasses = {
      sm: 'px-3 py-1.5 text-xs rounded-lg',
      md: 'px-6 py-2.5 text-sm rounded-xl',
      lg: 'px-8 py-3 text-base rounded-2xl',
      icon: 'p-2 rounded-lg'
    };

    const buttonElement = (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center font-bold transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed',
          sizeClasses[size],
          animated ? 'w-full h-full bg-transparent border-0' : `${colors.text} border`,
          !animated && variant === 'primary' && 'bg-[#003366] hover:bg-[#002244] border-transparent text-white',
          !animated && variant === 'secondary' && 'bg-[#C5A059] hover:bg-[#b08c4a] border-transparent text-slate-950',
          !animated && variant === 'outline' && 'bg-white border-slate-300',
          !animated && variant === 'ghost' && 'bg-transparent border-transparent',
          !animated && variant === 'danger' && 'bg-pink-50 border-pink-200',
          !animated && variant === 'success' && 'bg-green-50 border-green-200',
          !animated && variant === 'warning' && 'bg-yellow-50 border-yellow-200',
          className
        )}
        {...props}
      >
        {children}
      </button>
    );

    if (animated) {
      return (
        <BorderRotate
          animationMode={animationMode}
          animationSpeed={animationSpeed}
          gradientColors={borderColors}
          backgroundColor={colors.bg}
          borderRadius={getBorderRadius()}
          className={cn(
            'inline-flex items-center justify-center p-0',
            size === 'sm' && 'rounded-lg',
            size === 'md' && 'rounded-xl',
            size === 'lg' && 'rounded-2xl',
            size === 'icon' && 'rounded-lg',
            disabled && 'opacity-50 pointer-events-none',
            className
          )}
        >
          {buttonElement}
        </BorderRotate>
      );
    }

    return buttonElement;
  }
);

Button.displayName = 'Button';

export { Button };
