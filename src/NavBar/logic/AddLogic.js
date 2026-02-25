// Logic for Add component and helpers
import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';

export function useAddLogic(Exersices, onListChange, saveDate) {
    const [date, setDate] = useState();
    const [topNew, setTopNew] = useState(false);
    const [topReturn, setTopReturn] = useState(false);
    const [chosenCategories, setChosenCategories] = useState([]);
    const [returnCategorySelected, setReturnCategorySelected] = useState();
    
    const addItemToList = (newItem) => {
        const updatedList = [...Exersices, newItem];
        onListChange(updatedList);
        setChosenCategories(updatedList);
    };
    const handleDate = (newDate) => {
        saveDate(newDate);
        setDate(newDate);
    };
    const handleTopReturn = () => {
        setTopReturn(true);
        setTopNew(false);
    };
    const handleChosenCategories = (categories) => {
        setChosenCategories(categories);
    };
    const handleTopNew = () => {
        setTopNew(true);
        setReturnCategorySelected('');
    };
    const handleReturnSelectedCategory = (c) => {
        setReturnCategorySelected(c);
    };
    return {
        date,
        topNew,
        topReturn,
        chosenCategories,
        returnCategorySelected,
        addItemToList,
        handleDate,
        handleTopReturn,
        handleChosenCategories,
        handleTopNew,
        handleReturnSelectedCategory,
    };
}
