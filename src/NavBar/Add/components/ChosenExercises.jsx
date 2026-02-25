import { useState } from 'react';
import { useSelector } from 'react-redux';
import SetRep from '../SetRep';

/**
 * Displays the chosen exercises
 * @returns displays the chosen exercises
 */
export default function ChosenExercises() {
    const list = useSelector(state => Array.isArray(state.exercises.list) ? state.exercises.list : []);
    const [open, setOpen] = useState(false);
    const [id, setid] = useState(0);
    
    const handleClick = (id) => {
        setid(id);
        setOpen(!open);
    };
    
    const handleGoBack = () => {
        setOpen(false);
    };

    return (
        !open ? (
            <div className='chosenExercises'>
                {list && list.map(item => (
                    <div className='exersice' key={item.id} itemID={item.cId} onClick={() => handleClick(item.id)}>
                        <img className="im" src={item.image} alt={item.name} style={{ width: '60px' }} />
                        {item.name}
                    </div>
                ))}
            </div>
        ) : (
            <div className='exersiceSetRep'>
                <SetRep goBack={handleGoBack} id={id} />
            </div>
        )
    );
}
