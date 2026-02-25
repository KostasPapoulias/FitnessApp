import './AddExerciseMenu.css';
import List from './List.jsx'
import { useDispatch, useSelector } from 'react-redux';
import ButtonAdd from './ButtonAdd';

/**
 * 
 * @param {category} param0 is an object that contains the category
 * @returns the exercises by the categories that have been chosen or only the exercises of the chosen param0
 */
const AddExerciseMenu = ({ category}) => {

    const cate = category;  

    return (
        <div className='addExerciseMenu'>
            
            {cate ? <ShowExersicesByCategory category={category} /> : <ShowExersices />}

        </div>
    );
};

/**
 * 
 * @returns the exercises by the categories that have been chosen
 */
const ShowExersices = () => {
    const dispatch = useDispatch();
    const categories = useSelector(state => Array.isArray(state.categories.categoriesList) ? state.categories.categoriesList : []);   
    const exercises = useSelector(state => state.exercises.list);

    const handleAddItemToList = (item) => {
        const isItemExists = exercises.some(Item => Item.id === item.id);
        if (!isItemExists) {
            dispatch({ type: 'ADD_ITEM', payload: item });
            dispatch({ type: 'TOGGLE_DOWN', payload: 'false' });
        }
        
    };


    return(
        <div className='pickExersiceContainer'>
            {categories.map(cat => (
                List.filter(item => item.category === cat).map(item => (
                    <div key={item.id} itemID={item.cId} className='pickExersice'>
                        <img src={item.image} alt={item.name} style={{width: '60px'}}/>

                        {item.name}
                        <ButtonAdd AddPressed={() => handleAddItemToList(item)} />                        
                   </div>
                ))
            ))}
        </div>
    );
};

/**
 * 
 * @param {category} param0 is an object that contains the category
 * @returns the exercises by the category that has been chosen
 */
const ShowExersicesByCategory = ({category}) => {

    const dispatch = useDispatch();
    const exercises = useSelector(state => state.exercises.list);

    const handleAddItemToList = (item) => {
        const isItemExists = exercises.some(Item => Item.id === item.id);
        if (!isItemExists) {
            dispatch({ type: 'ADD_ITEM', payload: item });
            dispatch({ type: 'TOGGLE_DOWN', payload: 'false' });
        }
    };

    return(
        <div className='pickExersiceContainer'>
            {List.filter(item => item.category === category).map(item => (
                <div key={item.id} itemID={item.cId} className='pickExersice'>
                    
                    <img className ='im' src={item.image} alt={item.name} style={{width: '60px'}}/>
                    
                    {item.name}
                    <ButtonAdd AddPressed={() => handleAddItemToList(item)} />                        

                </div>
            ))}
        </div>
    );
};


export {AddExerciseMenu};