import './WorkoutPanel.css';
import Timer from './Timer';
import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';

export default function WorkoutPanel({onFinishPress}){
    const [isRunning, setIsRunning] = useState(true);
    const [completedExercises, setCompletedExercises] = useState([]);
    const handleFinishPress = () => {
        setIsRunning(false);
        console.log(completedExercises);
        onFinishPress(completedExercises);
    }
    const handleExecuted = (executedExercises) => {
        setCompletedExercises(prevExercises => [...prevExercises, executedExercises]);
    }

    return(
        <div className="WorkoutPanel">
            <div className='finish' onClick={handleFinishPress}>Finish</div>
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
        // dispatch({ type: 'UPDATE_LIST', payload: list.filter(exercise => exercise.id !== item.id) });
        console.log(list);
    }

    return(
        <div className='chosenExercisesStart'>
            {list && list.map(item => (
                <div className='exersice' key={item.id} itemID={item.cId}>
                    <img className="im" src={item.image} alt={item.name} style={{width: '60px'}}/>
                    {item.name}
                    <div className='done' onClick={() => handleDone(item)}>Done</div>
                </div>
            ))}
        </div>
    );
}