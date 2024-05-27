import './WorkoutPanel.css';
import Timer from './Timer';
import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';

export default function WorkoutPanel({onFinishPress}){
    const [isRunning, setIsRunning] = useState(true);
    const [completedExercises, setCompletedExercises] = useState([]);
    const [pressTimer, setPressTimer] = useState(null);
    const [isPressed, setIsPressed] = useState(false);


    const handleFinishPress = () => {
        setIsRunning(false);
        console.log(completedExercises);
        onFinishPress(completedExercises);
    }
    const handleExecuted = (executedExercises) => {
        setCompletedExercises(prevExercises => [...prevExercises, executedExercises]);
    }
    const handleButtonPress = () => {
        setIsPressed(true);
        setPressTimer(setTimeout(() => {
            handleFinishPress();
        }, 1200)); 
    }

    const handleButtonRelease = () => {
        setIsPressed(false);
        clearTimeout(pressTimer);
    }

    return(
        <div className="WorkoutPanel">
            <div className={`finish ${isPressed ? 'pressed' : ''}`} 
                onMouseDown={handleButtonPress} 
                onMouseUp={handleButtonRelease}
                onTouchStart={handleButtonPress} 
                onTouchEnd={handleButtonRelease}>
            Finish</div>

            <div className="clock"><Timer isRunning={isRunning}/></div> 
            <ChosenExercises executed={handleExecuted} />
        </div>
    );

}

const ChosenExercises = ({executed}) => {
    const list = useSelector(state => state.exercises.list);
    const dispatch = useDispatch();

    const handleDone = (item) => {
        executed(item);
        dispatch({ type: 'REMOVE_ITEM', payload: item });
        console.log(list);
    }

    return(
        <div className='chosenExercisesStart'>
            {list && list.map(item => (
                <div className='exersicePanel' key={item.id} itemID={item.cId}>
                    <img className="im" src={item.image} alt={item.name} style={{width: '60px'}}/>
                    {item.name}
                    <div className='done' onClick={() => handleDone(item)}>Done</div>
                </div>
            ))}
        </div>
    );
}