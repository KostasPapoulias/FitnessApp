import React, { useEffect, useState } from 'react';
import './AddExerciseMenu.css';
import List from './List.jsx'

// const AddExerciseMenu = ({ goBack, category }) => {
    const AddExerciseMenu = ({ category }) => {

    const [selectedCategories, setSelectedCategories] = useState([]);

    const handleSave = () => {
        // Do something with the selected categories
        if(selectedCategories.length !== 0)
            setSavePressed(true);
        console.log(selectedCategories);
    };

    // const handleReturn = () => {
    //     savePressed ? setSavePressed(false) : goBack(true);
    // };

    const [savePressed, setSavePressed] = useState(false);


    return (
        <div className='addExerciseMenu'>
            {/* <TopPartMenu goBack={handleReturn} onSave={handleSave} /> */}
            
            <ShowExersices category={category}/>

        </div>
    );
};



const ShowExersices = ({category}) => {

    const handleAddItemToList = (item) => {
        console.log(item);
    }

    return(
        <div className='pickExersiceContainer'>
            {List.filter(item => item.category === category).map(item => (
                <div key={item.id} itemID={item.cId} className='pickExersice'>
                    {item.name}
                    <button onClick={() => handleAddItemToList(item)}>Add</button> 
                </div>
            ))}
        </div>
    );
};


export {AddExerciseMenu};