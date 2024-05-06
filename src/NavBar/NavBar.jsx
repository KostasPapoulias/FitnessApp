import './NavBar.css'
import Home from './Home/Home.jsx'
import Add from './Add/Add.jsx'
import { useState } from 'react'
import ProfileIcon from './Profile/ProfileIcon.jsx'
import Add_Icon from './Add/AddIcon.jsx'
import HomeIcon from './Home/HomeIcon.jsx'
import Profile from './Profile/Profile.jsx'
import Exersices from './Exersices.jsx'

export default function NavBar(){

    const [isHomePressed, setIsHomePressed] = useState(true);
    const [isAddPressed, setIsAddPressed] = useState(false);
    const [isProfilePressed, setIsProfilePressed] = useState(false);

    const handleHomePress = () => {
        setIsHomePressed(true);
        setIsAddPressed(false);
        setIsProfilePressed(false);
    };
    const handleAddPress = () => {
        setIsAddPressed(true);
        setIsProfilePressed(false);
        setIsHomePressed(false);
    };
    const handleProfilePress = () => {
        setIsProfilePressed(true);
        setIsAddPressed(false);
        setIsHomePressed(false);
    }

    const [list, setListItems] = useState(Exersices); // Assuming Data is defined somewhere

    const handleListChange = (newList) => {
        setListItems(newList);
      }

    return(
        <div className="NavBar">
            <HomeIcon onHomePress={handleHomePress}/>
            <Add_Icon onAddPress={handleAddPress}/>
            <ProfileIcon onProfilePress={handleProfilePress}/>  
                      
            {isAddPressed && <Add Exersices={list} onListChange={handleListChange}/>}

            {isHomePressed && <Home Exersices={list}/>}
            {isProfilePressed && <Profile />}
            
        </div>
    );

}