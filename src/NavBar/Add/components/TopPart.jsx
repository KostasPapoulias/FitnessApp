import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { clearList } from '../../../exercisesSlice';
import { clearCategory } from '../../../categoriesSlice';
import { toggleDown } from '../../../helpSlice';
import plus2 from '../../../../pictures/traps_files/simple plus.png';
import info from '../../../../pictures/info.png';
import CustomizedCheckbox from '../CustomizedCheckBox';

/**
 * Handles the press on the new and info button
 * @param {topNew} topNew represents the click on the new button
 * @returns the top section of the page with the new and info buttons 
 */
export default function TopPart({ topNew }) {
    const dispatch = useDispatch();
    const handleNew = () => {
        topNew(true);
        dispatch(clearList());
        dispatch(clearCategory());
        dispatch(toggleDown('true'));
    };
    const toggleUpState = useSelector(state => state.help.toggleUp);
    const help = useSelector(state => state.help.help);
    const [infoPress, setInfoPress] = useState(false);
    const handleInfo = () => {
        setInfoPress(!infoPress);
    };

    return (
        <div className='topPart'>
            <div className={`newWorkout ${toggleUpState[0] === 'true' && help == 'true' ? 'cheat' : ''}`} onClick={handleNew}>
                <img src={plus2} alt="plus2" style={{ width: '10px' }} />
                new
            </div>
            <div className='info' onClick={handleInfo}>
                <img src={info} alt="info" style={{ width: '20px' }} />
            </div>
            {infoPress && <Info />}
        </div>
    );
}

/**
 * This function is responsible for the activation of help 
 * @returns a text and a check button with the information
 */
function Info() {
    const dispatch = useDispatch();
    const handleCheckBox = (pressed) => {
        dispatch({ type: 'ADD_HELP', payload: pressed });
    };

    return (
        <div className='infoBox'>
            <div className='activateHelp'>
                <label htmlFor="helpCheckbox">Activate help</label>
                <CustomizedCheckbox checkBoxPressed={handleCheckBox} />
            </div>
        </div>
    );
}
