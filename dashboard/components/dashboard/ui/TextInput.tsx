// SinoMedia Dashboard — TextInput UI Primitive (Lutech Style)

import React from 'react';

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  mono?: boolean;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const TextInput: React.FC<TextInputProps> = ({
  label,
  error,
  mono = false,
  leftElement,
  rightElement,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-slate-300">
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        {leftElement && <div className="absolute left-3 text-slate-400 pointer-events-none">{leftElement}</div>}

        <input
          id={inputId}
          className={`w-full bg-slate-950/80 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-md px-3 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none transition-all ${
            mono ? 'font-mono' : ''
          } ${leftElement ? 'pl-9' : ''} ${rightElement ? 'pr-9' : ''} ${
            error ? 'border-rose-500/80 focus:border-rose-500 focus:ring-rose-500' : ''
          } ${className}`}
          {...props}
        />

        {rightElement && <div className="absolute right-3">{rightElement}</div>}
      </div>

      {error && <p className="text-[11px] text-rose-400 font-medium">{error}</p>}
    </div>
  );
};
