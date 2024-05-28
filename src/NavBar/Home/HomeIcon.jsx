import './Home.css'
import recovery1 from '../../../pictures/recovery1.png';
import recovery2 from '../../../pictures/recovery2.png';
import { useState } from 'react';


const HomeIcon = ({ onHomePress, isHomePressed }) => {
    
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