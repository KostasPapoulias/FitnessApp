import { Reviews } from '@mui/icons-material';
import React, {useState} from 'react';
import { useSelector } from 'react-redux';
import { useDispatch } from 'react-redux';


export default function Start({workedMuscles, worked}){
    const dispatch = useDispatch();
    const list = useSelector(state => state.exercises.list);
    const recovery = useSelector(state => state.categories.recovery);

    const handleBegin = () => {
        let groups = Array.isArray(list) ? list.map(item => item.category) : [];
        console.log(groups);
        workedMuscles(groups);
        worked(true);


        recovery.forEach(recovery => {
            // dispatch({ type: 'INCREMENT_CATEGORY_COUNT', payload: group });
            const match = groups.some(item => item === recovery.name);
            match ? 
                dispatch({ type: 'INCREMENT_CATEGORY_COUNT', payload: recovery.name })
            :
                dispatch({ type: 'DECREMENT_CATEGORY_COUNT', payload: recovery.name })
        });

        // dispatch({ type: 'INCREMENT_CATEGORY_COUNT', payload: 'Triceps' });


        dispatch({ type: 'CLEAR_LIST' });
        dispatch({type: 'CLEAR_CATEGORY'});

    }
    return(
        <div className="Start">
            <ChosenExercises />
            <div className="begin" onClick={handleBegin}>Start Exersice</div>
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
        <div className='chosenExercises'>
            {list && list.map(item => (
                <div className='exersice' key={item.id} itemID={item.cId}>
                    <img className="im" src={item.image} alt={item.name} style={{width: '60px'}}/>
                    {item.name}
                </div>
            ))}
        </div>
    );
}

