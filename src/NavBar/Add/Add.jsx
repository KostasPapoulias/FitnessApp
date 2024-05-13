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

export default function Add({ Exersices, onListChange, saveDate}) { 
 

    const addItemToList = (newItem) => {
        // const updatedExercises = exercises.map(exercise => ({
        //     ...exercise,
        //     date: date
        //   }));
        newItem.date = date;
        const updatedList = [...Exersices, newItem]; 
        // console.log("date: " + date);
        console.log(newItem);
        onListChange(updatedList); 
    };

    // const [date, setDate] = useState();


    // const handleDate = (newDate) => {
    //     saveDate(newDate)
    //     setDate(newDate);
    // }
    // const [category, setCategory] = useState();
    // const handleCategory = (category) => {
    //     setCategory(category);
    //     handledisplayExersicePlan();
    // }

    // const [displayExersicePlan, setdisplayExersicePlan] = useState(false);
    // const handledisplayExersicePlan = () => {
    //         setdisplayExersicePlan(!displayExersicePlan);
    // }
    // const handleBackClick = () => {
    //     if(displayExersicePlan)
    //         handledisplayExersicePlan();
    // }
    // const [addClicked, setAddClicked] = useState(false);

    // const handleAddClick = () => {
    //     setAddClicked(!addClicked);
    // };
    // const handleReturn = () => {
    //     setAddClicked(false);
    //     setAddNewClicked(false);
    // }
    // const [addNewPlanClicked, setAddNewClicked] = useState(false);
    // const handleNewPlanClicked = () => {
    //     setAddNewClicked(!addNewPlanClicked);
    //     setAddClicked(true);
    // }
    // const [selectedCategories, setSelectedCategories] = useState([]);

    // const handleSave = (category) => {
    //     setSelectedCategories(category);
        
    // };
    // const [selected, setSelectedCategory] = useState();
    // const handleSetCategory = (category) => {
    //     setSelectedCategory(category);
    // }
    // const [addNewExercisesButton, setAddNewExercisesButton] = useState();
    // const handleAddNewExercisesButton = () => {
    //     setAddNewExercisesButton(true);
    //     setShowChosenExersices(false);
    // }
    // const [showChosenExersices, setShowChosenExersices] = useState(true);
    //////////


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
        // <div className="Add">
        //     {addNewExercisesButton? !addNewPlanClicked && <AddExerciseMenu goBack={handleReturn} category={selected}/> : !addNewPlanClicked && <DisplayDefault addPlanButtonClicked={handleNewPlanClicked} categ={selectedCategories} selectedCategory={handleSetCategory} addButtonCl={handleAddNewExercisesButton} showChosenExersices={showChosenExersices}/> }
        //     {addNewPlanClicked? <AddCategoryMenu goBack={handleReturn} chosenCategories={handleSave}/> : <DisplayDefault addPlanButtonClicked={handleNewPlanClicked} categ={selectedCategories} selectedCategory={handleSetCategory} addButtonCl={handleAddNewExercisesButton} showChosenExersices={showChosenExersices}/>}
        // </div>
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
 * displayes the default view
 */
const DisplayDefault = ({selectedCategory}) => {

    // return(
    //     <div>
    //         <Add />
    //         <ChosenExercises />
    //         const handleAdd = () => {
    //     console.log("add exercise");
    //     addBclicked(true);
    //     setButtonPressed(true);
    // }
    // const handleBack = () => {
    //     setButtonPressed(false);
    // }

    const [middleNew, setMiddleNew] = useState(false);
    const handleMiddleNew = () => {
        setMiddleNew(!middleNew);
    }
    return(
        <div>
            {middleNew ? (
                <div>
                        <div className='addExercise' onClick={handleMiddleNew}>return
                        </div>
                    <AddExerciseMenu category={selectedCategory}/>

                </div>
                
            ):( 
                <div>
                    <div className='addExercise' onClick={handleMiddleNew}> 
                        {/* <Fab color="primary" aria-label="add">
                            <AddIcon onClick={handleMiddleNew}/>
                        </Fab> */}
                        add new exercise
                    </div>
                    <ChosenExercises />

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
                        {category}
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

    return(
        <div className='chosenExercises'>
            {List.map(item => (
                <div className='exersice' key={item.id} itemID={item.cId}>
                    {item.name}
                </div>
            ))}
        </div>
    );
}






////
const DdisplayDefault = ({addPlanButtonClicked, categ, selectedCategory, addButtonCl, showChosenExersices}) => {
    const handleAddPlan = () => {
        addPlanButtonClicked(true);
    }
    const handleSelectedCategory = (category) => {
        selectedCategory(category);
    }
    const handleAddButton = () => {
        addButtonCl(true);
    }
    return(
        <div>
            <TopPart newAddPlan={handleAddPlan}/>
            <ShowSelectedCategories categ={categ} returnCategorySelected={handleSelectedCategory}/>
            {showChosenExersices && <ChosenExercises />}
            <AddExerciseButton addBclicked={handleAddButton}/>
        </div>
    );
}
const TtopPart = ({newAddPlan}) =>{
    const handleNew = () => {
        newAddPlan(true);
    }
    return(
        <div className='topPart'>
            <div className='newWorkout' onClick={handleNew}>new</div>
            <div className='info'>info</div>
        </div>
    );
}
/**
 * displayes the categories that have been selected/added
 * @param {} param0 
 * @returns 
 */
const SshowSelectedCategories = ({categ, returnCategorySelected}) => {
    
    const [selection, setSelection] = useState(categ[0]);
    const handleSelection = (category) => {
        setSelection(prevSelection => category);
        returnCategorySelected(prevSelection => category);
    };

    return (
        <div className='exersices'>
            <div className='displayCateg'>
                {categ.map((category) => (
                    <div key={category} className='categ' onClick={() => handleSelection(category)}>
                        {category}
                    </div>
                ))}
            </div>
        </div>
    );
};
/**
 * the exersices that have been added
 * @returns 
 */
const CchosenExercises = () => {

    return(
        <div className='chosenExercises'>
            {List.map(item => (
                <div className='exersice' key={item.id} itemID={item.cId}>
                    {item.name}
                </div>
            ))}
        </div>
    );
}
/**
 * the button to add a new exercise
 * @param {*} param0 
 * @returns 
 */
const AaddExerciseButton = ({addBclicked}) => {
    const [buttonPressed, setButtonPressed] = useState(false);  

    const handleAdd = () => {
        console.log("add exercise");
        addBclicked(true);
        setButtonPressed(true);
    }
    const handleBack = () => {
        setButtonPressed(false);
    }
    return(
        <div>
            {buttonPressed ? (
                <div className='addExercise'>
                    <Fab color="primary" aria-label="add">
                        <AddIcon onClick={handleAdd}/>
                    </Fab>
                </div>
            ):( <div className='addExercise' onClick={handleBack}>return</div>

            )
        }</div>
    );
};



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