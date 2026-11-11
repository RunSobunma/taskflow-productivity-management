/* Runs a save function and routes ValidationErrors to per-field messages. */
import { useCallback, useState } from 'react';
import { ValidationError } from '../lib/utils.js';
import { useUI } from '../context/AppContext.jsx';

export function useFormErrors(formRef) {
  const [errors, setErrors] = useState({});
  const { toast } = useUI();

  const run = useCallback(fn => {
    try {
      setErrors({});
      return fn();
    } catch (err) {
      if (err instanceof ValidationError) {
        setErrors(err.errors);
        requestAnimationFrame(() => {
          const field = formRef.current && formRef.current.querySelector('.has-error input, .has-error select, .has-error textarea');
          if (field) field.focus();
          else toast(Object.values(err.errors)[0], { type: 'error' });
        });
      } else {
        console.error(err);
        toast(err.message || 'Something went wrong', { type: 'error' });
      }
      return null;
    }
  }, [formRef, toast]);

  return [errors, run, setErrors];
}

export const FieldError = ({ errors, name }) => <p className="field-error" aria-live="polite">{errors[name] || ''}</p>;
