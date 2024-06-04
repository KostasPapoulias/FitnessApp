
import React, { useState } from 'react';
import './SetRep.css';
import plusButton from '../../../pictures/plusButton.png';
import minusButton from '../../../pictures/minusButton.png';
import binButton from '../../../pictures/binButton.png';
import { useSelector, useDispatch } from 'react-redux';

export default function SetRep({ goBack, id }) {
    const [sets, setSets] = useState([]);
    const [fakeId, setFakeId ]= useState(0);
    const list = useSelector((state) => state.exercises.list);
    const dispatch = useDispatch();
    const handleGoBack = () => {
        const exercise = list.find((item) => item.id === id);
        if (exercise) {
            exercise.sets = sets;
            dispatch({ type: 'UPDATE_EXERCISE', payload: exercise });
        }
        goBack();
    };

    const handleAddSet = () => {
        const newSet = {
            id: fakeId,
            reps: 0,
        };
        setFakeId(fakeId + 1);
        setSets(prevSets => [...prevSets, newSet]);
        console.log(sets);
    };

    const handleIncreaseReps = (index) => {
        sets[index].reps ++;
        setSets([...sets]);
    };

    const handleDecreaseReps = (index) => {
        sets[index].reps ? sets[index].reps-- : sets[index].reps = 0;
        setSets([...sets]);
    };


    const handleRemoveSet = (index) => {
        const updatedSets = [...sets];
        updatedSets.splice(index, 1);
        setSets(updatedSets);
    };

    return (
        <div>
            <div className='goBack' onClick={handleGoBack}>
                return
            </div>
            <button className='addSetButton' onClick={handleAddSet}>Add Set</button>
            <div className='setContainer'>
                {sets.map((set, index) => (
                    <div className= 'set' key={index}>
                        <span className='setCounter'>Set {index + 1}</span>
                        <img className="minusButton" src={minusButton} alt="minus" style={{width: "20px"}}onClick={() => handleDecreaseReps(index)}/>
                        <span className='rep'>{set.reps}</span>
                        <img className="plusButton" src={plusButton} alt="plus" style={{width: "20px"}}onClick={() => handleIncreaseReps(index)}/>
                        <img className="binButton" src={binButton} alt="Bin" style={{width: "30px"}} onClick={() => handleRemoveSet(index)} />
                    </div>
                ))}
            </div>
        </div>
    );
};


