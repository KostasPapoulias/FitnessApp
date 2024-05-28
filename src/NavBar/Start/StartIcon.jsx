import './Start.css'
import start1 from '../../../pictures/start workout1.png';
import start2 from '../../../pictures/start workout2.png';


const StartIcon = ({ onStartPress, isStartPressed }) => {

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