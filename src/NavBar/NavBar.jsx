import './NavBar.css'

import Home from './Home/Home.jsx';
import Add from './Add/Add.jsx';
import StartIcon from './Start/StartIcon.jsx';
import Add_Icon from './Add/AddIcon.jsx';
import HomeIcon from './Home/HomeIcon.jsx';
import Start from './Start/Start.jsx';
import { useSelector, useDispatch } from 'react-redux';
import { useNavBarLogic } from './logic/NavBarLogic';

export default function NavBar() {
    // Use custom logic hook for NavBar state
    const {
        isHomePressed,
        isAddPressed,
        isStartPressed,
        handleHomePress,
        handleAddPress,
        handleStartPress,
    } = useNavBarLogic();

    // Redux state for exercises list (example)
    const list = useSelector((state) => state.exercises);
    const dispatch = useDispatch();

    // Placeholder for list change and date save handlers
    const handleListChange = (newList) => {
        // Example: dispatch({ type: 'SET_EXERCISES', payload: newList });
        // If using slice: dispatch(setExercises(newList));
        // setListItems(newList); // If local state needed
    };
    const handleDate = (newDate) => {
        // Example: dispatch(setDate(newDate));
    };

    return (
        <div className="NavBar">
            <HomeIcon onHomePress={handleHomePress} isHomePressed={isHomePressed} />
            <Add_Icon onAddPress={handleAddPress} isaAddPressed={isAddPressed} />
            <StartIcon onStartPress={handleStartPress} isStartPressed={isStartPressed} />

            {isAddPressed && <Add Exersices={list} onListChange={handleListChange} saveDate={handleDate} />}
            {isHomePressed && <Home />}
            {isStartPressed && <Start />}
        </div>
    );
}