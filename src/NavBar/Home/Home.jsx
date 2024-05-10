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
    const push = (Exersices.some(item => (item.group === 'push')) && Exersices.some(item => (item.date === homeDate)));
    const pull = (Exersices.some(item => (item.group === 'pull')) && Exersices.some(item => (item.date === homeDate)));
    const legs = (Exersices.some(item => (item.group === 'legs')) && Exersices.some(item => (item.date === homeDate)));
    const custom = (push && pull) || (push && legs) || (pull && legs);



    return(
        <div className="Home">
            {/* {console.log("push: "+push+" pull: "+pull + " legs: "+legs+" custom: "+custom)} */}
            <div className='welcome'>
                <div style={{ fontFamily: "Copperplate, Fantasy" }}>
                    Hello, Kostas 
                </div>
            <br />
            Your schedule:
            </div>
            <DatePicker saveDate={handleDate}/>
            <br/>

            <div ></div>

            {push && <Plan Exersices={Exersices} homeDate={homeDate} category={'push'} />}
            {pull && <Plan Exersices={Exersices} homeDate={homeDate} category={'pull'} />}
            {legs && <Plan Exersices={Exersices} homeDate={homeDate} category={'legs'} />}
            
            
        </div>
    );
}

function Plan({category , Exersices, homeDate}){
    return(
        <Box className = {category} >
            <SimpleTreeView className='tree'>
                <TreeItem itemId="grid" label={category}>
                    <ul>
                        {Exersices.filter(item => (item.group === category && item.date === homeDate)).map((item, index) => (
                            <li key={index}>{item.name}</li>
                        ))}
                    </ul>
                </TreeItem>
            </SimpleTreeView>
        </Box>
    );
}