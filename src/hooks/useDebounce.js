import { useState, useEffect } from "react";

/**
 * Custom hook to debounce a value
 * @param {*} value The value to debounce
 * @param {number} delay Delay in milliseconds (default: 500)
 * @returns {*} The debounced value
 */
export function useDebounce(value, delay = 500) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default useDebounce;
