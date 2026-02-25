import { useMemo } from 'react';

export function useHomeLogic() {
  const stats = useMemo(() => ({
    workoutsCompleted: 0,
    activePlan: null,
  }), []);

  return {
    stats,
  };
}
