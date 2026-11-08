import { useEffect, useState } from 'react';

/**
 * Debounce a rapidly changing value (search boxes, sliders) so downstream
 * query keys — and therefore network requests — only change once the user
 * pauses typing.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
