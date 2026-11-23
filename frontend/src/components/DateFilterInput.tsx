import { useEffect, useRef, useState, type KeyboardEvent, type ChangeEvent, type FocusEvent } from 'react';
import { Calendar, X } from 'lucide-react';

interface DateFilterInputProps {
  /**
   * The currently active ISO date filter string (YYYY-MM-DD), or empty string when no filter is active.
   */
  value: string;
  /**
   * Callback fired when a complete, valid date is entered or when the filter is cleared.
   */
  onChange: (date: string) => void;
  /**
   * Whether to show the individual clear button next to the input. Defaults to true.
   */
  showClearButton?: boolean;
  /**
   * Optional placeholder labels for the segments.
   */
  placeholder?: { day?: string; month?: string; year?: string };
  /**
   * Accessible title or label for the input group.
   */
  title?: string;
}

/**
 * Segmented date filter input allowing independent entry, editing, and deletion of Day, Month, and Year.
 * Strictly enforces 2-digit constraints for Day and Month without race conditions or overwriting digits.
 * Allows typing both 1-digit and 2-digit numbers smoothly.
 */
export function DateFilterInput({
  value,
  onChange,
  showClearButton = true,
  placeholder = { day: 'DD', month: 'MM', year: 'YYYY' },
  title = 'Date input'
}: DateFilterInputProps) {
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');

  // Refs holding the latest values synchronously to avoid stale closure issues during focus/blur
  const dayValRef = useRef(day);
  const monthValRef = useRef(month);
  const yearValRef = useRef(year);

  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const nativePickerRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<number | null>(null);

  // Synchronize internal segment states when external value changes
  useEffect(() => {
    if (!value) {
      setDay('');
      setMonth('');
      setYear('');
      dayValRef.current = '';
      monthValRef.current = '';
      yearValRef.current = '';
    } else {
      const parts = value.split('-');
      if (parts.length === 3) {
        const [y, m, d] = parts;
        setYear(y);
        setMonth(m);
        setDay(d);
        yearValRef.current = y;
        monthValRef.current = m;
        dayValRef.current = d;
      }
    }
  }, [value]);

  /**
   * Evaluates if current segments form a complete and valid calendar date.
   */
  const evaluateAndTrigger = (d: string, m: string, y: string) => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // If all segments are empty and a filter was previously active, clear it.
    if (!d && !m && !y) {
      if (value !== '') {
        onChange('');
      }
      return;
    }

    // STRICT 2-DIGIT CONSTRAINT: Day must be 2 digits, Month must be 2 digits, Year must be 4 digits
    if (d.length === 2 && m.length === 2 && y.length === 4) {
      const numD = parseInt(d, 10);
      const numM = parseInt(m, 10);
      const numY = parseInt(y, 10);

      // '00' is invalid for both day and month (must be >= 1)
      if (numY >= 1900 && numY <= 2100 && numM >= 1 && numM <= 12 && numD >= 1 && numD <= 31) {
        const dateObj = new Date(numY, numM - 1, numD);
        if (
          dateObj.getFullYear() === numY &&
          dateObj.getMonth() === numM - 1 &&
          dateObj.getDate() === numD
        ) {
          const formatted = `${y}-${m}-${d}`;
          if (formatted !== value) {
            debounceTimerRef.current = window.setTimeout(() => {
              onChange(formatted);
            }, 300);
          }
        }
      }
    }
  };

  /**
   * Cleans input for Day/Month segments:
   * Handles re-typing when a field already had 2 digits, preventing accidental concatenation.
   */
  const cleanSegmentInput = (prevVal: string, rawInput: string): string => {
    const digits = rawInput.replace(/\D/g, '');

    // If input previously had 2 digits and user typed a third digit without clearing:
    if (prevVal.length === 2 && digits.length > 2) {
      // If user typed at the end, take the newly added character
      if (digits.startsWith(prevVal)) {
        return digits.slice(prevVal.length);
      }
      // If user typed at the beginning, take the newly prepended character
      if (digits.endsWith(prevVal)) {
        return digits.slice(0, digits.length - prevVal.length);
      }
      return digits.slice(-1);
    }

    return digits.slice(0, 2);
  };

  const handleDayChange = (e: ChangeEvent<HTMLInputElement>) => {
    let raw = cleanSegmentInput(dayValRef.current, e.target.value);

    // If user types a single digit 4-9, it can never be a 2-digit day prefix (>31),
    // so auto-pad to '0X' and immediately advance to month.
    if (raw.length === 1 && parseInt(raw, 10) >= 4) {
      raw = `0${raw}`;
    }

    dayValRef.current = raw;
    setDay(raw);
    evaluateAndTrigger(raw, monthValRef.current, yearValRef.current);

    // Auto-advance to month when 2 valid digits are entered (e.g. '01'-'31')
    if (raw.length === 2 && raw !== '00') {
      monthRef.current?.focus();
      monthRef.current?.select();
    }
  };

  /**
   * Handles day blur event.
   * Uses synchronous `dayValRef.current` rather than state to prevent race conditions:
   * when auto-advance focuses month, blur fires synchronously before React re-renders.
   * If the user already entered a complete 2-digit day, this ensures it is never overwritten.
   */
  const handleDayBlur = () => {
    const current = dayValRef.current;
    // Only pad if user navigated away with a single valid digit (1-3)
    if (current.length === 1 && parseInt(current, 10) >= 1) {
      const padded = current.padStart(2, '0');
      dayValRef.current = padded;
      setDay(padded);
      evaluateAndTrigger(padded, monthValRef.current, yearValRef.current);
    }
  };

  const handleMonthChange = (e: ChangeEvent<HTMLInputElement>) => {
    let raw = cleanSegmentInput(monthValRef.current, e.target.value);

    // If user types a single digit 2-9, it can never be a 2-digit month prefix (>12),
    // so auto-pad to '0X' and immediately advance to year.
    if (raw.length === 1 && parseInt(raw, 10) >= 2) {
      raw = `0${raw}`;
    }

    monthValRef.current = raw;
    setMonth(raw);
    evaluateAndTrigger(dayValRef.current, raw, yearValRef.current);

    // Auto-advance to year when 2 valid digits are entered (e.g. '01'-'12')
    if (raw.length === 2 && raw !== '00') {
      yearRef.current?.focus();
      yearRef.current?.select();
    }
  };

  /**
   * Handles month blur event.
   * Uses synchronous `monthValRef.current` to prevent stale closure race condition when advancing to year.
   */
  const handleMonthBlur = () => {
    const current = monthValRef.current;
    // Only pad if user navigated away with a single valid digit (1)
    if (current.length === 1 && parseInt(current, 10) >= 1) {
      const padded = current.padStart(2, '0');
      monthValRef.current = padded;
      setMonth(padded);
      evaluateAndTrigger(dayValRef.current, padded, yearValRef.current);
    }
  };

  const handleYearChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
    yearValRef.current = raw;
    setYear(raw);
    evaluateAndTrigger(dayValRef.current, monthValRef.current, raw);
  };

  // Keyboard navigation between segments
  const handleKeyDown = (segment: 'day' | 'month' | 'year', e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (segment === 'day' && (dayValRef.current === '00' || (dayValRef.current.length === 2 && dayValRef.current.startsWith('0')))) {
        e.preventDefault();
        dayValRef.current = '';
        setDay('');
        evaluateAndTrigger('', monthValRef.current, yearValRef.current);
        return;
      }
      if (segment === 'month' && (monthValRef.current === '00' || (monthValRef.current.length === 2 && monthValRef.current.startsWith('0')))) {
        e.preventDefault();
        monthValRef.current = '';
        setMonth('');
        evaluateAndTrigger(dayValRef.current, '', yearValRef.current);
        return;
      }
      if (segment === 'year' && !yearValRef.current) {
        e.preventDefault();
        monthRef.current?.focus();
        monthRef.current?.select();
      } else if (segment === 'month' && !monthValRef.current) {
        e.preventDefault();
        dayRef.current?.focus();
        dayRef.current?.select();
      }
    } else if (e.key === '/' || e.key === '.' || e.key === '-') {
      e.preventDefault();
      if (segment === 'day') {
        if (dayValRef.current.length === 1 && parseInt(dayValRef.current, 10) >= 1) {
          const padded = dayValRef.current.padStart(2, '0');
          dayValRef.current = padded;
          setDay(padded);
          evaluateAndTrigger(padded, monthValRef.current, yearValRef.current);
        }
        monthRef.current?.focus();
        monthRef.current?.select();
      } else if (segment === 'month') {
        if (monthValRef.current.length === 1 && parseInt(monthValRef.current, 10) >= 1) {
          const padded = monthValRef.current.padStart(2, '0');
          monthValRef.current = padded;
          setMonth(padded);
          evaluateAndTrigger(dayValRef.current, padded, yearValRef.current);
        }
        yearRef.current?.focus();
        yearRef.current?.select();
      }
    } else if (e.key === 'ArrowRight') {
      if (segment === 'day' && e.currentTarget.selectionStart === dayValRef.current.length) {
        monthRef.current?.focus();
        monthRef.current?.select();
      } else if (segment === 'month' && e.currentTarget.selectionStart === monthValRef.current.length) {
        yearRef.current?.focus();
        yearRef.current?.select();
      }
    } else if (e.key === 'ArrowLeft') {
      if (segment === 'year' && e.currentTarget.selectionStart === 0) {
        monthRef.current?.focus();
        monthRef.current?.select();
      } else if (segment === 'month' && e.currentTarget.selectionStart === 0) {
        dayRef.current?.focus();
        dayRef.current?.select();
      }
    }
  };

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  /**
   * Clears all fields and resets filter
   */
  const handleClear = () => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setDay('');
    setMonth('');
    setYear('');
    dayValRef.current = '';
    monthValRef.current = '';
    yearValRef.current = '';
    onChange('');
    dayRef.current?.focus();
  };

  /**
   * Handles date selected via native visual calendar popup
   */
  const handleNativePickerChange = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.value;
    if (picked) {
      const [y, m, d] = picked.split('-');
      yearValRef.current = y;
      monthValRef.current = m;
      dayValRef.current = d;
      setYear(y);
      setMonth(m);
      setDay(d);
      onChange(picked);
    }
  };

  const hasAnyInput = Boolean(day || month || year || value);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <div
        className="date-segment-container"
        title={title}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          background: '#fff',
          border: '1px solid #dcd9e7',
          borderRadius: 10,
          padding: '6px 10px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
        }}
      >
        <button
          type="button"
          onClick={() => {
            try {
              nativePickerRef.current?.showPicker();
            } catch {
              nativePickerRef.current?.focus();
            }
          }}
          title="Open visual calendar"
          style={{
            border: 0,
            background: 'transparent',
            cursor: 'pointer',
            padding: 0,
            marginRight: 4,
            display: 'flex',
            alignItems: 'center',
            color: '#71659a'
          }}
        >
          <Calendar size={17} />
        </button>

        {/* Hidden native date input for the calendar popup */}
        <input
          ref={nativePickerRef}
          type="date"
          value={value}
          onChange={handleNativePickerChange}
          tabIndex={-1}
          style={{
            position: 'absolute',
            opacity: 0,
            pointerEvents: 'none',
            width: 0,
            height: 0
          }}
        />

        {/* Day input */}
        <input
          ref={dayRef}
          type="text"
          inputMode="numeric"
          placeholder={placeholder.day ?? 'DD'}
          value={day}
          onChange={handleDayChange}
          onBlur={handleDayBlur}
          onFocus={handleFocus}
          onKeyDown={(e) => handleKeyDown('day', e)}
          title="Day (01-31)"
          style={{
            width: 28,
            textAlign: 'center',
            border: 0,
            outline: 'none',
            background: 'transparent',
            fontSize: 13,
            fontWeight: 600,
            color: '#393648',
            boxSizing: 'border-box',
            padding: 0
          }}
        />

        <span style={{ color: '#aaa6bf', fontWeight: 700, userSelect: 'none' }}>/</span>

        {/* Month input */}
        <input
          ref={monthRef}
          type="text"
          inputMode="numeric"
          placeholder={placeholder.month ?? 'MM'}
          value={month}
          onChange={handleMonthChange}
          onBlur={handleMonthBlur}
          onFocus={handleFocus}
          onKeyDown={(e) => handleKeyDown('month', e)}
          title="Month (01-12)"
          style={{
            width: 28,
            textAlign: 'center',
            border: 0,
            outline: 'none',
            background: 'transparent',
            fontSize: 13,
            fontWeight: 600,
            color: '#393648',
            boxSizing: 'border-box',
            padding: 0
          }}
        />

        <span style={{ color: '#aaa6bf', fontWeight: 700, userSelect: 'none' }}>/</span>

        {/* Year input */}
        <input
          ref={yearRef}
          type="text"
          inputMode="numeric"
          placeholder={placeholder.year ?? 'YYYY'}
          value={year}
          onChange={handleYearChange}
          onFocus={handleFocus}
          onKeyDown={(e) => handleKeyDown('year', e)}
          title="Year (e.g. 2026)"
          style={{
            width: 44,
            textAlign: 'center',
            border: 0,
            outline: 'none',
            background: 'transparent',
            fontSize: 13,
            fontWeight: 600,
            color: '#393648',
            boxSizing: 'border-box',
            padding: 0
          }}
        />
      </div>

      {showClearButton && hasAnyInput && (
        <button
          type="button"
          onClick={handleClear}
          title="Clear date filter"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            border: 0,
            background: '#f1edf8',
            color: '#65598d',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.15s'
          }}
        >
          <X size={14} /> Clear
        </button>
      )}
    </div>
  );
}
