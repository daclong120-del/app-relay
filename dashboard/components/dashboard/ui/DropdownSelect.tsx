// SinoMedia Dashboard — Custom Glassmorphic DropdownSelect UI Primitive (Lutech Style)
// Replaces native HTML <select> completely across dashboard components.

import React, { useState, useRef, useEffect } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

export interface DropdownSelectProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export const DropdownSelect: React.FC<DropdownSelectProps> = ({
  options,
  value,
  onChange,
  label,
  placeholder = 'Select option...',
  disabled = false,
  className = '',
  size = 'md',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setIsOpen(false);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!disabled) setIsOpen(!isOpen);
    }
  };

  const sizeClasses = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-2 text-xs';

  return (
    <div className={`relative w-full space-y-1.5 ${className}`} ref={containerRef}>
      {label && <label className="block text-xs font-semibold text-slate-300">{label}</label>}

      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`w-full bg-slate-950/90 border border-slate-800 hover:border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg ${sizeClasses} text-slate-100 flex items-center justify-between transition-all duration-150 active:scale-[0.98] ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedOption?.icon}
          <span>{selectedOption ? selectedOption.label : placeholder}</span>
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-slate-900/95 border border-slate-700/80 rounded-lg shadow-2xl backdrop-blur-md max-h-60 overflow-y-auto p-1 animate-in fade-in-50 zoom-in-95 duration-100">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <div
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`px-3 py-2 rounded-md text-xs font-medium cursor-pointer flex items-center justify-between transition-colors ${
                  isSelected
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                    : 'text-slate-200 hover:bg-slate-800/80'
                }`}
              >
                <span className="flex items-center gap-2">
                  {option.icon}
                  <span>{option.label}</span>
                </span>
                {isSelected && (
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
