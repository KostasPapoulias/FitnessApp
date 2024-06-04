import React, { useState, useEffect } from 'react';
import './Add.css';
import DatePicker from '../Date';
import {AddExerciseMenu} from './AddExerciseMenu';  
import {AddCategoryMenu} from './AddCategoryMenu';
import plus from '../../../pictures/plus.png';
import back from '../../../pictures/back.png';
const triceps = '../../../pictures/traps_files/Triceps.png';
import biceps from '../../../pictures/traps_files/Biceps.png';
import abs from '../../../pictures/traps_files/Abs.png';
import calves from '../../../pictures/traps_files/Calves.png';
import chest from '../../../pictures/traps_files/Chest.png';
import forearms from '../../../pictures/traps_files/Forearms.png';
import glutes from '../../../pictures/traps_files/Glutes.png';
import hamstrings from '../../../pictures/traps_files/Hamstrings.png';
import quads from '../../../pictures/traps_files/Quads.png';
import shoulders from '../../../pictures/traps_files/Shoulders.png';
import lats from '../../../pictures/traps_files/Lats.png';
import traps from '../../../pictures/traps_files/Traps.png';
import plus2 from '../../../pictures/traps_files/simple plus.png';
import info from '../../../pictures/info.png';
import { useSelector, useDispatch } from 'react-redux';
import CustomizedCheckbox from './CustomizedCheckBox';
import SetRep from './SetRep';


export default function Add({ Exersices, onListChange, saveDate}) { 
 
    const addItemToList = (newItem) => {
        // const updatedExercises = exercises.map(exercise => ({
        //     ...exercise,
        //     date: date
        //   }));
        // newItem.date = date;
        // const updatedList = [...exersicesCopy, newItem]; 
        const updatedList = [...Exersices, newItem];
        console.log(updatedList);
        // console.log(newItem);
        onListChange(updatedList); 
        setExersicesChosenToDisplay(updatedList);
    };

    const [date, setDate] = useState();

    const handleDate = (newDate) => {
        saveDate(newDate)
        setDate(newDate);
    }
    

    const [topNew, setTopNew] = useState(false);
    const [topReturn, setTopReturn] = useState(false);
    const [chosenCategories, setChosenCategories] = useState([])
    const [returnCategorySelected, setReturnCategorySelected] = useState();

    const handleTopReturn = () => {
        setTopReturn(true);
        setTopNew(false);
    }
    const handleChosenCategories = (categories) => {
        setChosenCategories(categories);
    }
    const handleTopNew = () => {
        setTopNew(true);
        setReturnCategorySelected('');
    }
    //to be given to addExerciseMenu
    const handleReturnSelectedCategory = (c) => {
        setReturnCategorySelected(c);
    }


    return (
        
        <div className='Add'>
            {topNew? <AddCategoryMenu goBack={handleTopReturn} 
                                      chosenCategories={handleChosenCategories}/> 
                    : <TopPart topNew={handleTopNew}/>}
            {!topNew? <DisplayDefault selectedCategory={returnCategorySelected}/> : <></>}
            {!topNew && <ShowSelectedCategories categoriesArray={chosenCategories} returnSelectedCategory={handleReturnSelectedCategory}/>}
        </div>
    );
}
/**
 * Displayes the part with the navigation buttons
 * Displayes the exercises that have been selected or the available sexercises according to the categories
 * @param {selectedCategory} param0 the one category that has been selected
 * @returns a return button and the available exercises the user has to select
 * @returns an add new exersices button and the exercises the user has selected
 */
const DisplayDefault = ({selectedCategory}) => {


    const [middleNew, setMiddleNew] = useState(false);
    const handleMiddleNew = () => {
        setMiddleNew(!middleNew);
    }

    const toggleUp = useSelector(state => state.help.toggleUp);
    const toggleDown = useSelector(state => state.help.toggleDown);
    const help = useSelector(state => state.help.help); 

    return(
        <div>
            {middleNew ? (
                <div>
                    <div className='addExercise' onClick={handleMiddleNew}>
                        <img src={back} alt="back" style={{width: '20px'}}/>

                        return
                    </div>

                    <AddExerciseMenu category={selectedCategory} />

                </div>
                
            ):( 
                <div>
                    <div className={`addExercise ${toggleDown[0]==='true' && toggleUp[0]==='false' && help=='true'? 'cheat' : ''}`} onClick={handleMiddleNew}> 

                        <img src={plus} alt="plus" style={{width: '35px'}}/>

                        add new exercise
                    </div>
                    <ChosenExercises />

                </div>
            )
        }</div>
    );
        
    
    
}
/**
 * handles the press on the new and info button
 * @param {topNew} param0 represents the click on the new button
 * @returns the top section of the page with the new and info buttons 
 */
const TopPart = ({topNew}) =>{
    const dispatch = useDispatch();
    const handleNew = () => {
        topNew(true);
        dispatch({type: 'CLEAR_LIST'});
        dispatch({type: 'CLEAR_CATEGORY'});
        dispatch({type: 'TOGGLE_DOWN', payload: 'true'});
    }
    const toggleUp = useSelector(state => state.help.toggleUp);
    const help = useSelector(state => state.help.help);
    const [infoPress, setInfoPress] = useState(false);
    const handleInfo = () => {
        setInfoPress(!infoPress);
    }

    return(
        <div className='topPart'>
            
            <div className={`newWorkout ${toggleUp[0]==='true' && help=='true'? 'cheat' : ''}`} onClick={handleNew}> 
                <img src={plus2} alt="plus2" style={{width: '10px'}}/>

                new</div>
            <div className='info' onClick={handleInfo}>
                <img src={info} alt="info" style={{width: '20px'}}/>
            </div>
            {infoPress && <Info/>}

        </div>
    );
}
/**
 * this function is responsble for the activation of help 
 * @returns a text and a check button with the informations
 */
const Info = () => {
    const dispatch = useDispatch();
    const handleCheckBox = (pressed) => {
        dispatch({type: 'ADD_HELP', payload: pressed});
    }
    
    return(
        <div className='infoBox'>
            <div className='activateHelp'>
                <label htmlFor="helpCheckbox">Activate help</label>
                <CustomizedCheckbox checkBoxPressed={handleCheckBox}/>
            </div>
        </div>
    );
}

/**
 * 
 * @param {returnCategorySelected} param0 category that has been selected
 * @returns an horizontal list of the arrays that has been chosen
 */
const ShowSelectedCategories = ({categoriesArray, returnSelectedCategory}) => {
    const dispatch = useDispatch();
    const categories = useSelector(state => Array.isArray(state.categories.categoriesList) ? state.categories.categoriesList : []);

    useEffect(() => {
        if (!categories.length) {
            dispatch({ type: 'TOGGLE_UP', payload: 'true' });
        }
    }, [categories, dispatch]);

    const [selection, setSelection] = useState(categoriesArray[0]);
    const handleSelection = (category) => {
        setSelection(prevSelection => category);
        returnSelectedCategory(prevSelection => category);
    };

    return (
        // <div className='selectedCategoriesContainer'>
            <div className='displayCateg'>
                {categories.map((category) => (
                    <div key={category} className='categ' onClick={() => handleSelection(category)}>
                        <div style={{fontFamily: "Copperplate, Fantasy"}}>{category}</div>
                        <img src={'../../../pictures/traps_files/'+category+'.png'} alt={category} style={{width: '80px'}}/>
                    </div>
                ))}
                
            </div>
        // </div>
    );
};
/**
 * 
 * @returns displayes the chosen exercises
 */
const ChosenExercises = () => {
    const list = useSelector(state => Array.isArray(state.exercises.list) ? state.exercises.list : []);    
    const [open, setOpen] = useState(false);
    const [id, setid] = useState(0);
    const handleClick = (id) => {
        setid(id);
        setOpen(!open);
    }
    const handleGoBack = () => {
        setOpen(false);
    }

    return(
        !open ? (
            <div className='chosenExercises'>
                {list && list.map(item => (
                    <div className='exersice' key={item.id} itemID={item.cId} onClick={() => handleClick(item.id)}>
                        <img className="im" src={item.image} alt={item.name} style={{width: '60px'}}/>
                        {item.name}
                    </div>
                ))}
            </div>
        ) : (
            <div className='exersiceSetRep'>
                <SetRep goBack={handleGoBack} id={id}/>
            </div>
        )
    );
}
