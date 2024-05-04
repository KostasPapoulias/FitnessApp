import './Add.css'
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import AddIcon from '@mui/icons-material/Add';
import * as React from 'react';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import { useState } from 'react';
import List from './List.jsx';

function BasicSimpleTreeView() {
  return (
    <Box sx={{ height: 220, flexGrow: 1, maxWidth: 400 }}>
      <SimpleTreeView>
        <TreeItem itemId="grid" label="Data Grid">
          <TreeItem itemId="grid-community" label="@mui/x-data-grid" />
          <TreeItem itemId="grid-pro" label="@mui/x-data-grid-pro" />
          <TreeItem itemId="grid-premium" label="@mui/x-data-grid-premium" />
        </TreeItem>
      </SimpleTreeView>
    </Box>
  );
}

export default function Add(){

    const [isPushPressed, setIsPush] = useState(false);


    const handlePush = () =>{
        setIsPush(!isPushPressed);
    }

    return(
        <div className="Add">
            {/* <div className='push' onClick={handlePush}>Push</div> */}
            <Box className="push" >
                <SimpleTreeView className='tree'>
                    <TreeItem itemId="grid" label="Push">
                        {/* <TreeItem itemId="grid-community" label="Bench Press" />
                        <TreeItem itemId="grid-pro" label="Arnold Press" />
                        <TreeItem itemId="grid-premium" label="Lateral Extension" /> */}
                        {List.map(item => (
                            <div key={item.id} itemID={item.cId}>{item.name}</div>
                        ))}
                    </TreeItem>
                </SimpleTreeView>
            </Box>
            {/* <div className='pull'>Pull</div> */}
            <Box className="pull" >
                <SimpleTreeView>
                    <TreeItem itemId="grid" label="Pull">
                        <TreeItem itemId="grid-community" label="Barbell Row" />
                        <TreeItem itemId="grid-pro" label="Lateral Pulldown" />
                        <TreeItem itemId="grid-premium" label="Dumbell Curl" />
                    </TreeItem>
                </SimpleTreeView>
            </Box>
            {/* <div className='legs'>Legs</div> */}
            <Box className="legs" >
                <SimpleTreeView>
                    <TreeItem itemId="grid" label="Legs">
                        <TreeItem itemId="grid-community" label="Barbell Squat" />
                        <TreeItem itemId="grid-pro" label="Roumanian Deadlift" />
                        <TreeItem itemId="grid-premium" label="Hip Thrust" />
                    </TreeItem>
                </SimpleTreeView>
            </Box>
            {/* {isPushPressed && <BasicSimpleTreeView />} */}
        </div>
    );
}
