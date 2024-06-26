import './Add.css'
import AddIcon from '@mui/icons-material/Add';
import workout1 from '../../../pictures/workout1.png';
import workout2 from '../../../pictures/workout2.png';

/**
 * 
 * @param {onAddPress, isaAddPressed} param0 
 * @returns one of two images depending on the state of isaAddPressed
 */

const Add_Icon = ({ onAddPress, isaAddPressed }) => {

    return(
        <div className='Add_Icon' onClick={onAddPress}>
            {isaAddPressed ? (
                    <img src={workout2} alt="workout 2" style={{ width: '90px' }} />
                ) : (
                    <img src={workout1} alt="workout 1"style={{ width: '90px' }} />
                )}
        </div>
    );
}

export default Add_Icon;
