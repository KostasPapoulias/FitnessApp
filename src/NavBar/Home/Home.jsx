import './Home.css'
import * as React from 'react';
import { useState } from 'react';
import DatePicker from '../Date';
import Human from './Human';
// import Test from './Test';

export default function(){
    
    const [homeDate, setDate] = useState(new Date().toISOString().slice(0, 10));
    // const currentDate = data.toISOString().slice(0, 10); // format YYYY-MM-DD

    const handleDate = (newDate) =>{
        setDate(newDate);
        // console.log("date in home: " + homeDate)
    };
    

    return(
        <div className="Home">
            
            {/* <Human /> */}
            <Human />      
            
        </div>
    );
}

