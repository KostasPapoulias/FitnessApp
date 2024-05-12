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

    const [date, setDate] = useState();


    const handleDate = (newDate) => {
        saveDate(newDate)
        setDate(newDate);
    }
    const [category, setCategory] = useState();
    const handleCategory = (category) => {
        setCategory(category);
        handledisplayExersicePlan();
    }

    const [displayExersicePlan, setdisplayExersicePlan] = useState(false);
    const handledisplayExersicePlan = () => {
            setdisplayExersicePlan(!displayExersicePlan);
    }
    const handleBackClick = () => {
        if(displayExersicePlan)
            handledisplayExersicePlan();
    }
    const [addClicked, setAddClicked] = useState(false);

    const handleAddClick = () => {
        setAddClicked(!addClicked);
    };
    const handleReturn = () => {
        setAddClicked(false);
    }
    

    return (
        <div className="Add">
            
            {addClicked? <AddExerciseMenu goBack={handleReturn}/> : <DisplayDefault clicked={handleAddClick}/>}
        </div>
    );
}

const DisplayDefault = ({clicked}) => {
    const handleAddClick = () => {
        clicked(true);
    }
    return(
        <div>
            <TopPart />
            <CategoriesProgress />
            <ChosenExercises />
            <AddExercise clicked={handleAddClick}/>
        </div>
    );
}
const TopPart = () =>{
    return(
        <div className='topPart'>
            <div className='newWorkout'>new</div>
            <div className='info'>info</div>
        </div>
    );
}

const CategoriesProgress = () => {
    return(
        <div className='categoriesProgress'>
            <div className='pushProgress'>push</div>
            <div className='pullProgress'>pull</div>
            <div className='legsProgress'>legs</div>
        </div>
    );
}

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
const AddExercise = ({clicked}) => {
    const handleClick = () => {
        console.log("add exercise");
        clicked(true);
    
    }
    return(
        <div className='addExercise'>
            <Fab color="primary" aria-label="add">
                <AddIcon onClick={handleClick}/>
            </Fab>
        </div>
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