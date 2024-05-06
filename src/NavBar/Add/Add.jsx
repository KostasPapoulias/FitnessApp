import React, { useState } from 'react';
import './Add.css';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import AddIcon from '@mui/icons-material/Add';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import List from './List';

export default function Add({ Exersices, onListChange }) { 
 

    const addItemToList = (newItem) => {
        const updatedList = [...Exersices, newItem]; 
        console.log(newItem);
        onListChange(updatedList); 
    };

    return (
        <div className="Add">
            <Box className="push">
                <SimpleTreeView className='tree'>
                    <TreeItem itemId="grid" label="Push">
                        {List.filter(item => item.group === 'push').map(item => (
                            <div key={item.id} itemID={item.cId}>
                                {item.name}
                                <button onClick={() => addItemToList(item)}>Add</button> 
                            </div>
                        ))}
                    </TreeItem>
                </SimpleTreeView>
            </Box>
            <Box className="pull">
                <SimpleTreeView>
                    <TreeItem itemId="grid" label="Pull">
                        {List.filter(item => item.group === 'pull').map(item => (
                            <div key={item.id} itemID={item.cId}>
                                {item.name}
                                <button onClick={() => addItemToList(item)}>Add</button> 
                            </div>
                        ))}
                    </TreeItem>
                </SimpleTreeView>
            </Box>
            <Box className="legs">
                <SimpleTreeView>
                    <TreeItem itemId="grid" label="Legs">
                        {List.filter(item => item.group === 'legs').map(item => (
                            <div key={item.id} itemID={item.cId}>
                                {item.name}
                                <button onClick={() => addItemToList(item)}>Add</button> 
                            </div>
                        ))}     
                    </TreeItem>
                </SimpleTreeView>
            </Box>
        </div>
    );
}

