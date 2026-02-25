// Logic for NavBar state and handlers
import { useState } from 'react';

export function useNavBarLogic() {
    const [isHomePressed, setIsHomePressed] = useState(true);
    const [isAddPressed, setIsAddPressed] = useState(false);
    const [isStartPressed, setIsStartPressed] = useState(false);

    const handleHomePress = () => {
        setIsHomePressed(true);
        setIsAddPressed(false);
        setIsStartPressed(false);
    };
    const handleAddPress = () => {
        setIsAddPressed(true);
        setIsStartPressed(false);
        setIsHomePressed(false);
    };
    const handleStartPress = () => {
        setIsStartPressed(true);
        setIsAddPressed(false);
        setIsHomePressed(false);
    };

    return {
        isHomePressed,
        isAddPressed,
        isStartPressed,
        handleHomePress,
        handleAddPress,
        handleStartPress,
    };
}