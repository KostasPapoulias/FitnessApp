import './Start.css'
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Person2Icon from '@mui/icons-material/Person2';
import start1 from '../../../pictures/start workout1.png';
import start2 from '../../../pictures/start workout2.png';

import { useState } from 'react';

const StartIcon = ({ onStartPress, isStartPressed }) => {
    const [isRecovery1, setIsRecovery1] = useState(true);
    const handlePress = () => {
        onHomePress();
        setIsRecovery1(!isRecovery1);
    }
    return (
        <div className='StartIcon' onClick={onStartPress}>
            {isStartPressed ? (
                    <img src={start2} alt="start workout 2" style={{ width: '120px' }} />
                ) : (
                    <img src={start1} alt="start workout 1"style={{ width: '120px' }} />
                )}
        </div>
    );
};

export default StartIcon;