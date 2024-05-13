import { useState } from "react";

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
    const handleCategoryClick = (category) => {
        if (selectedCategories.includes(category)) {
            setSelectedCategories(selectedCategories.filter((c) => c !== category));
        } else {
            setSelectedCategories([...selectedCategories, category]);
        }
    };

    return (
        <div className='categories'>
            <div className={`tricepsCat ${selectedCategories.includes('Triceps') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Triceps')}
                style={{ backgroundColor: selectedCategories.includes('Triceps') ? 'red' : '' }}    
            >Triceps</div>
            <div className={`bicepsCat ${selectedCategories.includes('Biceps') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Biceps')}
                style={{ backgroundColor: selectedCategories.includes('Biceps') ? 'red' : '' }}    
            >Biceps</div>
            <div className={`chestCat ${selectedCategories.includes('Chest') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Chest')}
                style={{ backgroundColor: selectedCategories.includes('Chest') ? 'red' : '' }}
            >Chest</div>
            <div className={`backCat ${selectedCategories.includes('Back') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Back')}
                style={{ backgroundColor: selectedCategories.includes('Back') ? 'red' : '' }}
            >Back</div>
            <div className={`shouldersCat ${selectedCategories.includes('Shoulders') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Shoulders')}
                style={{ backgroundColor: selectedCategories.includes('Shoulders') ? 'red' : '' }}
            >Shoulders</div>
            <div className={`absCat ${selectedCategories.includes('Abs') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Abs')}
                style={{ backgroundColor: selectedCategories.includes('Abs') ? 'red' : '' }}
            >Abs</div>
            <div className={`quadsCat ${selectedCategories.includes('Quads') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Quads')}
                style={{ backgroundColor: selectedCategories.includes('Quads') ? 'red' : '' }}
            >Quads</div>
            <div className={`hamstringsCat ${selectedCategories.includes('Hamstrings') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Hamstrings')}
                style={{ backgroundColor: selectedCategories.includes('Hamstrings') ? 'red' : '' }}
            >Hamstrings</div>
            <div className={`calvesCat ${selectedCategories.includes('Calves') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Calves')}
                style={{ backgroundColor: selectedCategories.includes('Calves') ? 'red' : '' }}
            >Calves</div>
            <div className={`glutesCat ${selectedCategories.includes('Glutes') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Glutes')}
                style={{ backgroundColor: selectedCategories.includes('Glutes') ? 'red' : '' }}
            >Glutes</div>
            <div className={`forearmsCat ${selectedCategories.includes('Forearms') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Forearms')}
                style={{ backgroundColor: selectedCategories.includes('Forearms') ? 'red' : '' }}
            >Forearms</div>
            <div className={`trapsCat ${selectedCategories.includes('Traps') ? 'selected' : ''}`}
                onClick={() => handleCategoryClick('Traps')}
                style={{ backgroundColor: selectedCategories.includes('Traps') ? 'red' : '' }}
            >Traps</div>
            
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
