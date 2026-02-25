import { useCallback } from 'react';

export function useAddLogic() {
  const initializeAddFlow = useCallback(() => {
    return null;
  }, []);

  return {
    initializeAddFlow,
  };
}
