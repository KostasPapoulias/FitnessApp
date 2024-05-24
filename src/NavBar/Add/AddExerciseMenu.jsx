import React, { useEffect, useState } from 'react';
import './AddExerciseMenu.css';
import List from './List.jsx'
import { useDispatch, useSelector } from 'react-redux';

const AddExerciseMenu = ({ category, returnExersice}) => {

    const [selectedCategories, setSelectedCategories] = useState([]);

     const cate = category;

    const handleToList = (item) => {
        returnExersice(item);
    }

    

    return (
        <div className='addExerciseMenu'>
            
            {cate ? <ShowExersicesByCategory category={category} /> : <ShowExersices />}

        </div>
    );
};


const ShowExersices = () => {
    const dispatch = useDispatch();
    const categories = useSelector(state => Array.isArray(state.categories.categoriesList) ? state.categories.categoriesList : []);   
    const handleAddItemToList = (item) => {
        dispatch({ type: 'ADD_ITEM', payload: item });
    };


    return(
        <div className='pickExersiceContainer'>
            {categories.map(cat => (
                List.filter(item => item.category === cat).map(item => (
                    <div key={item.id} itemID={item.cId} className='pickExersice'>
                        <img src={item.image} alt={item.name} style={{width: '60px'}}/>

                        {item.name}
                        <button onClick={() => handleAddItemToList(item)}>Add</button> 
                    </div>
                ))
            ))}
        </div>
    );
};


const ShowExersicesByCategory = ({category}) => {

    const dispatch = useDispatch();

    const handleAddItemToList = (item) => {
        dispatch({ type: 'ADD_ITEM', payload: item });

    };

    return(
        <div className='pickExersiceContainer'>
            {List.filter(item => item.category === category).map(item => (
                <div key={item.id} itemID={item.cId} className='pickExersice'>
                    
                    <img className ='im' src={item.image} alt={item.name} style={{width: '60px'}}/>
                    
                    {item.name}
                    <button onClick={() => handleAddItemToList(item)}>Add</button> 
                </div>
            ))}
        </div>
    );
};


export {AddExerciseMenu};