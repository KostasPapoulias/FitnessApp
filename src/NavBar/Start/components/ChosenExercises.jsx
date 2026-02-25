import { useSelector } from 'react-redux';

/**
 * Displays the chosen exercises in the Start view
 * @returns displays the chosen exercises
 */
export default function ChosenExercises() {
    const list = useSelector(state => state.exercises.list);
    
    return (
        <div className='chosenExercisesStart'>
            {list && list.map(item => (
                <div className='exersice' key={item.id} itemID={item.cId}>
                    <img className="im" src={item.image} alt={item.name} style={{ width: '60px' }} />
                    {item.name}
                </div>
            ))}
        </div>
    );
}
