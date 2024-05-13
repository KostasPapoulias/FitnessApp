import React, { useState } from 'react';
import './Add.css';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import AddIcon from '@mui/icons-material/Add';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import List from './List';
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
import Exersices from '../Exersices';
export default function Add({ Exersices, onListChange, saveDate}) { 
 
    const [ExersicesChosenToDisplay, setExersicesChosenToDisplay] = useState();
    const addItemToList = (newItem) => {
        // const updatedExercises = exercises.map(exercise => ({
        //     ...exercise,
        //     date: date
        //   }));
        // newItem.date = date;
        const updatedList = [...Exersices, newItem]; 
        // console.log("date: " + date);
        console.log(newItem);
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
            {!topNew? <DisplayDefault selectedCategory={returnCategorySelected} Exersice={ExersicesChosenToDisplay} returnItem={addItemToList}/> : <></>}
            {!topNew && <ShowSelectedCategories categoriesArray={chosenCategories} returnSelectedCategory={handleReturnSelectedCategory}/>}
        </div>
    );
}
/**
 * displayes the default view
 */
const DisplayDefault = ({selectedCategory, Exersice, returnItem}) => {


    const [middleNew, setMiddleNew] = useState(false);
    const handleMiddleNew = () => {
        setMiddleNew(!middleNew);
    }

    const handleReturnExersice = (item) => {
        returnItem(item);
    }
    return(
        <div>
            {middleNew ? (
                <div>
                    <div className='addExercise' onClick={handleMiddleNew}>
                        <img src={back} alt="back" style={{width: '20px'}}/>

                        return
                    </div>
                    <AddExerciseMenu category={selectedCategory} returnExersice={handleReturnExersice}/>

                </div>
                
            ):( 
                <div>
                    <div className='addExercise' onClick={handleMiddleNew}> 
                        <img src={plus} alt="plus" style={{width: '35px'}}/>

                        add new exercise
                    </div>
                    <ChosenExercises ExersicesList={Exersice}/>

                </div>
            )
        }</div>
    );
        
    
    
}
/**
 * displays the top section of the page with the new and info buttons
 * @param {*} param0 
 * @returns 
 */
const TopPart = ({topNew}) =>{
    const handleNew = () => {
        topNew(true);
    }
    return(
        <div className='topPart'>
            <div className='newWorkout' onClick={handleNew}>new</div>
            <div className='info'>info</div>
        </div>
    );
}
/**
 * displays the selected categories
 * @param {} param0 
 * @returns 
 */
const ShowSelectedCategories = ({categoriesArray, returnSelectedCategory}) => {
    
    const [selection, setSelection] = useState(categoriesArray[0]);
    const handleSelection = (category) => {
        setSelection(prevSelection => category);
        returnSelectedCategory(prevSelection => category);
    };

    return (
        // <div className='selectedCategoriesContainer'>
            <div className='displayCateg'>
                {categoriesArray.map((category) => (
                    <div key={category} className='categ' onClick={() => handleSelection(category)}>
                        <div>{category}</div>
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
const ChosenExercises = ({ExersicesList}) => {

    return(
        <div className='chosenExercises'>
            {ExersicesList && ExersicesList.map(item => (
                <div className='exersice' key={item.id} itemID={item.cId}>
                    <img src={item.image} alt={item.name} style={{width: '60px'}}/>
                    {item.name}
                </div>
            ))}
        </div>
    );
}





//////
function ExercisePlan({passCategory, addItemToList}){
    const [category, setCategory] = useState(passCategory);
    const handleAddItemToList = (item) => {
        addItemToList(item);
    }

    return(
        <div className=''>
            
            {category === "push" && <Plan returnItem={handleAddItemToList} category={category}/>}
            {category === "pull" && <Plan returnItem={handleAddItemToList} category={category}/>}
            {category === "legs" && <Plan returnItem={handleAddItemToList} category={category}/>}

            {/* {category === "custom" && <PullPlan returnItem={handleAddItemToList}/>} */}

            </div>
    );
}

function Plan({returnItem, category}){
    const handleAddItemToList = (item) => {
        returnItem(item);
    }
    return(
        <div>
            <Box className={category}>
                <SimpleTreeView className='tree'>
                    <TreeItem itemId="grid" label={category}>
                        {List.filter(item => item.group === category).map(item => (
                            <div key={item.id} itemID={item.cId}>
                                {item.name}
                                <button onClick={() => handleAddItemToList(item)}>Add</button> 
                            </div>
                        ))}
                    </TreeItem>
                </SimpleTreeView>
            </Box>   
        </div>
    );
}

function PushPlan({returnItem}){
    const handleAddItemToList = (item) => {
        returnItem(item);
    }
    return(
        <div>
            <Box className="push">
                <SimpleTreeView className='tree'>
                    <TreeItem itemId="grid" label="Push">
                        {List.filter(item => item.group === 'push').map(item => (
                            <div key={item.id} itemID={item.cId}>
                                {item.name}
                                <button onClick={() => handleAddItemToList(item)}>Add</button> 
                            </div>
                        ))}
                    </TreeItem>
                </SimpleTreeView>
            </Box>   
        </div>
    );
}
function PullPlan({returnItem}){
    const handleAddItemToList = (item) => {
        returnItem(item);
    }
    return(
        <div>
            <Box className="pull">
                <SimpleTreeView>
                    <TreeItem itemId="grid" label="Pull">
                        {List.filter(item => item.group === 'pull').map(item => (
                            <div key={item.id} itemID={item.cId}>
                                {item.name}
                                <button onClick={() => handleAddItemToList(item)}>Add</button> 
                            </div>
                        ))}
                    </TreeItem>
                </SimpleTreeView>
            </Box>
        </div>
    );
}
function LegsPlan({returnItem}){
    const handleAddItemToList = (item) => {
        returnItem(item);
    }
    return(
        <Box className="legs">
            <SimpleTreeView>
                <TreeItem itemId="grid" label="Legs">
                    {List.filter(item => item.group === 'legs').map(item => (
                        <div key={item.id} itemID={item.cId}>
                            {item.name}
                            <button onClick={() => handleAddItemToList(item)}>Add</button> 
                        </div>
                    ))}     
                </TreeItem>
            </SimpleTreeView>
        </Box> 
    );
}

function SelectCategory({ getCategory }) {
    const handleSelection = (category) => {
        getCategory(category);
    };
    return (
        <div className='selectCategory'>
            <div className='pushCategory' onClick={() => handleSelection("push")}>PUSH</div>
            <div className='pullCategory' onClick={() => handleSelection("pull")}>PULL</div>
            <div className='legsCategory' onClick={() => handleSelection("legs")}>LEGS</div>
            <div className='customCategory' onClick={() => handleSelection("custom")}>CUSTOM</div>
        </div>
    );
}