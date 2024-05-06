import './Home.css'
import Box from '@mui/material/Box';
import * as React from 'react';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import { useState } from 'react';
// import HomeList from './HomeList.jsx';

export default function({Exersices}){
   

    return(
        <div className="Home">
            <Box className="push" >
                <SimpleTreeView className='tree'>
                    <TreeItem itemId="grid" label="Push">
                        <ul>
                            {Exersices.map((item, index) => (
                                <li key={index}>{item.name}</li>
                            ))}
                        </ul>
                    </TreeItem>
                </SimpleTreeView>
            </Box>
            
        </div>
    );
}