import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'danger-outline'
  | 'success';

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  touchTarget?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'sm',
      isLoading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      touchTarget = false,
      className = '',
      type = 'button',
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-lg whitespace-nowrap shrink-0 transition-all duration-150 select-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950';

    const sizeStyles: Record<ButtonSize, string> = {
      xs: 'px-2 py-1 text-xs gap-1.5 rounded-md',
      sm: 'px-2.5 py-1.5 text-xs gap-2',
      md: 'px-3.5 py-2 text-sm gap-2',
      lg: 'px-4 py-2.5 text-base gap-2.5',
    };

    const variantStyles: Record<ButtonVariant, string> = {
      primary:
        'bg-brand-600 hover:bg-brand-500 active:bg-brand-700 text-white border border-transparent shadow-sm',
      secondary:
        'bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-slate-200 border border-slate-700 shadow-sm hover:border-slate-600',
      outline:
        'bg-transparent hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700',
      ghost:
        'bg-transparent hover:bg-slate-800 text-slate-300 hover:text-white border-transparent',
      danger:
        'bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white border border-transparent shadow-sm',
      'danger-outline':
        'bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800',
      success:
        'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white border border-transparent shadow-sm',
    };

    const touchStyles = touchTarget ? 'min-h-[44px] min-w-[44px]' : '';

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${touchStyles} ${className}`}
        {...props}
      >
        {isLoading && (
          <Loader2
            className="animate-spin shrink-0"
            size={size === 'xs' ? 12 : size === 'lg' ? 18 : 14}
          />
        )}
        {!isLoading && leftIcon && <span className="shrink-0">{leftIcon}</span>}
        {children && <span className="whitespace-nowrap">{children}</span>}
        {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
