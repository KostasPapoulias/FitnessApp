import React, { useState } from 'react';
import './Add.css';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import AddIcon from '@mui/icons-material/Add';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import List from './List';
import DatePicker from '../Date';

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
    

    return (
        <div className="Add">
            <div className='backToSelect' onClick={handleBackClick}>&lt;</div>
            <DatePicker saveDate={handleDate}/>
            {!displayExersicePlan && <SelectCategory getCategory={handleCategory}/>}
            {displayExersicePlan && <ExercisePlan passCategory={category} addItemToList={addItemToList}/>}
        </div>
    );
}

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