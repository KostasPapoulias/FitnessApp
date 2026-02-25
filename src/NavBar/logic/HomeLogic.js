// Logic for Home component
import { useState } from 'react';

export function useHomeLogic() {
    const [homeDate, setDate] = useState(new Date().toISOString().slice(0, 10));
    const handleDate = (newDate) => {
        setDate(newDate);
    };
    return {
        homeDate,
        handleDate,
    };
}
