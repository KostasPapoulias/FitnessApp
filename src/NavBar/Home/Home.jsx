import './Home.css'
import Box from '@mui/material/Box';
import * as React from 'react';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import { useState } from 'react';
// import HomeList from './HomeList.jsx';
import DatePicker from '../Date';

export default function({Exersices}){
    
    const [homeDate, setDate] = useState(new Date().toISOString().slice(0, 10));
    // const currentDate = data.toISOString().slice(0, 10); // format YYYY-MM-DD

    const handleDate = (newDate) =>{
        setDate(newDate);
        // console.log("date in home: " + homeDate)
    };

    return(
        <div className="Home">
            <div className='welcome'>
                <div style={{ fontFamily: "Copperplate, Fantasy" }}>
                    Hello, Kostas 
                </div>
            <br />
            Your schedule:
            </div>
            <DatePicker saveDate={handleDate}/>
            <br/>
            <Box className="push" >
                <SimpleTreeView className='tree'>
                    <TreeItem itemId="grid" label="Push">
                        <ul>
                            {Exersices.filter(item => (item.group === 'push' && item.date === homeDate)).map((item, index) => (
                                <li key={index}>{item.name}</li>
                            ))}
                        </ul>
                    </TreeItem>
                </SimpleTreeView>
            </Box>
            <Box className="pull" >
                <SimpleTreeView className='tree'>
                    <TreeItem itemId="grid" label="Pull">
                        <ul>
                            {Exersices.filter(item => (item.group === 'pull' && item.date === homeDate)).map((item, index) => (
                                <li key={index}>{item.name}</li>
                            ))}
                        </ul>
                    </TreeItem>
                </SimpleTreeView>
            </Box>
            <Box className="legs" >
                <SimpleTreeView className='tree'>
                    <TreeItem itemId="grid" label="Legs">
                        <ul>
                            {Exersices.filter(item => (item.group === 'legs' && item.date === homeDate)).map((item, index) => (
                                <li key={index}>{item.name}</li>
                            ))}
                        </ul>
                    </TreeItem>
                </SimpleTreeView>
            </Box>
            
        </div>
    );
}