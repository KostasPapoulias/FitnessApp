import React, { useEffect, useState } from 'react';
import './AddExerciseMenu.css';
import List from './List.jsx'

const AddExerciseMenu = ({ category, returnExersice, allCategoriesSelected }) => {

    const [selectedCategories, setSelectedCategories] = useState([]);

     const cate = category;

    const handleToList = (item) => {
        returnExersice(item);
    }

    

    return (
        <div className='addExerciseMenu'>
            
            {cate ? <ShowExersicesByCategory category={category} toList={handleToList} /> : <ShowExersices  category={allCategoriesSelected} toList={handleToList} />}

        </div>
    );
};


const ShowExersices = ({category, toList}) => {

    const handleAddItemToList = (item) => {
        toList(item);
    }
    console.log(category);

    return(
        <div className='pickExersiceContainer'>
            {category.map(cat => (
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


const ShowExersicesByCategory = ({category, toList}) => {

    const handleAddItemToList = (item) => {
        toList(item);
    }

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