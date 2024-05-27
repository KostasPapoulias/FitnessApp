import { Reviews } from '@mui/icons-material';
import React, {useState, useEffect} from 'react';
import { useSelector } from 'react-redux';
import { useDispatch } from 'react-redux';
import './Start.css';
import WorkoutPanel from './WorkoutPanel';


export default function Start({workedMuscles, worked}){
    const dispatch = useDispatch();
    const list = useSelector(state => state.exercises.list);
    const recovery = useSelector(state => state.categories.recovery);
    const [hasStarted, setHasStarted] = useState(false);

    const [isRunning, setIsRunning] = useState(false);

    const handleBegin = () => {
        setHasStarted(!hasStarted);
        setIsRunning(!isRunning);
    }

    const handleFinish = (executedExersices) => {
        console.log(executedExersices);
        setHasStarted(!hasStarted);
        setIsRunning(!isRunning);
        let workedCategories = Array.isArray(executedExersices) ? executedExersices.map(item => item.category) : [];
        console.log(workedCategories);

        recovery.forEach(recovery => {
            const match = workedCategories.some(item => item === recovery.name);
            match ? 
                dispatch({ type: 'INCREMENT_CATEGORY_COUNT', payload: recovery.name })
            :
                dispatch({ type: 'DECREMENT_CATEGORY_COUNT', payload: recovery.name })
        });

        dispatch({ type: 'CLEAR_LIST' });
        dispatch({type: 'CLEAR_CATEGORY'}); 
    }

    return(
        <div className="Start">
            {hasStarted ? (
                <div className='Started'>
                    <WorkoutPanel onFinishPress={handleFinish} />
                </div>
            ) : (
                <div className='Default'>
                    <ChosenExercises />
                    <div className="begin" onClick={handleBegin}>Start Exersice</div>
                </div>
            )}    
        </div>
    );
}

/**
 * 
 * @returns displayes the chosen exercises
 */
const ChosenExercises = () => {
    const list = useSelector(state => state.exercises.list);
    return(
        <div className='chosenExercisesStart'>
            {list && list.map(item => (
                <div className='exersice' key={item.id} itemID={item.cId}>
                    <img className="im" src={item.image} alt={item.name} style={{width: '60px'}}/>
                    {item.name}
                </div>
            ))}
        </div>
    );
}

