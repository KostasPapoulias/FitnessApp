import { useState } from 'react';
import { useSelector } from 'react-redux';
import back from '../../../../pictures/back.png';
import plus from '../../../../pictures/plus.png';
import { AddExerciseMenu } from '../AddExerciseMenu';

/**
 * Displays the part with the navigation buttons
 * Displays the exercises that have been selected or the available exercises according to the categories
 * @param {selectedCategory} selectedCategory the one category that has been selected
 * @returns a return button and the available exercises the user has to select
 * @returns an add new exercises button and the exercises the user has selected
 */
export default function DisplayDefault({ selectedCategory }) {
    const [middleNew, setMiddleNew] = useState(false);
    const handleMiddleNew = () => {
        setMiddleNew(!middleNew);
    };

    const toggleUp = useSelector(state => state.help.toggleUp);
    const toggleDown = useSelector(state => state.help.toggleDown);
    const help = useSelector(state => state.help.help);

    return (
        <div>
            {middleNew ? (
                <div>
                    <div className='addExercise' onClick={handleMiddleNew}>
                        <img src={back} alt="back" style={{ width: '20px' }} />
                        return
                    </div>
                    <AddExerciseMenu category={selectedCategory} />
                </div>
            ) : (
                <div>
                    <div className={`addExercise ${toggleDown[0] === 'true' && toggleUp[0] === 'false' && help == 'true' ? 'cheat' : ''}`} onClick={handleMiddleNew}>
                        <img src={plus} alt="plus" style={{ width: '35px' }} />
                        add new exercise
                    </div>
                    <ChosenExercises />
                </div>
            )}
        </div>
    );
}

// Import ChosenExercises component
import ChosenExercises from './ChosenExercises';
