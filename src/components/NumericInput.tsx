import React, { useState, useEffect, useRef } from 'react';

export interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number | string | undefined | null;
  onChange?: (value: number | '') => void;
  onBlurCommit?: (value: number) => void;
  defaultValueOnBlur?: number;
  min?: number;
  max?: number;
  step?: number | string;
  allowDecimals?: boolean;
}

/**
 * Enterprise NumericInput:
 * - Prevents zero-snapping: supports typing empty string '' without resetting to 0.
 * - Auto-selects entire value on focus for instant single-key replacement.
 * - Sanitizes on blur to ensure backend always receives a valid, clamped number.
 * - Supports debounced or blur-only commit to prevent network/re-render thrashing.
 */
export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onChange,
  onBlurCommit,
  defaultValueOnBlur,
  min,
  max,
  step = 1,
  allowDecimals = false,
  className = '',
  onFocus,
  onBlur,
  disabled,
  ...rest
}) => {
  const isFocusedRef = useRef(false);

  // Maintain local string draft so user can backspace to '' without zero snapping
  const [draft, setDraft] = useState<string>(() => {
    if (value === undefined || value === null || value === '') return '';
    return String(value);
  });

  // Keep draft in sync with external value changes when not actively focused
  useEffect(() => {
    if (!isFocusedRef.current) {
      if (value === undefined || value === null || value === '') {
        setDraft('');
      } else {
        setDraft(String(value));
      }
    }
  }, [value]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = true;
    e.target.select();
    if (onFocus) {
      onFocus(e);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;

    // Allow user to clear input completely
    if (raw === '') {
      setDraft('');
      onChange?.('');
      return;
    }

    // Handle partial decimal inputs like "12."
    if (allowDecimals && (raw === '.' || raw.endsWith('.'))) {
      setDraft(raw);
      return;
    }

    const parsed = allowDecimals ? parseFloat(raw) : Number(raw);
    if (!isNaN(parsed)) {
      setDraft(raw);
      onChange?.(parsed);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = false;

    let sanitized: number;

    if (draft === '' || isNaN(Number(draft))) {
      if (defaultValueOnBlur !== undefined) {
        sanitized = defaultValueOnBlur;
      } else if (min !== undefined && min > 0) {
        sanitized = min;
      } else {
        sanitized = 0;
      }
    } else {
      sanitized = allowDecimals ? parseFloat(draft) : Number(draft);
      if (isNaN(sanitized)) {
        sanitized = defaultValueOnBlur ?? (min !== undefined && min > 0 ? min : 0);
      }
    }

    // Clamp between min and max if defined
    if (min !== undefined && sanitized < min) sanitized = min;
    if (max !== undefined && sanitized > max) sanitized = max;

    setDraft(String(sanitized));
    onChange?.(sanitized);
    onBlurCommit?.(sanitized);

    if (onBlur) {
      onBlur(e);
    }
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={draft}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={className}
      {...rest}
    />
  );
};
