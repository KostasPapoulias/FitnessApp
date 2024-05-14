import './NavBar.css'
import Home from './Home/Home.jsx'
import Add from './Add/Add.jsx'
import { useState } from 'react'
import StartIcon from './Start/StartIcon.jsx'
import Add_Icon from './Add/AddIcon.jsx'
import HomeIcon from './Home/HomeIcon.jsx'
import Start from './Start/Start.jsx'
import Exersices from './Exersices.jsx'

export default function NavBar(){

    const [isHomePressed, setIsHomePressed] = useState(true);
    const [isAddPressed, setIsAddPressed] = useState(false);
    const [isStartPressed, setIsStartPressed] = useState(false);

    const handleHomePress = () => {
        setIsHomePressed(true);
        setIsAddPressed(false);
        setIsStartPressed(false);
    };
    const handleAddPress = () => {
        setIsAddPressed(true);
        setIsStartPressed(false);
        setIsHomePressed(false);
    };
    const handleStartPress = () => {
        setIsStartPressed(true);
        setIsAddPressed(false);
        setIsHomePressed(false);
    }

    const [list, setListItems] = useState(Exersices); 

    const handleListChange = (newList) => {
        setListItems(newList);
      }
    const [date, setDate] = useState();  

    const handleDate = (newDate) => {
        // setDate(newDate);
        // console.log(newDate);
    }

    return(
        <div className="NavBar">
            <HomeIcon onHomePress={handleHomePress} isHomePressed={isHomePressed}/>
            <Add_Icon onAddPress={handleAddPress} isaAddPressed={isAddPressed}/>
            <StartIcon onStartPress={handleStartPress} isStartPressed={isStartPressed}/>  
                      
            {isAddPressed && <Add Exersices={list} onListChange={handleListChange} saveDate={handleDate}/>}

            {isHomePressed && <Home Exersices={list} />}
            {isStartPressed && <Start />}
            
        </div>
    );

}