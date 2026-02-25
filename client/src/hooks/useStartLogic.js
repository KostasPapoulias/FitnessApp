import { useCallback } from 'react';

export function useStartLogic() {
  const startWorkout = useCallback(() => {
    return null;
  }, []);

  return {
    startWorkout,
  };
}
