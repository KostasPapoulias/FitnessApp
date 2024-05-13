import './Home.css'
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import HouseIcon from '@mui/icons-material/House';
import recovery1 from '../../../pictures/recovery1.png';
import recovery2 from '../../../pictures/recovery2.png';
import { useState } from 'react';


const HomeIcon = ({ onHomePress, isHomePressed }) => {
    const [isRecovery1, setIsRecovery1] = useState(true);
    const handlePress = () => {
        onHomePress();
        setIsRecovery1(!isRecovery1);
    }
    return(
        <div className='HomeIcon' onClick={onHomePress}>
            {isHomePressed ? (
                    <img src={recovery2} alt="recovery 1" style={{ width: '90px' }} />
                ) : (
                    <img src={recovery1} alt="recovery 2"style={{ width: '90px' }} />
                )}
        </div>
    );
}
export default HomeIcon;