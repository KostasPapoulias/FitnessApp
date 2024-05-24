import { useState } from "react";
import triceps from '../../../pictures/traps_files/Triceps.png';
import biceps from '../../../pictures/traps_files/Biceps.png';
import abs from '../../../pictures/traps_files/Abs.png';
import calves from '../../../pictures/traps_files/Calves.png';
import chest from '../../../pictures/traps_files/Chest.png';
import forearms from '../../../pictures/traps_files/Forearms.png';
import glutes from '../../../pictures/traps_files/Glutes.png';
import hamstrings from '../../../pictures/traps_files/Hamstrings.png';
import quads from '../../../pictures/traps_files/Quads.png';
import shoulders from '../../../pictures/traps_files/Shoulders.png';
import lats from '../../../pictures/traps_files/Lats.png';
import traps from '../../../pictures/traps_files/Traps.png';
import './AddCategoryMenu.css';
import { useDispatch } from 'react-redux';

const AddCategoryMenu = ({ goBack,  chosenCategories}) => {
    const [selectedCategories, setSelectedCategories] = useState([]);

    const handleSave = () => {
        // Do something with the selected categories
        if(selectedCategories.length !== 0)
            setSavePressed(true);
        console.log(selectedCategories);
        chosenCategories(selectedCategories);
        goBack(true);
    };

    const handleReturn = () => {
        savePressed ? setSavePressed(false) : goBack(true);
    };

    const [savePressed, setSavePressed] = useState(false);


    return (
        <div className='addCategoryMenu'>
            <TopPartMenu goBack={handleReturn} onSave={handleSave} />
            <Categories
                selectedCategories={selectedCategories}
                setSelectedCategories={setSelectedCategories}
            />
        </div>
    );
};

const Categories = ({ selectedCategories, setSelectedCategories }) => {
    const dispatch = useDispatch();

    const handleCategoryClick = (category) => {
        if (selectedCategories.includes(category)) {
            setSelectedCategories(selectedCategories.filter((c) => c !== category));
        } else {
            setSelectedCategories([...selectedCategories, category]);
        }
        dispatch({ type: 'ADD_CATEGORY', payload: category });
    };

    return (
        <div className='categories'>
            <div className={`tricepsCat ${selectedCategories.includes('Triceps') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Triceps')}
                style={{ backgroundColor: selectedCategories.includes('Triceps') ? 'red' : '' }}  
            >
                <div>Triceps</div>
                <img src={triceps} alt="triceps" style={{width: '110px'}}/>
            </div>
            <div className={`bicepsCat ${selectedCategories.includes('Biceps') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Biceps')}
                style={{ backgroundColor: selectedCategories.includes('Biceps') ? 'red' : '' }}    
            >
                <div>Biceps</div>
                <img src={biceps} alt="biceps" style={{width: '110px'}}/>

            </div>
            <div className={`chestCat ${selectedCategories.includes('Chest') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Chest')}
                style={{ backgroundColor: selectedCategories.includes('Chest') ? 'red' : '' }}
            >
                <div>Chest</div>
                <img src={chest} alt="chest" style={{width: '110px'}}/>
                </div>
            <div className={`latsCat ${selectedCategories.includes('Lats') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Lats')}
                style={{ backgroundColor: selectedCategories.includes('Lats') ? 'red' : '' }}
            >
                <div>Lats</div>
                <img src={lats} alt="lats" style={{width: '99px'}}/>
            </div>
            <div className={`shouldersCat ${selectedCategories.includes('Shoulders') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Shoulders')}
                style={{ backgroundColor: selectedCategories.includes('Shoulders') ? 'red' : '' }}
            >
                <div>Shoulders</div>
                <img src={shoulders} alt="shoulders" style={{width: '99px'}}/>
                </div>
            <div className={`absCat ${selectedCategories.includes('Abs') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Abs')}
                style={{ backgroundColor: selectedCategories.includes('Abs') ? 'red' : '' }}
            >
                <div>Abs</div>
                <img src={abs} alt="abs" style={{width: '99px'}}/>
            </div>
            <div className={`quadsCat ${selectedCategories.includes('Quads') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Quads')}
                style={{ backgroundColor: selectedCategories.includes('Quads') ? 'red' : '' }}
            >
                <div>Quads</div>
                <img src={quads} alt="quads" style={{width: '100px'}}/>            
            </div>
            <div className={`hamstringsCat ${selectedCategories.includes('Hamstrings') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Hamstrings')}
                style={{ backgroundColor: selectedCategories.includes('Hamstrings') ? 'red' : '' }}
            >
                <div>Hamstrings</div>
                <img src={hamstrings} alt="hamstrings" style={{width: '100px'}}/>
            </div>
            <div className={`calvesCat ${selectedCategories.includes('Calves') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Calves')}
                style={{ backgroundColor: selectedCategories.includes('Calves') ? 'red' : '' }}
            >
                <div>Calves</div>
                <img src={calves} alt="calves" style={{width: '100px'}}/>            
            </div>
            <div className={`glutesCat ${selectedCategories.includes('Glutes') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Glutes')}
                style={{ backgroundColor: selectedCategories.includes('Glutes') ? 'red' : '' }}
            >
                <div>Glutes</div>
                <img src={glutes} alt="glutes" style={{width: '99px'}}/>
            </div>
            <div className={`forearmsCat ${selectedCategories.includes('Forearms') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Forearms')}
                style={{ backgroundColor: selectedCategories.includes('Forearms') ? 'red' : '' }}
            >
                <div>Forearms</div>
                <img src={forearms} alt="forearms" style={{width: '99px'}}/>
            </div>
            <div className={`trapsCat ${selectedCategories.includes('Traps') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Traps')}
                style={{ backgroundColor: selectedCategories.includes('Traps') ? 'red' : '' }}
            >
                <div>Traps</div>
                <img src={traps} alt="traps" style={{width: '107px'}}/>
                </div>
            
        </div>
    );
};
const TopPartMenu = ({ goBack, onSave }) => {
    const handleClick = () => {
        goBack(true);
    };

    const handleSaveClick = () => {
        onSave();
    };

    return (
        <div className='topPartMenu'>
            <div className='return' onClick={handleClick}>
                Return
            </div>
            <div className='save' onClick={handleSaveClick}>
                Save
            </div>
        </div>
    );
};

export {AddCategoryMenu}
